# 安装：只拷 skill + exe

Agent 运行时只需要两样东西：

1. **skill 文件夹**（每个目录自带 `scripts/lib`，不必再拷 `ailili-aigc/scripts/lib`）
2. **`ailili-aigc.exe`（Windows）或 `ailili-aigc`（Linux/macOS）**

不要拷 `ecommerce-images/`、`image-prompt-guide/`、`gpt-image2-ecommerce/`、`linkfox-aigc-*`，那些是源码对照，不是运行时 skill。也不要拷 `ailili-aigc/scripts/` 整棵树。

本机需要 **Node.js**（Codex 用 `node scripts/….cjs` 调 exe）。

---

## 1. 拿 exe

GitHub：**Actions → `ailili-aigc Windows x64` → Run workflow**，下载 artifact `ailili-aigc-windows-x64`，里面是 `ailili-aigc.exe`。

本机编译：

```bash
cargo build -p ailili-aigc --release
# 产物：ailili-aigc/target/release/ailili-aigc  或  ailili-aigc.exe
```

## 2. 放 exe（一份即可，所有 skill 共用）

推荐放进数据目录，不要每个 skill 复制一份：

| 系统 | 路径 |
|------|------|
| Windows | `%USERPROFILE%\.ailili-aigc\ailili-aigc.exe` |
| Linux / macOS | `~/.ailili-aigc/ailili-aigc` |

PowerShell：

```powershell
New-Item -ItemType Directory -Force $env:USERPROFILE\.ailili-aigc | Out-Null
Copy-Item .\ailili-aigc.exe $env:USERPROFILE\.ailili-aigc\ailili-aigc.exe
```

查找顺序（命中即停）：

1. 环境变量 `AILILI_AIGC_BIN`（文件或目录都行）
2. 当前 skill 的 `scripts/` 或 skill 根目录
3. `$AILILI_AIGC_HOME`，否则 `$CODEX_HOME\ailili-aigc`，否则 `~\.ailili-aigc`

可选：

```powershell
$env:AILILI_AIGC_HOME = "$env:USERPROFILE\.ailili-aigc"
$env:AILILI_AIGC_BIN  = "$env:USERPROFILE\.ailili-aigc\ailili-aigc.exe"
```

## 3. 拷 skill 到 Codex

源目录：仓库里的 `ailili-aigc/skills/<name>/`（**整个文件夹**，含 `SKILL.md`、`scripts/`、`references/`、`assets/`）。

目标：

| 系统 | 路径 |
|------|------|
| Windows | `%USERPROFILE%\.codex\skills\<name>\` |
| Linux / macOS | `~/.codex/skills/<name>/` |

```powershell
$dst = "$env:USERPROFILE\.codex\skills"
New-Item -ItemType Directory -Force $dst | Out-Null
foreach ($s in @(
  "ailili-aigc-imagegen",
  "ailili-aigc-textgen",
  "ailili-aigc-imagegen-brand-gene-extract",
  "ailili-aigc-imagegen-product",
  "ailili-aigc-imagegen-apparel",
  "ailili-aigc-imagegen-guide",
  "ailili-aigc-imagegen-scenes"
)) {
  Copy-Item -Recurse -Force ".\ailili-aigc\skills\$s" "$dst\$s"
}
```

| 要装 | 拷这些文件夹 |
|------|----------------|
| 随便生图 | `ailili-aigc-imagegen` |
| 生文 / 品牌基因 | 再加上 `ailili-aigc-textgen`、`ailili-aigc-imagegen-brand-gene-extract` |
| 非服饰套图 / A+ | 再加上 `ailili-aigc-imagegen-product`（品牌基因建议一起装） |
| 服饰套图 | `ailili-aigc-imagegen-apparel`（含 `assets/models`） |
| 去水印 / 换色 / 放大 | `ailili-aigc-imagegen-guide` |
| 小红书 / 包装 / 爆炸图等单张场景 | `ailili-aigc-imagegen-scenes` |

领域 skill **不必**再装一份 `ailili-aigc-imagegen` 才能出图；它们直接找上面的 exe。套图里的品牌基因步骤若没装 `brand-gene-extract` 会自动跳过。

## 4. 配置

把 [config.example.json](config.example.json) 拷成：

`%USERPROFILE%\.ailili-aigc\config.json`

改 `default_image_provider` / `default_text_provider` 和对应 `api_base`、模型。API key 用环境变量（示例里是 `OPENAI_API_KEY`），不要写进 skill 目录。

网关默认 `http://127.0.0.1:8788`。一般不用设 `AILILI_TOOL_GATEWAY`；loopback 且 daemon 没起时，Node 脚本会自己 `ailili-aigc daemon start`。

## 5. 自检

```powershell
& "$env:USERPROFILE\.ailili-aigc\ailili-aigc.exe" daemon status
```

在任意已拷 skill 目录：

```powershell
cd $env:USERPROFILE\.codex\skills\ailili-aigc-imagegen
node .\scripts\aigc_imagegen.cjs '{"prompt":"white background product photo","imageUrls":["C:/path/to/product.jpg"],"outputNum":1,"resolution":"1K","aspectRatio":"1:1","quality":"high"}'
```

成功 stdout 含 `Saved full response: ["…png"]`。对话里用正斜杠 markdown 渲染：

```markdown
![生成图](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

## 套图计时日志

套图会写 `$DATADIR/ailili-trace.log`（plan / dispatch JSON 里的 `trace_file`）。一行一个 JSON 事件。跑完把这个文件发给维护者即可分析耗时，不要贴进对话。

## 不要做的事

- 不要把仓库根的 `scripts/lib` 再单独拷进 `.codex`
- 不要把参考图转成 `data:` URL
- 不要为参考图起本地 HTTP 或先上传图床
- 不要把 `ecommerce-images` / `image-prompt-guide` / `gpt-image2-ecommerce` 当 skill 安装

改了仓库里的 `ailili-aigc/scripts/lib/` 之后，在仓库根执行 `node ailili-aigc/scripts/vendor-lib.cjs`，再重新拷对应 skill 文件夹。
