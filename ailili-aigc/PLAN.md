# ailili-aigc 实施计划

把四个 skill 的**网关底座**换成本地二进制；Agent 编排仍走 skill。Skill 脚本用 **Node（`.cjs`）**，对齐 `gpt-image-2/skills/gpt-image-2-skill/scripts`，不再用 Python。

本文件是实施计划，不是 Agent 操作卡。

---

## 1. 目标

四个 skill（生图、生文、品牌基因、商品套图）继续当 Agent 入口。换掉的是：

```
现在：python aigc_*.py  →  POST 远程 /aigc/imageGenAsync|textGenAsync
以后：node  aigc_*.cjs  →  POST 本地 ailili-aigc daemon /aigc/imageGenAsync|textGenAsync
                              └─ 内部入队 gpt-image-2 队列 / chat completions
```

- 生图、生文模型走本地 config（OpenAI-compatible / Codex）。暂不接 `BANANA_PRO`、`GEM_3_1_PRO`。
- `gpt-image-2` 的 HTTP daemon、任务队列、history、本地文件 URL、storage **留着**，用来模拟异步网关（`taskId` + 轮询 + 可下载结果）。
- 透明抠图、Tauri 桌面不是本项目主路径。

非目标（本阶段不做）：

- 重写套图的 Agent 确认环（`AskUserQuestion`、计划表 markdown 转发）
- 把 Agent 改成直接调 `gpt-image-2-skill images edit --no-wait`
- 登录/积分 onboarding（本地网关不需要云端账号）
- 视频 URL 进 textgen

---

## 2. 仓库布局

```
ailili-skills/
  gpt-image-2/                 # 原产品 skill / web（core+runtime 已迁走）
  ailili-aigc/                 # 本项目
    PLAN.md                    # 本文件
    Cargo.toml
    crates/
      ailili-aigc/             # CLI：daemon start|stop|status
      ailili-aigc-server/      # /aigc 路径 + text 任务
    scripts/lib/               # Node 共享运行时（paths / http / nl）
    skills/
      ailili-aigc-imagegen/
      ailili-aigc-textgen/
      ailili-aigc-imagegen-brand-gene-extract/
      ailili-aigc-imagegen-product/
  仓库根目录原 Python skill     # 只作协议对照，运行时不要再调
```

依赖方向：`ailili-aigc-server` path-dep `crates/gpt-image-2-core` 与 `crates/gpt-image-2-runtime`（crate 名不变）。

---

## 3. 分层

```
Agent
  cwd = skill 根目录
  调：node scripts/aigc_imagegen.cjs '<JSON>'
      node scripts/aigc_textgen.cjs --stdin [--content-only]
        │
        ▼
Node 短客户端（本仓库 scripts/）
  AILILI_TOOL_GATEWAY（默认 http://127.0.0.1:8788）
  保证 daemon 在听（loopback 时）
  POST /aigc/*  →  { taskId }
  轮询 /aigc/taskQuery|textTaskQuery
  落盘 session 目录，stdout 保持现有契约
        │
        ▼
ailili-aigc daemon  http://127.0.0.1:8788   （不要占用 gpt-image-2 的 8787）
  兼容路由（/aigc 字段）
  映射到内部队列
        │
        ├─ 生图 → gpt-image-2 队列（Edit，imageUrls 拉成 refs）
        └─ 生文 → 本 crate 的 QueuedTask::Text → chat/completions
```

端口：gpt-image-2 原 daemon 默认 `8787`。本项目默认 **`8788`**，避免两套进程抢端口。也允许只起 ailili-aigc，内部嵌 gpt-image-2 的 `run_api_only` 或直接调 core/runtime，不必再起第二个进程。

推荐实现：**一个** ailili-aigc 进程：

- 对外：`/aigc/imageGenAsync`、`/aigc/taskQuery`、`/aigc/textGenAsync`、`/aigc/textTaskQuery`
- 对内：复用 `gpt-image-2-runtime` 队列；把 `QueuedTask` 扩成 `Generate | Edit | Text`（Text 在本 crate 扩展，避免强改上游枚举时可包一层自己的队列）

若上游 `QueuedTask` 不好改：ailili-aigc 自管队列，worker 里对生图调用 `gpt-image-2-core` 的 edit/generate，对生文自己打 chat API。队列/history/文件 URL 仍按 gpt-image-2 那套做（抄 skill crate 的 daemon 起停）。

---

## 4. Node 而不是 Python

所有 Agent 可见入口改为：

| 原 Python | 新 Node |
|---|---|
| `python scripts/aigc_imagegen.py '<JSON>'` | `node scripts/aigc_imagegen.cjs '<JSON>'` |
| `python scripts/aigc_textgen.py --stdin [--content-only]` | `node scripts/aigc_textgen.cjs --stdin [--content-only]` |
| `python scripts/save_brand_gene.py` | `node scripts/save_brand_gene.cjs` |
| `python scripts/run_collection_pipeline.py` | `node scripts/run_collection_pipeline.cjs`（阶段 4） |
| `python scripts/onboarding.py` | 本地模式不需要；阶段外再定 |

约定（对齐 gpt-image-2-skill）：

- 只用 Node 内置模块（`node:fs` / `http` / `https` / `path` / `child_process`），**不** `npm i`
- shebang：`#!/usr/bin/env node`
- 共享逻辑放 `ailili-aigc/scripts/lib/`，skill 脚本 `require` 相对路径；打包单个 skill 时再 vendoring
- Windows / macOS / Linux 都走 `node …cjs`；Rust 二进制只给 daemon，不要求 Agent 直接调 `.exe`（可在 SKILL.md 写 daemon 启动用 exe）

生图/生文 **短客户端已是 Rust**（`ailili-aigc imagegen|textgen`）。Node `.cjs` 只找二进制并转发 argv，不再自己打 HTTP。

stdout 契约先保持与原 Python 一致，减少编排 skill 改动：

- imagegen：`Saved full response: ["…png"]` 或失败时 data json 路径
- textgen：stdout 可 `JSON.parse`；`--content-only` 为单行 content；换行压成 `⏎`

---

## 5. 兼容层字段映射

### 5.1 生图 `POST /aigc/imageGenAsync`

入参（skill 已有）→ 内部 Edit（网关强制 `imageUrls`）：

| 网关 | 内部 |
|---|---|
| `prompt` | `prompt`（先 `decode_nl`） |
| `imageUrls[]` | 本地路径 / `file://` / http(s) / `data:` → `refs: [{name, bytes}]` |
| `outputNum` | `n` |
| `quality` | `quality` |
| `resolution` + `aspectRatio` | `size`（见下表） |
| `provider` | **忽略**，用 `default_image_provider` |

分辨率（先写死，可再调）：

| resolution | aspectRatio | size |
|---|---|---|
| 1K | 1:1 | 1024x1024 |
| 1K | 16:9 | 1024x576 |
| 1K | 9:16 | 576x1024 |
| 2K | 1:1 | 2048x2048 |
| 2K | 16:9 | 2048x1152 |
| 2K | 9:16 | 1152x2048 |
| 4K | 1:1 | 3840x3840（若上游拒，降到 3840x2160 并记 warning） |
| 4K | 16:9 | 3840x2160 |
| 4K | 9:16 | 2160x3840 |

A+ 比例（1464:600 等）按宽高比映射到不超过上游上限的 `WxH`（边长 16 倍数）。

立即返回：`{ "taskId": "<job_id>" }`。

### 5.2 生图 `POST /aigc/taskQuery`

内部 job status → 网关：

| 内部 | 网关 `status` |
|---|---|
| queued / running | `PROCESSING` |
| completed | `SUCCESS` |
| failed / canceled | `FAILED` |

`SUCCESS` 时 `resultList[] = [{ id, url, type: "image" }]`。`url` 必须是 Node `download_media` 能 GET 的 HTTP URL（`http://127.0.0.1:8788/api/jobs/{id}/outputs/{i}` 或 storage 的 public URL）。不要给 `file://`。

### 5.3 生文（gpt-image-2 现在没有，必须新写）

`POST /aigc/textGenAsync`：`prompt`、`imageUrls`（可空）、忽略 `model` / `thinkingLevel`，用 `default_text_provider`。

内部：OpenAI-compatible `POST {api_base}/chat/completions`，多模态时把 `imageUrls` 做成 `image_url` parts。

`POST /aigc/textTaskQuery` → `{ taskId, status, content, errorMsg }`。

### 5.4 鉴权

- loopback：无 key 也可入队
- 若设置了 `AILILI_AIGC_TOKEN`，请求头 `Authorization` 对得上才放行
- Node 客户端：loopback 时 key 可选；非 loopback 仍要求 key（兼容对照真实网关）

---

## 6. 配置

一份配置：`$AILILI_AIGC_HOME/config.json`，否则 `$CODEX_HOME/ailili-aigc/config.json`，否则 `~/.ailili-aigc/config.json`。生图与生文的 provider 都写在这里；daemon 把 gpt-image-2 的 `GPT_IMAGE_2_CONFIG_FILE` / history / jobs 指到同一 home。若统一配置还没有生图默认，会从 `$CODEX_HOME/gpt-image-2-skill/config.json` 迁入一次。

```json
{
  "version": 1,
  "default_provider": "local-image",
  "default_image_provider": "local-image",
  "default_text_provider": "local-text",
  "providers": {
    "local-image": {
      "type": "openai-compatible",
      "capability": "image",
      "api_base": "https://api.example.com/v1",
      "model": "gpt-image-2",
      "credentials": { "api_key": { "source": "env", "env": "OPENAI_API_KEY" } }
    },
    "local-text": {
      "type": "openai-compatible",
      "capability": "text",
      "api_base": "https://api.example.com/v1",
      "model": "gpt-4.1",
      "credentials": { "api_key": { "source": "env", "env": "OPENAI_API_KEY" } }
    }
  }
}
```

CLI：`ailili-aigc config inspect|add-provider`（inspect 脱敏）。以后加 `BANANA_PRO` 只是再 add-provider 并在兼容层做名字映射。

---

## 7. 阶段

### 阶段 0 — 仓库就位（本轮）

- [x] `gpt-image-2/` 收纳 crates / skills / docs / Cargo.*
- [x] `ailili-aigc/` 立项：PLAN、Cargo workspace、Node 共享库
- [x] imagegen / textgen / save_brand_gene 的 Node 客户端（契约对齐原 Python）
- [ ] `cargo build -p gpt-image-2-skill` 在 `gpt-image-2/` 下能过
- [x] `cargo build -p ailili-aigc` CLI 能过

### 阶段 1 — 假网关能出一张图

- [x] ailili-aigc daemon：loopback、breakaway/setsid
- [x] `/aigc/imageGenAsync` + `/aigc/taskQuery` + 结果图 HTTP URL
- [x] 网关环境变量 `AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）
- [x] Node 客户端 loopback 时自动 `daemon start`
- [x] `AILILI_AIGC_FAKE_IMAGE=1` 时 Node 客户端 stdout 为 `Saved full response: ["…png"]`（已本地 smoke）
- [x] 生图/生文共用 `$AILILI_AIGC_HOME/config.json`（`default_image_provider` / `default_provider` + `default_text_provider`）

### 阶段 2 — 生文

- [x] 本 crate 自管 text 任务（不改 gpt-image-2 `QueuedTask`），worker 打 OpenAI-compatible `chat/completions`
- [x] `/aigc/textGenAsync` + `/aigc/textTaskQuery`
- [x] Node `--content-only` / `⏎` 不变；loopback 自动 `daemon start`
- [x] `default_text_provider`（与生图同一份 `$AILILI_AIGC_HOME/config.json`）或 `OPENAI_API_KEY`
- [x] `AILILI_AIGC_FAKE_TEXT=1`（或 `AILILI_AIGC_FAKE_IMAGE=1`）stub 生文

### 阶段 3 — 品牌基因

- [x] `node scripts/extract_brand_gene.cjs`：组 prompt → textgen → 抽 JSON → 缺字段兜底 → 落盘
- [x] `brandKey` 默认值与 brandColor/fontStyle 透传
- [x] Agent 操作卡改为一条命令；`save_brand_gene.cjs` 仍可单独落盘

### 阶段 4 — 商品套图

- [x] `build_textgen_params.cjs` / `build_imagegen_prompt.cjs`（WHITE_BG 从 `references/types/white-bg.md` 抽正文）
- [x] `run_collection_pipeline.cjs --phase plan|dispatch|status|summary`
- [x] dispatch **立即**返回 `dispatch_started`，后台跑 `run_one_task.cjs`；用 `--phase status` 轮询
- [x] summary 打含 `![]()` 的 markdown + asset manifest
- [x] Agent 仍负责确认环（AskUserQuestion）

### 阶段 5 — 上游名字（以后）

`BANANA_PRO` → `default_image_provider` 或 named mapping；`GEM_3_1_PRO` → text provider。队列不用再改。

---

## 8. 验收

1. 只设本地网关与模型 key，imagegen 客户端能出图并落 `ailili/<date>/<session>/media/`。
2. textgen `--content-only` 得到单行（含 `⏎`），exit 0。
3. 品牌基因写出字段齐全的 JSON 到 `data/`。
4. 商品单张 SCENE：textgen → imagegen，对话里能展示本地 png。
5. 套图：plan 表 → 用户确认 → dispatch 入队 → summary 含 `![]()`。
6. `gpt-image-2` 树保持原产品名；网关代码只在 `ailili-aigc/`。

---

## 9. 风险

| 风险 | 处理 |
|---|---|
| gpt-image-2 无 text | 阶段 2 必须做，否则 product/brand-gene 空转 |
| 4K 正方形超过上游像素上限 | 映射表降级并在 taskQuery `errorMsg`/日志说明 |
| 双 daemon 抢 8787 | ailili-aigc 默认 8788，或单进程内嵌队列 |
| Node `require` 共享 lib 在 skill 被单独安装后失效 | 阶段 5 前把 lib vendoring 进各 skill `scripts/lib/` |
| 原 Python skill 与新 Node 并存 | 文档写明只用 `ailili-aigc/skills`；根目录原 Python skill 只读对照 |

---

## 10. 建议 PR 切分

| PR | 内容 |
|---|---|
| PR0 | 目录迁入 + 本 PLAN + Node 客户端骨架（本轮） |
| PR1 | ailili-aigc daemon + 生图兼容路由 |
| PR2 | 生文任务 + text 兼容路由 |
| PR3 | 品牌基因一条命令 |
| PR4 | 商品单张 Node 链路 |
| PR5 | 套图 pipeline Node + 非阻塞 dispatch |
