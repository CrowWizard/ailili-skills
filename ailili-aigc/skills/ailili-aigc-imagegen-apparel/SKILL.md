---
name: ailili-aigc-imagegen-apparel
description: >
  服饰/鞋类电商套图。白底主图、核心卖点图、卖点图、材质图、场景图、模特图、多场景拼图、三角度拼图、详情图。
  用户说「做一套淘宝主图」「这件衣服的电商套图」「生成模特图」「亚马逊服装 listing」时触发。
  不要用于非服饰套图或 A+（→ ailili-aigc-imagegen-product）；不要用于去水印/换色/放大等单张编辑（→ ailili-aigc-imagegen-guide）。
---

# 服饰套图

脚本均为 **Node**。Prompt 由 `scripts/prompts.cjs` 生成，出图走 `ailili-aigc-imagegen`。网关 `AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）。不要跑 Python，不要选供应商，不要生成视频或详情 HTML。

类型：`white_bg` 白底主图 / `key_features` 核心卖点图 / `selling_pt` 卖点图 / `material` 材质图 / `lifestyle` 场景展示图 / `model` 模特展示图 / `multi_scene` 多场景拼图 / `three_angle_view` 三角度拼图 / `ecommerce_detail` 电商详情图。

`<本skill根>` = 本 SKILL.md 所在目录。

## 参考图（强制）

`imageUrls` 为同一商品 1–3 张，**绝对路径**（正面在前，背面第二张会自动给材质图）。禁止 `data:` URL、禁止上传、禁止为参考图起 HTTP。

## 套图（plan → 确认 → dispatch → poll → summary）

默认类型：`white_bg,key_features,selling_pt,material,lifestyle,model,multi_scene,ecommerce_detail`。仅 1 张商品图时自动插入 `three_angle_view`。`garment_position` 为 `non-apparel` 时去掉 `model`。写了 `types` 则按 `types`。

1. 用 Agent 视觉看图，写出 `product` JSON（至少 `product_description_for_prompt`、`selling_points` 含 `zh`/`en`、`garment_position`、`input_image_type`、`target_scenes` / `target_scene_envs`）。展示卖点，让用户确认。
2. 国内平台 `lang: "zh"`，Amazon / 独立站 `lang: "en"`。尺寸见 `references/platforms.md`，只用来填 `lang` / `aspectRatio`，不要按平台再连供应商。
3. 套图含 `model` / `lifestyle` / `multi_scene` 时，先选模特再 plan：

```bash
node <本skill根>/scripts/list-models.cjs
```

把推荐的 2–3 个 `path` 用 markdown 图片给用户看，选定后写入 job 的 `modelImage`（绝对路径，例如 `<本skill根>/assets/models/02.png`）。不要 AI 随机模特。
4. 写 `$DATADIR/collection-job.json`：

```json
{
  "imageUrls": ["C:/Users/me/front.jpg", "C:/Users/me/back.jpg"],
  "modelImage": "C:/Users/me/.codex/skills/ailili-aigc-imagegen-apparel/assets/models/02.png",
  "lang": "zh",
  "aspectRatio": "1:1",
  "resolution": "2K",
  "templateSet": 1,
  "product": {
    "product_description_for_prompt": "black floral V-neck dress with ruffle hem",
    "garment_position": "full-body",
    "input_image_type": "flat_lay",
    "selling_points": [{"zh": "交叉领口", "en": "Cross-strap neckline", "visual_keywords": ["cross-strap V-neck"]}],
    "target_scenes": ["海边度假", "咖啡馆"],
    "target_scene_envs": ["tropical beach, golden sand, turquoise ocean", "cozy café interior, wooden table, warm window light"]
  }
}
```

`input_image_type`：`flat_lay` / `flat_lay_front_back` / `hanging` / `hanging_front_back` / `model`。`templateSet` 1 默认商拍 / 2 生活杂志 / 3 极简 / 4 活力 / 5 暗调。

5. Plan。把表格转发给用户，`AskUserQuestion` 确认：

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase plan --job "$DATADIR/collection-job.json"
```

stdout 先是 markdown 表，最后一行 JSON。若 `needs_model_image: true`，先补 `modelImage` 再重新 plan。

6. 确认后 **只发 1 个 dispatch**，立刻返回，不要自己并发 `run_one_task`：

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase dispatch --state "$DATADIR/collection-state.json"
```

7. 轮询，每完成一张立刻展示。把 `tasks[].markdown` 原样贴进对话：

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase status --state "$DATADIR/collection-state.json"
```

```markdown
### 卖点图
卖点：交叉领口

![卖点图 · 交叉领口](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

禁止超链接、`file://`、只贴路径。`pending > 0` 时过 30–60 秒再 poll。不要 `sleep` 十分钟。

8. `done: true` 后 summary，已展示过的图不要再贴。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase summary --state "$DATADIR/collection-state.json"
```

`skip_confirm: true` 跳过确认。单张同类型：`types` 只写一项。

## 不适用

- 非服饰套图 / A+ / 品牌基因 → `ailili-aigc-imagegen-product`
- 去水印、换色、放大、图内翻译、单张白底精修 → `ailili-aigc-imagegen-guide`
- 小红书/包装/爆炸图等单张场景 → `ailili-aigc-imagegen-scenes`
- 无电商意图的生图 → `ailili-aigc-imagegen`
