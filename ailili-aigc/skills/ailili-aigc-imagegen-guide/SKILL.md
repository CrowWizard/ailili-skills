---
name: ailili-aigc-imagegen-guide
description: >
  单张商品图编辑与 prompt 路由。用于去水印、白底精修、换场景、SKU 换色、放大/改尺寸、图内翻译或改字、透明底、logo 贴标、tech pack、工艺流程图。
  用户说「去水印」「换成白底」「把背景换成厨房」「改成红色」「放大」「把图上的字翻成英文」「做一张卖点图」时触发。
  不要用于整套 listing 套图（服饰 → ailili-aigc-imagegen-apparel；非服饰/A+ → ailili-aigc-imagegen-product）；不要用于小红书/包装/爆炸图等单张场景模板（→ ailili-aigc-imagegen-scenes）；不要用于随便画画（→ ailili-aigc-imagegen）。
---

# 单图编辑（image-prompt-guide → imagegen）

出图只走兄弟 skill `ailili-aigc-imagegen`（本地 daemon 8788）。本 skill **不编排套图**、不选供应商、不上传 CDN。

`<本skill根>` = 本 SKILL.md 所在目录。`<imagegen根>` = 同级 `ailili-aigc-imagegen`。

## 不适用

| 用户意图 | 去 |
|---|---|
| 服饰/鞋、淘宝京东拼多多、模特库、8 件套 | `ailili-aigc-imagegen-apparel` |
| 非服饰套图、A+、品牌基因 | `ailili-aigc-imagegen-product` |
| 「做一套亚马逊/淘宝 listing」且要多张 | 同上两条，不要在这里 plan slot |
| 小红书/UGC/包装/爆炸图/隐形模特（单张场景） | `ailili-aigc-imagegen-scenes` |
| 无参考图瞎画、无电商编辑意图 | `ailili-aigc-imagegen` |
| 裁切/压缩/转格式/旋转且不改画面内容 | 本地工具，不要调生图 |
| 视频、详情 HTML | 不做 |

## 参考图与展示（强制）

`imageUrls` 用本地绝对路径或短 `http(s)`。禁止 `data:` URL、禁止先上传 CDN、禁止为参考图起 HTTP、禁止 `file://` 以外的相对路径。

成功后立刻渲染，不要只贴 `Saved full response` 或超链接。单独一行，Windows 正斜杠：

```markdown
![白底精修](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

禁止 Read 图片字节。无参考图的文生图（logo 从零设计等）本阶段不支持——imagegen 强制至少 1 张参考图。

## 调用

装完 prompt 后立刻执行，不要自己拼供应商或像素 `size`：

```bash
node <本skill根>/scripts/run_one.cjs '{"prompt":"…","imageUrls":["C:/Users/me/product.jpg"],"outputNum":1,"resolution":"2K","aspectRatio":"1:1","quality":"high"}'
```

`resolution` 默认 `2K`。`aspectRatio`：用户指定 > 单张平台主图规范 > 贴近原图 > `1:1`。不要传 `task_type` / 像素 `size`（daemon 没有这些字段）。

多张**同一操作**（例如 10 张都去水印）：每张一次 `run_one.cjs`，完成一张展示一张，不要等全部。

## 处理流水

1. **看图**：主体、必须保留的元素、可见文字/logo/水印、明显质量问题。不要脑补被挡住的结构。
2. **意图**：最终只要一张什么图。含糊的「优化/变专业」先问要改什么。
3. **原生 vs 生图**：只改文件体积/格式/旋转 → 本地工具。改像素尺寸且画面不变 → Image Resize 场景后仍走 `run_one.cjs`。
4. **路由**：按下表匹配，**加载每个命中的 `references/*.md`**，不要只看表就开写。
5. **多意图同一张输出**：能合并就一次调用（例如去杂 + 白底）。不要按意图数翻倍。
6. **装配 prompt** → **校验** → `run_one.cjs` → 展示 → Result Check。

### Scene Router

先看是不是套图：用户点名平台并要「一套主图/listing」→ 停，转到 apparel 或 product。下面只处理**单张**。

仍可加载 `references/platform-product-guidelines.md` 的**单张主图禁则**（白底、禁文案、语言），用来约束这一张，不要用它的 Batch / Composite Slot 规划器。

| 场景 | 触发 | 参考 | 合并备注 |
|---|---|---|---|
| White Background | 白底、去背、透明 PNG | `white-background.md` | 透明底：先白底，再按该文件的 Transparent PNG 步骤；无本地抠图工具则仍走 imagegen 并在 prompt 里写 transparent |
| Watermark / Element Removal | 去水印、去二维码/联系方式/杂物 | `remove-watermark.md` | 包装上的品牌字 → Text Editing |
| HD Upscale | 放大、更清晰 | `hd-upscale.md` | 「压到 2MB」→ 本地压缩 |
| Image Resize | 改到 WxH / 改比例且内容不变 | `image-resize.md` | 映射到最接近的 `aspectRatio` + `resolution` |
| Scene Image | 换场景、生活照 | `scene-image.md` | 纯白底 → White Background |
| SKU Color Change | 改商品颜色 | `sku-color-change.md` | 只改背景色 → Scene Image |
| Logo Customization | 把已有 logo 印到商品上 | `logo-customization.md` | 从零设计 logo 且无参考图 → 本阶段不做 |
| Model Showcase | 加模特穿/拿商品（单张） | `model-showcase.md` | 整套模特图 → apparel |
| Image Detail | 特写、材质局部 | `image-detail.md` | 带标注/文案 → Selling Point |
| Selling Point Image | 单张卖点/对比/how-it-works | `selling-point.md` | 一套卖点图 → product / apparel |
| Image Translation | 图内文字翻译 | `image-translation.md` | |
| Text Editing | 改字、修错字、改价格 | `text-editing.md` | |
| Tech Pack | 尺寸图、工艺规格图 | `tech-pack.md` | |
| Process Flowchart | 制作流程、how it's made | `process-flow.md` | 卖点信息图 → Selling Point |

没有命中：有参考图就按保真编辑写 prompt；没有参考图就转到 `ailili-aigc-imagegen`。

条件加载：`references/resolution-routing.md`（用户要 1K/2K/明确像素时，只取比例映射，像素 `size` 仍丢掉）；`references/style-guide.md`（需要氛围词汇时）。

## Identity Match

有商品参考、或用户说保持商品不变时启用。改的是**呈现**，不是商品身份。

**不能改**：几何/比例、颜色族、材质、纹理、印花、logo、商品/包装上已有文字。

**可以改**：机位、景别、构图位置、背景、灯光。白底精修默认不要重构图，除非用户要求居中/放大。

prompt 里用 ≤3 行：

```
Keep the product identity unchanged — preserve geometry, proportions, color, material, texture, prints, logo, and on-product text.
Camera angle, pose, and composition may change to fit the shot. Only change: [允许的改动].
Do not redraw, simplify, recolor, or invent any product detail.
```

禁止编造卖点、认证、尺寸、材质、竞品。看不见的结构不要画出来。

## Prompt 格式

reference 负责**内容**（模板、硬约束）；本文件负责**格式**。最终 prompt 必须是英文 labeled blocks，不要一段散文。

| Tier | 何时 | 必有块 |
|---|---|---|
| `minimal` | 纯白底、去水印、放大、改尺寸、换色、单区改字 | 1, 3, 11–13（2 按条件） |
| `standard` | 换场景、平台单张主图、模特、特写、合并保真编辑 | 1, 3–8, 11–13 |
| `dense` | 卖点排版、tech pack、流程图、多区文字 | 1, 3–13 |

块顺序（有则写，空则省略）：

1. `Asset type:`
2. `Input images:`（≥2 张参考，或必须逐字保留图上文字时）
3. `Primary request:` ← reference 模板原文，占位符已替换
4. `Canvas and composition:`
5. `Camera:`
6. `Scene/backdrop:`
7. `Lighting and grounding:`
8. `Materials, color and style:`（环境侧；商品材质只放 11）
9. `Typography:`（有加字时必写，精确 copy + `no other text`）
10. `Graphics and callouts:`
11. `Product invariants:`（≤3 行）
12. `Allowed changes:`（闭集，以 `only` 结尾）
13. `Avoid:`（≤8 条；不要点名可画的道具）

调用前检查：意图对、没有加用户没要的东西、没有编造事实、用户硬约束还在、标签和顺序对。只是格式错就重装，不要问用户。

各 reference 的 Apply Method 照旧：`Direct Apply` 的模板进 `Primary request:` 原文；`Concatenate` 把固定约束拆进 11/13。

## Result Check

对照 invariants。商品被改样、白底不白、该去的水印还在、图内字乱码 → 加强 11 再打一次。同一任务失败 2 次就停，告诉用户。

## 执行指令

匹配到场景并装好 prompt 后立即 `node scripts/run_one.cjs '<JSON>'`。cwd 为本 skill 根目录。
