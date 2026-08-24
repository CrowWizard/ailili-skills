# gpt-image-2

Local GPT Image 2 product used as the **image (and later text) compute daemon** for `ailili-aigc`.

`gpt-image-2-core` and `gpt-image-2-runtime` live in `../ailili-aigc/crates/`. This directory keeps the original skill CLI, web server, and docs:

- `crates/gpt-image-2-skill/` — original CLI (`daemon` on 8787)
- `crates/gpt-image-2-web/`
- `skills/gpt-image-2-skill/` — Agent skill wrapping that CLI
- `docs/`

Mainline Codex skills use `ailili-aigc` (port 8788), not this tree.

Start the loopback API:

```bash
cargo run -p gpt-image-2-skill -- daemon start
```

Default listen: `http://127.0.0.1:8787/api`.
