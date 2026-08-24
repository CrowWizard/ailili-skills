---
name: ailili-aigc-imagegen-product
description: 非服饰商品套图（数码/家居/食品等）。白底、场景、特写、卖点、A+。用户说「做套图」「做A+图」「做白底图」「这款音箱的场景图」时触发。衣服/鞋/淘宝模特套图走 ailili-aigc-imagegen-apparel；去水印/换色/单张精修走 ailili-aigc-imagegen-guide。
---

# 商品图生成

脚本均为 **Node**。出图走 `ailili-aigc-imagegen`，生文走 `ailili-aigc-textgen`。网关 `AILILI_TOOL_GATEWAY`（默认 `http://127.0.0.1:8788`）。

类型：`WHITE_BG` 白底图 / `SCENE` 场景图 / `CLOSE_UP` 特写图 / `SELLING_POINT` 卖点图 / `PREMIUM_APLUS` 高级A+ / `STANDARD_APLUS` 普通A+ / `PHONE_APLUS` 手机A+。

`<本skill根>` = 本 SKILL.md 所在目录。

## 参考图（强制）

`imageUrls` 必填。用户给本地文件时写入**绝对路径**（`C:/Users/me/product.jpg`），job / `--image-urls` JSON 里也只放路径字符串。

禁止转 `data:` URL、禁止为参考图起本地 HTTP、禁止先上传。短 `http(s)` 仍可用。不遵守会在 Windows 上 `ENAMETOOLONG` / `EOF`。

## 单张直出

白底图：

```bash
node <本skill根>/scripts/build_imagegen_prompt.cjs --type WHITE_BG --image-urls '["C:/Users/me/product.jpg"]' --out "$DATADIR/imagegen_white.json"
node <imagegen根>/scripts/aigc_imagegen.cjs "$(cat $DATADIR/imagegen_white.json)"
```

其它类型：

```bash
node <本skill根>/scripts/build_textgen_params.cjs --type SCENE --image-urls '["C:/Users/me/product.jpg"]' --point "卖点" --out "$DATADIR/textgen.json"
PROMPT=$(node <textgen根>/scripts/aigc_textgen.cjs --stdin --content-only < "$DATADIR/textgen.json")
# 把 PROMPT 写入 imagegen JSON 的 prompt 后调用 aigc_imagegen.cjs
```

成功后解析 `Saved full response: ["…png"]`，立刻在对话里渲染图片（单独一行，绝对路径，正斜杠），并写上类型/卖点，不要复述协议行、不要只贴链接：

```markdown
### 白底图
![白底图](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

## 套图（plan → 确认 → dispatch → poll → summary）

默认套图（场景 D、未指定 `types`）：总张数 `n` 取 job 的 `count` / `n` / `total` / `outputNum`，缺省 **6**。

- 卖点图：`(n - 6) / 2 + 3`（向下取整）
- 白底图：`1`
- 场景图：其余

所以 n=6 → 卖点 3、场景 2、白底 1；n=8 → 4 / 3 / 1；n=10 → 5 / 4 / 1。写了 `types` 则按 `types` 为准。

1. 写 `$DATADIR/collection-job.json`（`imageUrls` 必填，优先本地绝对路径，不要 data URL）。需要时含 `count`（总张数）、`brandKey` / `types` / `provider` / `resolution` / `scene`。
2. Plan（stdout 先 markdown 表，再一行 status JSON）。把表格原样转发给用户，然后 `AskUserQuestion`（确认生图 / 修改描述）：

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase plan --job "$DATADIR/collection-job.json"
```

3. 用户确认后 **只发 1 个 dispatch**。dispatch **立即返回** `{status:"dispatch_started", total, pending}`，不阻塞等到出图结束。不要自己并发 N 个 `run_one_task`。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase dispatch --state "$DATADIR/collection-state.json"
```

4. 轮询，**每完成一张就立刻展示**，不要等 10 张齐了再贴。记已展示过的 `tasks[].id`。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase status --state "$DATADIR/collection-state.json"
```

每次 status 后：找出 `status` 为 `success`（或 `dry-run`）、本轮还没展示、且 `images[0]` 文件存在的任务。**把 `tasks[].markdown` 原样贴进对话**（不要改成链接、不要包代码块、不要 `file://`）。没有 `markdown` 时按 gpt-image-2 格式自己拼，图片必须单独成行，Windows 路径用正斜杠：

```markdown
### 卖点图
卖点：双仓分格，互不串味

![卖点图 · 双仓分格，互不串味](C:/Users/me/ailili/2026-08-22/session/media/out.png)
```

禁止只贴路径或 `[点击查看](path)`——聊天里必须渲染出图片。`point` 为空时用 `desc` / `image_desc`。不要 Read 图片字节。失败项本轮不要当成功图发出。`pending > 0` 时结束本轮，过 30–60 秒再 poll。不要 `sleep` 十分钟。

5. 全部 `done: true` 后再 summary。已经在 poll 里展示过的图 **不要再贴一遍**；summary 只报成功/失败张数，失败原因可列出。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase summary --state "$DATADIR/collection-state.json"
```

若用户还没看过图，summary markdown 含 `![]()` 时原样转发，不要剥掉图片行。

`skip_s1: true` 跳过内容推理；`extract_brand_gene: false` 跳过品牌基因；`skip_confirm: true` 跳过确认（场景 E 同样跳过）。

计时日志：`$DATADIR/ailili-trace.log`（plan / dispatch 返回的 `trace_file`）。一行一个 JSON 事件，含 plan、S1、品牌基因、每张 textgen/imagegen、网关 poll。跑完把这个文件发出去即可查 17 分钟花在哪。不要 Read 整份进对话。

## 不适用

- 服饰/鞋、淘宝京东模特套图 → `ailili-aigc-imagegen-apparel`
- 去水印、SKU 换色、放大、图内翻译、单张白底精修 → `ailili-aigc-imagegen-guide`
- 小红书/包装/爆炸图等单张场景 → `ailili-aigc-imagegen-scenes`
- 无商品套图意图的生图 → `ailili-aigc-imagegen`
