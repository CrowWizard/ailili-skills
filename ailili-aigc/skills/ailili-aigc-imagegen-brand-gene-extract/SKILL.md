---
name: ailili-aigc-imagegen-brand-gene-extract
description: 品牌基因样式提取。根据商品图片与品牌参数提取 Brand DNA，输出 brandGeneJson。用户说"提取品牌基因"、"定义品牌风格"、"brand gene"、"品牌视觉"时触发。
---

# 品牌基因样式提取

一条 Node 命令跑完：组 prompt → 本地 textgen → 抽 JSON → 缺字段兜底 → 落盘。不要拆成多次 textgen / Write。

```bash
node scripts/extract_brand_gene.cjs --stdin < params.json
node scripts/extract_brand_gene.cjs '<JSON>'
```

cwd 为本 skill 根目录。

## 入参

```json
{
  "images": ["C:/Users/me/product.jpg"],
  "brandKey": {
    "brandColor": "",
    "fontStyle": "",
    "brandName": "",
    "language": "英文",
    "platform": "亚马逊",
    "salesRegion": "美国"
  }
}
```

`images` / `imageUrls` 至少 1 张（本地绝对路径或 URL）。`brandKey` 可省略，缺省为英文 / 亚马逊 / 美国，主色与字体自动提取。`brandColor` / `fontStyle` 非空时写入最终 JSON 对应字段。

## 输出

stdout：`Saved full response: <绝对路径> (<N> bytes)`

把该绝对路径交给套图 `--brand-gene-file`。不要 Read 整个 JSON 进上下文，除非下游马上要内联字段。

中间文件：`$DATADIR/brand_gene_params.json`（textgen 入参）。最终文件在会话 `data/ailili-aigc-imagegen-brand-gene-extract-<ts>.json`。

`save_brand_gene.cjs --datadir` 仍可单独取 `data/` 路径；整条提取用 `extract_brand_gene.cjs`。

## 错误

- 没有图片路径：退出非 0，提示补图。本地文件用绝对路径，不要转 data URL。
- textgen 失败：退出非 0，stderr 含原因

网关：`AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）。无上游模型时用 `AILILI_AIGC_FAKE_TEXT=1`。
