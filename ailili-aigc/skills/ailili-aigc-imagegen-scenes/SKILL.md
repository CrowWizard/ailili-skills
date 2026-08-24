---
name: ailili-aigc-imagegen-scenes
description: >
  单张电商场景出图：主图、生活场景、平铺、微距、海报、社媒、UGC、包装、爆炸图、隐形模特、杂志、季节、店铺等 25 套模板。
  用户说「做一张小红书图」「包装图」「爆炸图」「隐形模特」「UGC 买家秀」「海报 banner」时触发。
  不要用于整套 listing（服饰 → ailili-aigc-imagegen-apparel；非服饰/A+ → ailili-aigc-imagegen-product）；不要用于去水印/换色/放大（→ ailili-aigc-imagegen-guide）。
---

# 单张电商场景

模板来自 `gpt-image2-ecommerce`（buluslan / MIT）。出图只走本地 `ailili-aigc` daemon，不要 `codex exec`、不要 `127.0.0.1:4312`、不要 `bash scripts/imagegen.sh`。

`<本skill根>` = 本 SKILL.md 所在目录。

## 不适用

| 意图 | 去 |
|---|---|
| 服饰一套图 / 模特库 | `ailili-aigc-imagegen-apparel` |
| 非服饰套图 / A+ 模块 | `ailili-aigc-imagegen-product` |
| 去水印、SKU 换色、放大、图内翻译 | `ailili-aigc-imagegen-guide` |
| 无场景意图的生图 | `ailili-aigc-imagegen` |

## 参考图与展示

`imageUrls` 本地绝对路径或短 http(s)。禁止 data URL。成功后立刻：

```markdown
![生活场景](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

无参考图本阶段不能出图（imagegen 强制至少 1 张）。

## 流程

1. 从用户话里取出场景、商品描述、风格（luxury/fresh/tech/minimal）、参考图路径。
2. **只读命中的一份** `references/templates/*.json`（按 keywords / trigger_phrases）。没命中用 `01-hero-image.json`。
3. 用 `prompt_template` 填 `{variables}`，需要时叠 `variants.<name>.overrides` 和 `category_tips.<category>`。只留有值的字段，拼成一段英文 prompt（JSON 字符串或短段落均可）。UGC / 直播 / 社媒加上模板里的 `anti_ai_tips` 和「iPhone 实拍、轻微噪点、不要 AI 塑料感」。
4. 立刻执行：

```bash
node <本skill根>/scripts/run_one.cjs '{"prompt":"…","imageUrls":["C:/Users/me/product.jpg"],"outputNum":1,"resolution":"2K","aspectRatio":"1:1","quality":"high"}'
```

| 触发 | 模板 |
|---|---|
| 白底图、主图、packshot | `01-hero-image.json` |
| 场景图、生活图 | `02-lifestyle-scene.json` |
| 平铺、俯拍 | `03-flat-lay.json` |
| 细节、微距、特写 | `04-detail-macro.json` |
| 海报、banner、促销 | `05-poster-banner.json` |
| 小红书、Instagram、TikTok | `06-social-media.json` |
| UGC、买家秀、GRWM | `07-ugc-style.json` |
| 模特（单张，不是套图） | `08-model-showcase.json` |
| 前后对比 | `09-before-after.json` |
| 包装、礼盒 | `10-packaging.json` |
| 信息图、单张 A+ 风 | `11-infographic.json` |
| 创意概念 | `12-creative-concept.json` |
| 尺寸、规格、步骤 | `13-size-spec.json` |
| 套装、组合 | `14-multi-product.json` |
| 直播 | `15-livestream.json` |
| 试穿 | `16-try-on-virtual.json` |
| 爆炸图、拆解 | `17-exploded-view.json` |
| 隐形模特、ghost mannequin | `18-ghost-mannequin.json` |
| 多角度网格 | `19-multi-angle-grid.json` |
| 杂志、封面 | `20-magazine-editorial.json` |
| 季节、四季 | `21-seasonal-campaign.json` |
| 奢华氛围 | `22-luxury-atmospherics.json` |
| 设备 mockup、APP | `23-device-mockup.json` |
| 店铺、门面 | `24-storefront.json` |
| 运动、健身 | `25-sports-campaign.json` |
