---
name: ailili-aigc-textgen
description: AI生文工具，根据提示词生成文本，支持图文结合。本地网关可配置文本模型。用户说"AI生文"、"AI写作"、"文本生成"、"帮我写一段"、"text generation"、"generate text"、"用AI写"、"AI分析图片内容"、"图片识别"时触发。
---

# AI 生文

客户端是 **Node**，不要调用 Python。

```bash
ailili-aigc textgen --stdin < params.json
ailili-aigc textgen --stdin --content-only < params.json
node scripts/aigc_textgen.cjs --stdin [--content-only] < params.json
```

网关：`AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）。`POST /aigc/textGenAsync` → 轮询 `/aigc/textTaskQuery`。loopback 且 daemon 未起时，Node 客户端会尝试 `ailili-aigc daemon start`。

文本模型来自同一份 `$AILILI_AIGC_HOME/config.json`（与生图共用）的 `default_text_provider`，或环境变量 `OPENAI_API_KEY` / `OPENAI_API_BASE` / `OPENAI_TEXT_MODEL`。入参里的 `model` / `thinkingLevel` 会被忽略。无上游时可用 `AILILI_AIGC_FAKE_TEXT=1` 做协议联调。

## 参数

- 必填：`prompt`、`imageUrls`（无图传 `[]`）、`thinkingLevel`（本地网关可忽略，建议 `minimal`）
- `model` 可传；本地阶段忽略，用 `default_text_provider`

## 输出契约

- stdout 只放机器数据（`--content-only` 例外，stdout 为纯文本 content）
- 默认小结果：完整响应 JSON；大结果：信封 `{ok, truncated, savedPath, bytes, content}`
- 诊断走 stderr
- 失败退出码非 0
- content 换行一律压成 `⏎`（U+23CE）

后续要作图时用 `--content-only`，把 stdout 内联进下游 imagegen JSON。下游 `aigc_imagegen.cjs` 会把 `⏎` 还原为换行。

```bash
PROMPT=$(node scripts/aigc_textgen.cjs --stdin --content-only < textgen_params.json)
```

loopback 可不配 API key。非 loopback 需要 `LINKFOX_AGENT_API_KEY`。

## 示例

```json
{"prompt": "Write a product description for a wireless bluetooth speaker", "imageUrls": [], "thinkingLevel": "minimal"}
```

```json
{"prompt": "分析这张商品主图的构图和卖点表达", "imageUrls": ["https://example.com/product-main.jpg"], "thinkingLevel": "high"}
```
