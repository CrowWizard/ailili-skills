# ailili-aigc

Local AIGC gateway + Node skill clients.

The Agent still calls skill scripts. Those scripts are **Node (`.cjs`)**, not Python. They talk to this project’s daemon using `/aigc/imageGenAsync` and `/aigc/textGenAsync`.

Image (and later text) compute is configured in local providers. The `../gpt-image-2` workspace is the reference queue/HTTP server to wrap — not the Agent-facing skill pack.

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

Put the exe in a skill `scripts/` folder (or set `AILILI_AIGC_BIN` to its path). The Node wrappers (`aigc_imagegen.cjs` / `aigc_textgen.cjs`) look for `scripts/ailili-aigc.exe` next.
