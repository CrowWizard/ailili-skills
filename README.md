# ailili-skills

Runtime install (Codex): copy skill folders + one `ailili-aigc` exe. See [ailili-aigc/INSTALL.md](ailili-aigc/INSTALL.md).

| Directory | Role |
|---|---|
| `gpt-image-2/` | Reference local daemon (queue, history, file URLs, configurable image providers). |
| `ailili-aigc/` | Local gateway + Node skills. Runtime skills live in `ailili-aigc/skills/`. See `ailili-aigc/PLAN.md`. |
| `ailili-aigc/skills/ailili-aigc-imagegen` | Generic image gen leaf (`/aigc/imageGenAsync`). |
| `ailili-aigc/skills/ailili-aigc-imagegen-product` | Non-apparel listing sets + A+. |
| `ailili-aigc/skills/ailili-aigc-imagegen-apparel` | Apparel listing sets (Node prompts, was `ecommerce-images`). |
| `ailili-aigc/skills/ailili-aigc-imagegen-guide` | Single-image edit routing (was `image-prompt-guide`). |
| `ailili-aigc/skills/ailili-aigc-imagegen-scenes` | 25 commercial scene templates (was `gpt-image2-ecommerce`). |
| `ecommerce-images/` | Source/reference only. Do not install as a skill. |
| `image-prompt-guide/` | Source/reference only. Do not install as a skill. |
| `gpt-image2-ecommerce/` | Source/reference only. Do not install as a skill. |
| `linkfox-aigc-*` | Original Python skills. Protocol/reference. |
