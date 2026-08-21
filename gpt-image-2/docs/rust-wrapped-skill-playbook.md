# 用 Rust 封装 Agent Skill 的实践手册

这份文档整理自 `gpt-image-2-skill` 的实战：把慢、重、要跨平台的工作放进 Rust CLI，再做成 Codex / Claude 能调用的 Skill。目标是让下一个 skill **直接按这套骨架开工**，而不是再踩一遍进程、Job Object、Agent 编排的坑。

适用场景：任务可能跑几十秒到十几分钟（生图、转码、批量导出、本地模型推理），Agent 必须能提交、追踪、失败重试，并且 Windows / macOS / Linux 行为一致。

---

## 1. 结论先说

1. **Skill 不是业务实现。** `SKILL.md` 只告诉 Agent 调哪条命令、怎么读 JSON。真正的逻辑在 Rust。
2. **给 Agent 的契约是 argv + JSON stdout。** 不要用 MCP stdio 当主路径；也不要让 Agent 去 `Start-Process -WindowStyle Hidden`。
3. **一次 CLI 调用 = 一个短客户端。** 长任务进本机 daemon。客户端负责：入队、返回 `job_id`、稍后 `jobs status`。
4. **Agent 路径和人类路径要分开。** Agent：`--no-wait` + 记 ticket + 轮询。人类本机等齐：可以 `fanout` 或阻塞等待。
5. **二进制优先放在 skill 同目录。** 已安装的 skill 不要 `cargo run`，也不要从别人的 GitHub Release 自动下载。
6. **SKILL.md 是操作卡，不是产品手册。** 写错一句，Codex 会真的先跑 `doctor`、`npm i -g`、或 `Start-Process`。

---

## 2. 推荐分层

```
Agent (Codex / Claude)
    │  cwd = skill 目录
    │  调：scripts/<name>.exe  或  scripts/<name>
    ▼
Skill 包
    SKILL.md              Agent 操作卡（越短越好）
    agents/openai.yaml    Codex 专用：default_prompt / 隐式调用
    scripts/<name>.exe    同目录 Rust CLI（Windows）
    scripts/<name>        同目录 Rust CLI（macOS / Linux）
    scripts/<name>.cjs    可选 Node 薄包装：只负责找二进制并转发 argv
    references/           人读的细节，Agent 需要时再 load
    ▼
Rust workspace
    crates/<name>-core     业务：API、配置、校验、重试
    crates/<name>          Skill CLI：daemon / client / jobs
    crates/<name>-web      可选：loopback HTTP（daemon 复用这层）
    ▼
本机 daemon  127.0.0.1:<port>
    常驻进程，排队，限制并行
    状态可用 job_id 查询
```

职责切干净：

| 层 | 做什么 | 不做什么 |
|---|---|---|
| `SKILL.md` | 何时用、调哪条命令、JSON 怎么读、禁止事项 | 实现算法、讲上游 API 细节 |
| Node wrapper | 找到同目录二进制，`spawnSync` 转发 | 业务、下载上游 release |
| Skill CLI | 解析 argv、起/复用 daemon、入队、查询、拷输出 | 把 HTTP 细节暴露给 Agent |
| core | 真正干活、重试、配置、密钥 | 进程模型、Agent 文案 |
| daemon | 并行上限、job 生命周期 | 被每个 CLI 带着一起死 |

`gpt-image-2-skill` 的对应关系：`core` 出图，`web` 提供 `/api`，skill crate 拦截 `daemon` / `jobs` / `images`，短客户端把 edit/generate POST 到 `http://127.0.0.1:8787/api`。

---

## 3. Skill 包最小文件

安装后典型位置：

- Codex：`$CODEX_HOME/skills/<name>/`（Windows 常是 `%USERPROFILE%\.codex\skills\<name>\`）
- 调用时 **cwd 就是这个目录**，相对路径相对 skill 根，不是用户的桌面或仓库。

```
<name>/
  SKILL.md
  agents/openai.yaml
  scripts/
    <name>.exe          # Windows 构建产物
    <name>              # macOS / Linux 构建产物
    <name>.cjs          # 可选
  references/
    troubleshooting.md
```

Agent 找 CLI 的顺序（写进 SKILL.md，wrapper 也按这个实现）：

1. `ENV` 指向的绝对路径（例如 `GPT_IMAGE_2_SKILL_BIN`）
2. `scripts/<name>.exe`（Windows）或 `scripts/<name>`（其它）
3. `bin/<rust-target-triple>/`（若你按 triple 打包）
4. `PATH`
5. 桌面 App 自带 CLI（仅当你真有 App）

**不要**再加：仓库里 `cargo run`、`~/.cache` 里下过的包、从 GitHub Release 自动 bootstrap。Fork / 私有 skill 的 tag 对不上，Agent 会下到错误版本或直接失败。

---

## 4. 进程模型（这是本项目最贵的经验）

### 4.1 三种调用，不要混

| 模式 | 谁在跑 | 适合谁 | 行为 |
|---|---|---|---|
| 阻塞单任务 | 短客户端等 daemon 把文件写到 `--out` | 一张图、一次转换 | 一次 tool call 等到结束 |
| 入队 + 轮询 | 短客户端 POST 后立刻返回 `job_id`；daemon 继续跑 | **Agent 批量、长任务** | 提交快；下一轮 `jobs status` |
| 父进程 fanout | 一个父 CLI 拉起最多 N 个子进程并 `wait` | 人类在终端里盯着跑完 | Agent 不要用（一次 tool call 会卡死） |

`gpt-image-2-skill` 对应命令：

- 阻塞：`images edit`（默认）
- 入队：`images edit --no-wait` → `{ job_id, queued, out, ticket }`
- 轮询：`jobs status --file tickets.json` 或 `--id <job_id>`
- 人类等齐：`images fanout --jobs pages.json`

### 4.2 为什么禁止 `Start-Process -WindowStyle Hidden`

Codex 在旧 skill 上写过这种脚本：每个任务 `Start-Process` + Hidden + `Start-Sleep 400`，父脚本发完就退出。

会同时坏掉这几件事：

- 拿不到 stdout JSON，于是没有 `job_id`
- 拿不到退出码
- 不知道 `--out` 写好没有
- Windows **Job Object**：父进程退出时，Job 里的子进程（包括刚拉起的 daemon）会被杀掉

意图（交完就回来）是对的。正确实现是 **`--no-wait` + 记 ticket + 稍后 poll**，不是隐身进程。

### 4.3 Windows vs Unix：daemon 怎么活过客户端

短客户端每次调用都是新进程，这是正常的。要复用的是 **daemon 的 pid**。

| | Windows | macOS / Linux |
|---|---|---|
| 风险 | PowerShell `& $cli` / Codex 把客户端放进 **kill-on-close Job Object** | 客户端退出时可能给子进程 SIGHUP |
| 做法 | `CREATE_BREAKAWAY_FROM_JOB`；Job 不允许 breakaway 时用 **WMI `Win32_Process.Create`** 在 Job 外拉起 | `setsid` + `SIG_IGN SIGHUP` |
| 验活 | TCP 连上再 HTTP GET（`no_proxy`，避免系统代理把 `127.0.0.1` 拐走） | 同左 |
| 健康信号 | stderr `reusing daemon pid=...`；`daemon status` 的 pid 不变 | 同左 |
| 入队路径 | 父脚本 **等待 enqueue 返回**（很快）。Job 在客户端存活期间不会杀 daemon；daemon 已 breakaway 后客户端退出也没关系 | 同左 |

注意：

- **父进程会 wait 的子进程**（fanout、enqueue 当时那个客户端）：留在 Job 里是对的，Ctrl+C 可以一起停。
- **必须比客户端活得长的进程**（daemon）：必须离开 Job。
- 不要用「在 Job 内 spawn 成功」当成功。看起来起了，客户端一退出就没了。

Unix 对应：不要用 `nohup cmd &` 然后父脚本退出还不记 pid。

### 4.4 并行放在哪

- **Daemon 内并行**：入队 N 个 job，worker 上限（本项目默认 10）。Agent 顺序 POST 很快，渲染重叠。
- **OS 子进程并行**：`fanout` 或 `SKIP_DAEMON=1` 的子进程。隔离好，但 Agent 不好 wait。
- 上游若一次只返回 1 个结果（例如某些 OpenAI-compatible 网关忽略 `n`），在 core 里把 `n>1` 拆成多次请求，不要指望 `--n 10` 一次回来。

不要两层都重试到爆：fanout `--retries 2` 再乘 core HTTP 3 次，一张失败图会打很多遍上游。Agent 路径让 **daemon/core 重试**，`jobs status` 只对 `failed` 再入队一次。

---

## 5. 给 Agent 的命令契约

### 5.1 永远 `--json`

- **stdout**：一个 JSON 对象（成功或失败都是对象，不要混日志）
- **stderr**：可选进度 JSONL；Agent 默认不要开，长任务会撑爆上下文
- **退出码**：入队成功 0；轮询命令只要 daemon 通就 0，是否全部完成看 JSON 字段 `done` / `all_ok`

成功入队（最小集）：

```json
{
  "ok": true,
  "queued": true,
  "job_id": "…",
  "out": "C:/abs/path/out.png",
  "ticket": { "job_id": "…", "out": "C:/abs/path/out.png" }
}
```

轮询：

```json
{
  "ok": true,
  "command": "jobs status",
  "pending": 3,
  "completed": 5,
  "failed": 0,
  "done": false,
  "all_ok": false,
  "tasks": [
    {
      "job_id": "…",
      "name": "03_leak_protection",
      "out": "C:/abs/path/03.png",
      "ok": true,
      "status": "completed",
      "output": { "path": "C:/abs/path/03.png" }
    }
  ]
}
```

失败统一：

```json
{
  "ok": false,
  "error": { "code": "snake_case_code", "message": "人能读的一句", "detail": {} }
}
```

`code` 要稳定（`auth_missing`、`provider_unavailable`、`daemon_request_failed`），Agent 靠它分支，不要靠英文 message。

### 5.2 Ticket 文件

Agent 提交后自己落盘（JSON 数组），不要让它记在对话记忆里：

```json
[
  { "job_id": "abc", "out": "C:/out/01.png", "name": "01_main" },
  { "job_id": "def", "out": "C:/out/02.png", "name": "02_hero" }
]
```

CLI 也可以在 `--no-wait` 时把 `job_id → out` 记到 `$CODEX_HOME/<skill>/client-outs.json`，这样后来只传 `--id` 也能拷文件。`--file` 仍是 Agent 的主路径。

### 5.3 路径

- Agent cwd = skill 目录。用户桌面上的参考图、输出目录必须用 **绝对路径**。
- 示例里不要写 `/tmp/out.png` 当 Windows 范例。
- 输出目录不存在时 CLI 自己 `create_dir_all`。

---

## 6. Codex 真实行为（按这个写 SKILL.md）

Codex 调用 skill 时大致是：

1. 用 `SKILL.md` 的 YAML `description` 决定要不要用
2. 读 `SKILL.md` 全文 + `agents/openai.yaml` 的 `default_prompt`
3. cwd = skill 根目录
4. **按文档里最先出现、出现次数最多的命令示例去跑**

所以：

- Quick start 如果第一条是 `config inspect` / `doctor`，它每次生图前都会空跑两三次 CLI。
- 示例如果 80% 是 `node scripts/foo.cjs`，Windows 上它不会优先用旁边的 `.exe`。
- `default_prompt` 如果写 “inspect provider auth, choose openai or codex”，它会加错误的 `--provider openai`。
- 文档太长、三套模型并存（daemon / fanout / Start-Process），它会选错。
- 写了 `npm install -g` / `npm view`，它可能动用户全局环境。

**Agent 批量的标准剧本（写在 SKILL.md 最前面的操作区）：**

1. 用同目录 CLI。
2. 多任务：每个任务前台 `& $cli --json --no-wait …`，等 **入队 JSON**，把 `job_id`+`out`+`name` 追加到 ticket 文件。这一轮 tool call 到此结束。
3. 下一轮：`jobs status --file tickets.json`。
4. `pending > 0`：结束本轮，过 30–60 秒再 poll。不要在一次命令里 `Start-Sleep` 十分钟。
5. `completed` 且本地 `out` 存在：立刻用 Markdown 图片把绝对路径贴进对话，不要等整批结束。已展示过的 `name` 不要再贴。
6. 只对 `failed` 再 `--no-wait` 入队。
7. 禁止 `Start-Process` / Hidden / `Start-Job` / `nohup` / `command &`。

单任务可以阻塞等到 `--out`。

`agents/openai.yaml` 的 `default_prompt` 必须和上面同一套话，不要写「先 inspect」。

---

## 7. SKILL.md 怎么写（给下一个 skill 的目录）

建议正文只保留这些块，其它进 `references/`：

1. YAML `description`（触发语，短、准）
2. 如何调用同目录 CLI（Windows / macOS 一张表）
3. **Codex 多任务：enqueue / ticket / poll / 边完成边展示**
4. 单任务阻塞命令
5. 配置（provider / 密钥）——只写「出错才 inspect」
6. 指向 `references/`

明确不要写进主文档：

- runtime freshness、`npm i -g`、查桌面 App 版本
- 八条 Quick start 里把 doctor 放第一
- 内置 provider 名（如果产品已经改成「只有配置里的自定义后端」）
- 未说明的并行模型

人类等齐的 `fanout` 标成 “not for agents”。

---

## 8. Rust CLI 骨架

Skill crate 的 `run()` 建议按 **位置参数** 先拦截 daemon/jobs，再交给业务 clap。这样 `jobs` / `daemon` 不必塞进 core 的 `Commands` 枚举。

```rust
pub fn run(argv: &[String]) -> i32 {
    if is_cmd(argv, "daemon") { return daemon::dispatch(argv); }
    if is_cmd(argv, "jobs")   { return jobs::dispatch(argv); }
    if skip_daemon()          { return core::run(argv); }
    match Cli::try_parse_from(argv) {
        Ok(cli) if is_long_task(&cli) => client::enqueue_or_wait(&cli),
        _ => core::run(argv),
    }
}

fn is_cmd(argv: &[String], name: &str) -> bool {
    argv.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .next()
        .map(String::as_str)
        == Some(name)
}
```

客户端对长任务：

1. `ensure_running()`：probe loopback；没有就 spawn daemon 并等健康。
2. POST `/api/...` 入队。
3. `--no-wait`（以及 env `*_DAEMON_NO_WAIT=1`）：记下 `job_id`→`--out`，打印 ticket，返回。
4. 否则 poll `GET /api/jobs/{id}` 直到终态，把产物拷到 `--out`。

`jobs status`：

- `--id` 可重复，或 `--file tickets.json`
- 终态且成功则拷到 ticket 里的 `out`
- JSON 带 `pending` / `completed` / `failed` / `done` / `all_ok`
- 查不到的 id 算 `failed`，不要算 `pending`（否则 Agent 会永远等）
- HTTP 走 `no_proxy()`，避免系统代理劫持 `127.0.0.1`

Daemon：

- 锁文件 / `daemon.json` 写 pid、host、port、version
- 单例：`create_new` 的 start lock，避免两个客户端同时起两个 daemon
- loopback only
- `max_parallel` 写死或可配，和 SKILL.md 里的数字一致
- `daemon start|stop|status|foreground`

Windows spawn 顺序：breakaway → WMI；**禁止** Job 内 fallback 当成功。WMI 拉起时把当前环境（尤其 `*_API_KEY`、`CODEX_HOME`）写进 launcher，因为 WMI 子进程不继承你的 env。

---

## 9. 配置与密钥

共享配置放 `$CODEX_HOME/<skill>/config.json`（本项目是 `$CODEX_HOME/gpt-image-2-skill/config.json`），CLI / App / Skill 读同一份。

密钥三种来源：

| source | 形态 | 何时用 |
|---|---|---|
| `env` | `{ "source": "env", "env": "FOO_API_KEY" }` | 推荐；机器上已有环境变量 |
| `file` | `{ "source": "file", "value": "sk-…" }` | 能用，但会进 json |
| `keychain` | OS 凭据库 | 桌面用户 |

Agent 加后端用 `config add-provider`，不要教它手改 json。`config inspect` 必须脱敏。

默认 `--provider auto` → `default_provider`。不要在文档里推销已经关掉的内置名。

---

## 10. CI：按平台出 skill 二进制

Agent 不会帮用户编译。为 Windows / macOS 各做一条 **只编 skill CLI** 的 workflow（不要绑 Tauri 整包）：

- Windows：`windows-2025`，`x86_64-pc-windows-msvc`，artifact 里是 `scripts` 用的 `.exe` + SHA256
- macOS：`macos-15`，矩阵 `aarch64-apple-darwin` 与 `x86_64-apple-darwin`
- `workflow_dispatch` + 对 `crates/<skill>/**` 的 push
- `--locked`、`--release`、`-p <skill-crate> --target …`

用户把 artifact 解压进 `skills/<name>/scripts/`。SKILL.md 写清覆盖哪个文件名。

Linux 若也要给 Codex 用，同样出 gnu/musl 之一；本机开发用 `cargo build -p <skill>` 即可。

---

## 11. 新 skill 开工清单

- [ ] workspace：`core`（业务）+ `<name>`（CLI/daemon/jobs）
- [ ] 长任务走 loopback daemon；短客户端可 `--no-wait`
- [ ] `jobs status --id` / `--file`，完成时拷到 `--out`
- [ ] stdout 只有 JSON；`error.code` 稳定
- [ ] Windows daemon breakaway 或 WMI；Unix `setsid`
- [ ] 健康检查：TCP + HTTP，`no_proxy`
- [ ] 二进制落在 `scripts/`；wrapper 不再 bootstrap GitHub
- [ ] Windows / macOS CI artifact
- [ ] `SKILL.md` 操作卡：同目录 CLI、enqueue、ticket、poll、禁止 Start-Process
- [ ] `agents/openai.yaml` 的 default_prompt 与操作卡一致
- [ ] 示例用绝对路径；Windows 示例用 `.exe`
- [ ] 多任务完成一张展示一张，失败的不展示
- [ ] 文档里的并行上限与 daemon `max_parallel` 相同
- [ ] 单测或 smoke：`jobs status` 无 id 报错；`--no-wait` 出现在 `--help`

---

## 12. 反模式（本项目踩过）

| 反模式 | 后果 | 改法 |
|---|---|---|
| 每个 CLI 进程里直接跑完长任务 | Agent 一次 tool call 卡 10 分钟，或自己乱起后台进程 | daemon + `--no-wait` |
| `Start-Process Hidden` 当并行 | 无 id、无退出码、Job 杀子进程 | 前台 enqueue，记 ticket |
| Job 内 spawn daemon，失败再「不带 breakaway 再试一次」 | 看起来复用了，其实每页都在重启 | 只允许 Job 外 daemon |
| wrapper 从上游 Release bootstrap | fork 后下到别人的包或失败 | 只用 skill 目录里的二进制 |
| SKILL.md 先 doctor / freshness / npm | 每次空跑、甚至改全局 npm | 出错再 inspect |
| 文档仍写已删除的内置 provider | Agent 加 `--provider openai` 直接失败 | 只写 config 里的名字 |
| `--json-events` 当默认 | 上下文被 JSONL 灌满 | 用户要进度再开 |
| 示例全是 `node …cjs` 和 `/tmp` | Windows 路径和调用都错 | 同目录 exe + 绝对路径 |
| `n=10` 打只返回 1 张的网关 | 生成一张就停 | 本地拆成 n 次，或不要用 `n` |
| fanout 重试 × HTTP 重试 | 费用和 429 | 一层重试 |

---

## 13. 最小命令面（下一个 skill 可直接抄名字）

```text
<cli> daemon start|stop|status
<cli> --json <task> …                  # 阻塞等到 --out
<cli> --json --no-wait <task> …        # 立刻返回 job_id
<cli> --json jobs status --id ID
<cli> --json jobs status --file tickets.json
<cli> --json config inspect|add-provider|test-provider
```

Windows 调用：

```powershell
$cli = Join-Path $PWD 'scripts\<name>.exe'
```

macOS / Linux：

```bash
CLI=./scripts/<name>
[ -x "$CLI" ] || CLI="node scripts/<name>.cjs"
```

把 `<task>` 换成你的业务子命令即可；进程与 Agent 编排可以原样复用。

---

## 14. 本仓库里对照代码

| 主题 | 位置 |
|---|---|
| CLI 入口拦截 | `crates/gpt-image-2-skill/src/lib.rs` |
| Daemon 起停 / Windows breakaway+WMI | `crates/gpt-image-2-skill/src/daemon.rs` |
| 入队、`--no-wait`、ticket、拷 `--out` | `crates/gpt-image-2-skill/src/client.rs` |
| `jobs status` | `crates/gpt-image-2-skill/src/jobs.rs` |
| 人类 fanout（Agent 禁用） | `crates/gpt-image-2-skill/src/fanout.rs` |
| loopback API 与并行上限 | `crates/gpt-image-2-web/src/lib.rs` |
| 二进制查找（无 bootstrap） | `skills/gpt-image-2-skill/scripts/gpt_image_2_skill.cjs` |
| Agent 操作卡 | `skills/gpt-image-2-skill/SKILL.md` |
| Codex default_prompt | `skills/gpt-image-2-skill/agents/openai.yaml` |
| Windows / macOS CLI CI | `.github/workflows/build-windows-x64.yml`、`build-macos.yml` |
