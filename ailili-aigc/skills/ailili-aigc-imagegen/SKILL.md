---
name: ailili-aigc-imagegen
description: AI生图工具，根据提示词和参考图生成图片。本地网关可配置生图模型。用户说"生成图片"、"AI画图"、"AI生图"、"帮我画"、"图片生成"、"image generation"、"generate image"、"画一张图"、"做张图"、"图生图"时触发。
---

# AI 生图

根据提示词和参考图生成图片。客户端是 **Node**。

网关：`AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）。协议：`POST /aigc/imageGenAsync` → `taskId` → `POST /aigc/taskQuery`。loopback 且 daemon 未起时，Node 客户端会尝试 `ailili-aigc daemon start`。

## 调用

优先调同目录 Rust CLI（Node 包装只负责找到二进制）：

```bash
ailili-aigc imagegen '<JSON>'
# 或
node scripts/aigc_imagegen.cjs '<JSON>'
```

cwd 为本 skill 根目录。JSON 必填：`prompt`、`imageUrls`、`outputNum`、`resolution`、`aspectRatio`、`quality`。`provider` 可传，本地网关会忽略，改用 `$AILILI_AIGC_HOME/config.json` 的 `default_image_provider`（或 `default_provider`）。

## 参考图（强制）

`imageUrls` 至少 1 张。用户给的是本地文件时，**原样传绝对路径**，例如 `C:/Users/me/product.jpg`。

禁止：

- 把图片 Read 成 base64 / 转 `data:` URL（Windows 命令行会 `ENAMETOOLONG`）
- 为参考图起临时 HTTP、或先上传到图床
- `file://` 以外的相对路径（能解析才用；优先绝对路径）

仍可用短 `http(s)` URL。网关在本机读文件，不经过 LinkFox 上传。

**异步流程**（脚本内完成）：

1. `POST /aigc/imageGenAsync` 得 `taskId`
2. 轮询 `POST /aigc/taskQuery`（10s 递减到 5s，最长 10 分钟）
3. 成功则下载图片到会话 `media/`

**文件位置**：`<cwd>/ailili/<YYYY-MM-DD>/<session>/`

| 内容 | 目录 |
|------|------|
| 生成的图片 | `media/ailili-aigc-imagegen-<ts>.<ext>` |
| 原始 API 响应 | `data/ailili-aigc-imagegen-<ts>.json` |

**stdout**：

- 成功：`Saved full response: ["/abs/path.png"]`（多张为数组）
- 失败：`Saved full response: /abs/path/data/….json`

禁止 Read 图片文件内容。把路径给用户即可。

loopback 网关可不配 API key。非 loopback 需要 `AILILI_AIGC_TOKEN`。

## 示例

```json
{"imageUrls": ["C:/Users/me/product.jpg"], "prompt": "product photography on white background, studio lighting", "outputNum": 1, "resolution": "1K", "aspectRatio": "1:1", "quality": "high"}
```

## 限制

- 至少一张参考图（本地路径或 URL）。
- 单次最多 10 张。
- 失败不重试（脚本只跑一轮）。

## 不适用

- 纯文字 → `ailili-aigc-textgen`
- 商品套图编排 → `ailili-aigc-imagegen-product`

## 执行指令

收到 `ARGUMENTS:` 后立即执行 `node scripts/aigc_imagegen.cjs '<JSON>'`，禁止等待用户确认。
