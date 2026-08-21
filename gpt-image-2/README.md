# gpt-image-2

Local GPT Image 2 product used as the **image (and later text) compute daemon** for `ailili-aigc`.

This directory is the upstream-shaped workspace:

- `crates/` — core, runtime queue, skill CLI, loopback HTTP (`run_api_only`)
- `skills/gpt-image-2-skill/` — Agent skill; scripts are Node (`.cjs`) wrapping the Rust binary
- `docs/` — playbook, recovery, docker/web notes

`ailili-aigc` talks to this daemon over HTTP. Do not treat this tree as the LinkFox skill pack.

Start the loopback API:

```bash
cargo run -p gpt-image-2-skill -- daemon start
```

Default listen: `http://127.0.0.1:8787/api`.
