# ailili-aigc

Local AIGC gateway + Node skill clients.

**Install (copy skills + one exe only):** see [INSTALL.md](INSTALL.md).

The Agent still calls skill scripts. Those scripts are **Node (`.cjs`)**, not Python. They talk to this project’s daemon using `/aigc/imageGenAsync` and `/aigc/textGenAsync`.

Skill split:

- `skills/ailili-aigc-imagegen` — generic leaf
- `skills/ailili-aigc-imagegen-product` — non-apparel sets + A+
- `skills/ailili-aigc-imagegen-apparel` — apparel sets (prompt engine in Node)
- `skills/ailili-aigc-imagegen-guide` — single-image edits (no listing planner)
- `skills/ailili-aigc-imagegen-scenes` — 25 commercial scene templates (was `gpt-image2-ecommerce`)
- `skills/ailili-aigc-textgen` / `imagegen-brand-gene-extract` — text / brand DNA

Each skill folder is copy-paste installable (`scripts/lib` is vendored inside it). Shared source stays in `scripts/lib/`; after editing it run `node scripts/vendor-lib.cjs`. Skills call the `ailili-aigc` binary (set `AILILI_AIGC_BIN` or put it in `$AILILI_AIGC_HOME`), not sibling skill scripts.

Image (and later text) compute is configured in local providers. Queue/history/image providers live in `crates/gpt-image-2-core` and `crates/gpt-image-2-runtime` (crate names unchanged).

See [PLAN.md](PLAN.md) for the implementation plan.

```bash
# protocol smoke (stub PNG/text, no upstream model)
AILILI_AIGC_FAKE_IMAGE=1 cargo run -p ailili-aigc -- daemon start

export AILILI_TOOL_GATEWAY=http://127.0.0.1:8788
./target/debug/ailili-aigc imagegen '{"prompt":"…","imageUrls":["/path/to/product.jpg"],"outputNum":1,"resolution":"2K","aspectRatio":"1:1","quality":"high"}'
./target/debug/ailili-aigc textgen --stdin --content-only <<'JSON'
{"prompt":"Write a title","imageUrls":[],"thinkingLevel":"minimal"}
JSON
# Node wrappers still work: they exec the same binary
node skills/ailili-aigc-imagegen/scripts/aigc_imagegen.cjs '<JSON>'
node skills/ailili-aigc-imagegen-brand-gene-extract/scripts/extract_brand_gene.cjs --stdin <<'JSON'
{"images":["https://example.com/product.jpg"],"brandKey":{"salesRegion":"美国"}}
JSON
```

Outbound HTTP (text provider, reference download, gateway POST) retries transient failures up to 3 times (1s / 2s / 4s). Override with `AILILI_AIGC_RETRY_COUNT` / `AILILI_AIGC_RETRY_DELAY_SECS`. Image jobs also use gpt-image-2's provider retry.

One config: `$AILILI_AIGC_HOME/config.json` (else `$CODEX_HOME/ailili-aigc/config.json`, else `~/.ailili-aigc/config.json`). Copy [config.example.json](config.example.json).

- Image: `default_image_provider` (alias `default_provider`)
- Text: `default_text_provider`, or `OPENAI_API_KEY` + optional `OPENAI_API_BASE` / `OPENAI_TEXT_MODEL`

Daemon start binds gpt-image-2 `GPT_IMAGE_2_CONFIG_FILE` / history / jobs to this home. If the unified file has no image default, it imports `$CODEX_HOME/gpt-image-2-skill/config.json` once.

## Windows x64 binary

GitHub Action: **Actions → `ailili-aigc Windows x64` → Run workflow**. Artifact `ailili-aigc-windows-x64` contains:

- `ailili-aigc.exe`
- `SHA256SUMS.txt`

Put the binary in `$AILILI_AIGC_HOME` (Windows `ailili-aigc.exe`, Linux/macOS `ailili-aigc`), or set `AILILI_AIGC_BIN` to that file (a directory is also accepted). Wrappers also look in skill `scripts/` and `$CODEX_HOME/ailili-aigc/`.
