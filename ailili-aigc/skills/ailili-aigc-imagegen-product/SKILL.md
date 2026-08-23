---
name: ailili-aigc-imagegen-product
description: 商品图生成（非服饰类）。支持白底主图、场景图、特写图、卖点图、A+图。单张或套图。用户说"做套图""做白底图""做场景图""做卖点图""做A+图""做特写图"时触发。
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

成功后解析 `Saved full response: ["…png"]`，回复里追加 `![类型](abs_path)`，不要复述协议行。

## 套图（plan → 确认 → dispatch → poll → summary）

默认套图（场景 D、未指定 types）：卖点图×3、场景图×2、白底图×1。

1. 写 `$DATADIR/collection-job.json`（`imageUrls` 必填，优先本地绝对路径，不要 data URL）。需要时含 `brandKey` / `types` / `provider` / `resolution` / `scene`。
2. Plan（stdout 先 markdown 表，再一行 status JSON）。把表格原样转发给用户，然后 `AskUserQuestion`（确认生图 / 修改描述）：

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase plan --job "$DATADIR/collection-job.json"
```

3. 用户确认后 **只发 1 个 dispatch**。dispatch **立即返回** `{status:"dispatch_started", total, pending}`，不阻塞等到出图结束。不要自己并发 N 个 `run_one_task`。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase dispatch --state "$DATADIR/collection-state.json"
```

4. 轮询，直到 `done: true`。`pending > 0` 时结束本轮，过 30–60 秒再 poll。不要 `sleep` 十分钟。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase status --state "$DATADIR/collection-state.json"
```

5. Summary：markdown 含 `![]()`，原样转发；最后一行 status JSON 自己解析。不要剥掉图片行。

```bash
node <本skill根>/scripts/run_collection_pipeline.cjs --phase summary --state "$DATADIR/collection-state.json"
```

`skip_s1: true` 跳过内容推理；`extract_brand_gene: false` 跳过品牌基因；`skip_confirm: true` 跳过确认（场景 E 同样跳过）。
