---
name: image-prompt-guide
description: >-
  Source copy only. Runtime skill is ailili-aigc-imagegen-guide
  (single-image product edits via local ailili-aigc-imagegen). Do not trigger this folder.
---

# Image Generation Guide

## Core Rules

| # | Rule | Description |
|---|------|-------------|
| 1 | **No Hallucination** | Do not fabricate product facts, selling points, certifications, dimensions, materials, brand assets, text, labels, hidden details, or unsupported claims. Visual execution choices such as lighting, composition, clean background, natural shadow, camera angle, whitespace, and style may be inferred when they do not change the product meaning or introduce new factual claims. After constructing a prompt, verify that all factual instructions trace back to the user request, visible image evidence, or confirmed platform requirements. |
| 2 | **Clarify Before Guessing** | Ask for clarification whenever the editing intent is ambiguous, including safe default requests like "make it cleaner/professional", "fix this image", or "optimize this photo". Do not proceed with conservative visual cleanup without confirming what the user wants. |
| 3 | **Preserve-First Editing** | When editing, stating what NOT to change is more important than what to change. Every edit prompt must include a preservation clause listing elements that must remain untouched. |
| 4 | **Be Specific** | Define subject, environment, lighting, mood, and style explicitly. Replace vague terms ("beautiful", "professional") with concrete visual descriptors. Use natural sentences for describing intent; comma-separated keywords are acceptable for style/quality modifiers (e.g., "8K, hyperrealistic, sharp detail"). |
| 5 | **Incremental Refinement** | When the user requests a follow-up change to a previous result, apply targeted edits rather than regenerating from scratch. Preserve what already works, fix only what the user calls out. |
| 6 | **No Brand Infringement** | Do not include recognizable brand logos, names, or trademarked elements unless the user explicitly requests their own brand assets. For logo design, see `references/logo-design.md` for detailed anti-infringement rules. |

---

## Reference Loading Contract

References are part of the required workflow, not optional background reading. **Confirming the sub-scenes hit by the user's request and loading every matched reference is mandatory.**

Loading mechanics:

1. Match the request to the **Scene Router** below — it is the single source of truth for scene triggers, reference files, and mode class.
2. **Load every matched scene's reference file** (`references/*.md`). Do not act from the router row alone — the enforceable rules, prompt templates, hard constraints, safety boundaries, and tool contracts live in the reference files.
3. For composite/platform workflows, load the composite reference plus the references for each selected output scene.
4. If a request matches multiple scenes for the same output image, read each matched reference, then decide whether to merge them into one call (see Multi-Intent Execution Planner).
5. Apply each loaded reference's prompt template, hard constraints, safety boundaries, and tool invocation rules.
6. **Content vs format split**: a reference owns the prompt's **content** (operation wording, hard constraints, fixed constraint text, layout keywords, safety rules). This file owns the prompt's **format** — see **Final Prompt Assembly**. A reference never decides label names, block order, or the required-block set; the assembly layer never rewords, softens, or drops reference content.

Conditional references (load only when their condition is met):

| Reference | Load when |
|-----------|-----------|
| `references/platform-product-guidelines.md` | The user has explicit platform/listing/image-set intent (names a platform, asks for "main images", "listing images", or a "product image set"). Do NOT load for generic single-image cleanup, background change, resize, or recolor. Also load its **Batch Generation** section when a batch is detected. |
| `references/resolution-routing.md` | The user specifies an output resolution (1K/2K/explicit pixels) — for upscaling an existing image or generating from scratch at a target resolution — **OR** the request enters the Priority 1 platform workflow, whose platform default AI-generation target is 2K (2048 px on the long edge; Etsy uses the short edge). In both cases load it for the pixel-translation and 16-multiple parameter rules. For from-scratch generation, take only the pixel-translation/parameter rules from it; scene routing still comes from the Scene Router. |
| `references/style-guide.md` | No specialized scene matches, or a prompt needs richer atmosphere/composition/lighting/material vocabulary. |

> **MUST NOT skip a matched reference** because the router looks sufficient, the request seems simple, or you believe you already know the rules. The router is only an index.

> **Batch Generation is a workflow modifier, not a standalone scene.** When a batch is detected, load the Batch Generation section of `references/platform-product-guidelines.md` on top of the matched output-scene references.

---

## Request Processing Pipeline

Process every request through these steps in order.

### Step 0 — Image Intake

If the user provides one or more images, inspect the image before routing.

Identify:
- Main subject
- Elements that must be preserved
- Visible text, logos, labels, watermarks
- Approximate shape/orientation (for routing only; exact pixel dimensions are measured in Step 0.5)
- Quality issues such as blur, low resolution, artifacts, occlusion
- Whether the image appears to be a product photo, poster, document, logo, model photo, or scene photo

Use this intake result to build preservation clauses and choose routing. Never infer hidden or occluded product details.

### Step 0.5 — Image Edit Source Preflight

This is a **conditional step that runs right before any `image_edit` call** — not necessarily right after Step 0. It is numbered next to Step 0 only for proximity; it does not apply to pure `image_generate` (text-to-image) or pure native operations, which never reach it. Reuse the Step 0 intake result and only add the exact-pixel measurement here.

Before any `image_edit` call, prepare every reference image:

1. **Read before edit (measure exact pixels)**: building on the Step 0 intake, confirm the image source is reachable, decodable, and image-like. You MUST capture the exact pixel width×height (e.g., `2064×1008`) — never infer orientation or ratio from visual appearance (this supersedes the approximate shape noted in Step 0). Also capture format/MIME, file size when available, visible content summary, and any quality risks. The measured W×H is the authoritative input for the dimension rule below.
2. **Local path handling**: if the user provided a local filesystem path, do not pass it directly to `image_edit`. Read and validate the local file first, upload it to the configured CDN or asset host, then use the returned HTTPS URL as the `reference_images` input.
3. **Remote URL handling**: if the user provided an HTTP(S) URL, verify that it can be read as an image before editing.
4. **Fail closed**: if the image cannot be read, decoded, verified, or converted to an HTTPS URL, stop before `image_edit` and report the blocker. Do not guess-edit an unread image or pass `file://` / raw local paths to remote image-edit tools.
5. **Preserve original dimensions (mandatory)**: keep the edited output at the source image's proportions. The parameter shape to use is defined once in **Execution Mode Resolution → parameter-shape table** — resolve the mode there, then:
   - The size/ratio values are **deterministic** — compute them once from the measured source pixels and pass them on the FIRST call. A wrong output ratio/size means the parameter was omitted or wrong; fix the parameter, do NOT retry with a different guessed ratio.
   - When passing a concrete `size` (auto modes), the source-following `size` must satisfy the **Size area bounds** (655360–8294400 px²) defined under the parameter-shape table — clamp proportionally and re-round to 16 if out of range.
   - Never let the tool silently fall back to `1:1` or an arbitrary default when the source has a different shape — this prevents unwanted cropping, stretching, or padding.
   - **Override priority (highest first)**:
     1. **Explicit user request** — a user-specified ratio/size always wins.
     2. **Platform product image set (HARD)** — for a platform image set, the platform's required ratio/size from `references/platform-product-guidelines.md` (e.g., Alibaba.com 1:1, 1000×1000) is MANDATORY. Do NOT apply the source-following rule; use the platform value regardless of the source shape.
     3. **Resolution-changing tasks** — for HD upscale or an explicit target resolution (1K/2K), pass the target `size`/`resolution` instead of the source size (see `references/resolution-routing.md`); proportions still follow the source unless overridden above.

When uploading local images, avoid exposing sensitive metadata: strip EXIF/GPS data unless the user explicitly needs it preserved, and do not log signed CDN URLs or private local paths.

### Step 1 — Outcome Intent First

Before choosing any `task_type`, identify the user's desired final outcome. This is a classification step — it does not map to reference files (the Scene Router owns that).

| Intent | Meaning |
|--------|---------|
| `platform_main_image` | Platform-ready hero/main product image |
| `platform_image_set` | Multi-image set for a listing |
| `product_cleanup` | Cleaner, more professional product photo |
| `background_replacement` | Change or replace background |
| `text_removal` | Remove specified text, ownership overlays, or visual clutter |
| `text_replacement` | Replace or translate text in image |
| `selling_point_image` | Marketing layout with copy/callouts |
| `logo_design` | Create a new logo from scratch |
| `logo_customization` | Apply existing logo to product/material |
| `upscale_or_restore` | Improve clarity/resolution |
| `native_delivery` | Resize, crop, compress, convert format |

`task_type` is only an execution hint. It must not replace outcome-intent analysis.

### Step 2 — Native vs AI Task Interception

Before invoking any AI image tool, decide whether the request should be handled by a **native (non-AI) tool** or by the **AI Image Resize scene**. The deciding factor is what the user wants to change:

- **File weight, format, or orientation without content change** → native tool.
- **Pixel dimensions or aspect ratio without content change** → AI Image Resize (`image_edit`).

#### Native (non-AI) operations

| Signal | Action |
|--------|--------|
| Crop / trim / cut to dimensions (not SKU asset creation) | Use crop/resize tool |
| Compress / reduce file size / "under X MB" | Use compress tool |
| Format convert (PNG/JPG/WebP) | Use format_convert tool |
| Rotate / flip | Use transform tool |

File-size constraints ("under 2MB") always signal native compression, not HD upscale.

#### AI dimension changes (Image Resize)

If the user asks to **resize to WxH, change dimensions, or change aspect ratio** while keeping the subject/content unchanged, load `references/image-resize.md`, compute the target size, and call `image_edit`. Phrases like "keep everything else unchanged" or "just resize" with explicit pixel dimensions strongly signal this scene.

SKU-related requests such as "split into SKU images" must go through Step 2.5 before deciding native vs AI.

**Mixed requests**: content-changing AI operations usually run first; Image Resize and final delivery ops (crop, compress, format conversion) usually run last. Only run crop/resize first when the user explicitly requires a fixed canvas before editing.

> If the Agent toolset lacks a dedicated resize/compress tool, inform the user that this operation is not supported by the AI image tools and suggest alternatives.

### Step 2.5 — SKU Asset Workflow

First classify the user's SKU intent before selecting tools.

| SKU Intent | User Signals | Route |
|------------|--------------|-------|
| **Extract existing SKUs** | "split/crop/separate each SKU", "do not change products", "export each visible style" | Use native crop/segmentation/background removal first. Do not redraw products. |
| **Standardize SKU listing images** | "make each SKU into a listing/main image", "white background SKU images", "same style/composition for each SKU" | First isolate each visible SKU, then use `image_edit` per SKU with strict product fidelity. Final resize/format is native. |
| **Generate SKU variants** | "generate colors/styles", "create red/blue/green variants", "make more SKU options" | Use `image_edit` with SKU Color Change when a reference exists; use generation only when the user explicitly asks for new variants. |

Rules:
- Never invent SKU count, colors, materials, or variants unless the user explicitly requested them.
- For batch SKU work, first identify the expected output count. If unclear or visual separation is ambiguous, ask for confirmation.
- For listing-ready SKU images, output one image per SKU. Do not satisfy a multi-SKU request with one combined image.
- Preserve each SKU's exact color, pattern, shape, material, labels, accessories, and visible details.

### Step 3 — Ambiguity Check

| Ambiguity Signal | Action |
|------------------|--------|
| No actionable verb ("edit this", "process these") | Ask what specific changes are needed |
| Safe default subjective requests ("make it cleaner / more professional / optimize / fix this image") | Ask the user what specific changes they want before editing |
| Context-only reply ("yes", "go ahead") with no prior clear instruction | Ask what the user would like done |
| Folder/batch reference without per-image instructions | List files and ask what operation to apply |

Do not apply safe visual defaults (cleaner background, balanced composition, softer lighting, etc.) without first confirming the user's intent. Do not add new claims, text, logos, certifications, dimensions, materials, or product features unless the user provides them.

Ask with specific, selectable options when the host provides a prompt UI; otherwise ask a concise plain-language question (e.g., "What would you like to do: change background, remove watermark, adjust colors, add text, or something else?").

Once the user has confirmed the outcome and all factual inputs that could change product meaning, do not keep asking them to art-direct the image. Infer safe visual execution choices such as composition, camera, lighting, spacing, and typography treatment through the **Prompt Enhancer** below. Ask again only for missing product facts, claims, exact copy, platform/language decisions, or a genuine creative fork that would materially change the requested outcome.

### Step 4 — Scene Routing (match + load)

Match the request against the **Scene Router** below (Priority 1 → 4). Use the first matching priority level. **After matching, load every matched scene reference per the Reference Loading Contract before constructing the prompt or choosing `task_type`.**

**Batch generation check (parallel)**: If the user uploads multiple images and asks for the same operation on all of them, this is a batch-generation workflow. Route to the appropriate output scene(s) **and** load `references/platform-product-guidelines.md` (Batch Generation section). Do not treat it as a single-image request repeated N times.

### Step 5 — Multi-Intent Execution Planner

If the request contains **2 or more intents** (including mixed AI + non-AI), plan by output image and minimize AI calls. Decomposition is for reasoning; it does not automatically mean sequential execution.

1. **Identify** all requested intents and the expected output count.
2. **Separate native delivery intents**: resize, crop, compress, rotate, and format conversion usually run last with native tools and should not trigger an AI call.
3. **Group AI intents by output image**: if several visual changes belong to the same final image, merge them into one prompt when the tool can satisfy them together.
4. **References are already loaded** in Step 4 for every matched scene.
5. **Choose execution mode**:
   - `single_purpose`: only when the request exactly matches one dedicated task and no other visual/layout/platform changes are needed.
   - `merged_standard`: one merged call under the **resolved mode** for compatible product-fidelity edits (scene/background, white/light hero styling, centering, shadow, lighting cleanup, local cleanup, logo placement, product color change).
   - `merged_dense`: one merged call under the **resolved mode** for dense layouts, selling-point images, comparison grids, tech packs, or multi-region visual design in a single output.
   - `true_sequential`: only when a previous output is required before the next step, when tool limitations force it, or when the user explicitly requests separate intermediate outputs.
6. **Execute the minimum number of AI calls** needed for the requested output count, then apply native delivery operations last.
7. **Aggregate** results and state any skipped or native-only operations.

**Cost guard**:
- Prefer one AI call per requested output image.
- Do not multiply calls by the number of detected intents when they can be expressed in one prompt.
- If a plan would require more AI calls than the requested output count, compress the plan first; ask or explain only when compression would reduce quality or violate safety/tool constraints.
- Platform image sets and SKU batches may require multiple calls because the user expects multiple output images, but each output should still use the fewest feasible calls.

**Merge examples**:

| Request | Preferred Execution |
|---------|---------------------|
| "Amazon main image with white background, centered product, natural shadow" | Load Platform + White Background, then one merged edit call (standard scene, resolved mode) |
| "Remove small clutter, change to white background, improve lighting" | Load relevant references, then one merged edit call (standard) unless clutter is a complex authorized watermark |
| "Change product to red and put it on a gray studio background" | Load SKU Color Change + Scene Image, then one merged edit call (standard) |
| "Add my logo and make it a clean listing hero" | Load Logo Customization + Platform/White Background, then one merged edit call (standard) |
| "Create 5 Alibaba listing images" | One planned call per requested output image, not one call per sub-intent inside each image |
| "Set image showing the product in a room, with a headline and three labeled callouts" | One composite slot: load Scene Image + Selling Point, one merged edit call (dense-layout) |

Use `true_sequential` for cases such as isolating each SKU before standardization, removing a dense watermark before a high-fidelity edit, or generating separate tech-pack drawings requested as distinct outputs.

---

## Scene Router

> **This is the single source of truth for routing.** Each row gives the triggers, the reference file to load, the mode class (`standard` / `dense-layout` — see Execution Mode Resolution), and the disambiguation boundary. Reference loading is mandatory after matching (see Reference Loading Contract).

### Priority 1 — Platform Product Image (Composite)

| Trigger | Reference | Mode | Disambiguation |
|---------|-----------|------|----------------|
| User names an e-commerce platform (Amazon, eBay, Walmart, Shopify, Etsy, AliExpress, TikTok Shop, Shopee, Lazada, Alibaba.com, 1688) AND requests main image / image set / listing images | `references/platform-product-guidelines.md` + each selected output scene | per sub-scene | No platform/listing/image-set intent → route to the single scene instead |

Platform Product Image is a composite workflow — it consults platform requirements first, then delegates to White Background, Scene Image, Model Showcase, etc. as sub-tasks. Each planned output is a **composite slot** that may stack several of those scenes (base visual + copy + graphics + model + accessories); plan by requested output image and merge all of a slot's layers into one call per Step 5.

**Sub-task execution rules:**
- When the user uploaded product images, ALL sub-tasks MUST use `image_edit`. Never use `image_generate` when reference images exist.
- Sub-tasks needing user-supplied required inputs may trigger clarification first: **Selling Point** (selling points inferred), **Process Flowchart** (production stages inferred), **Logo Design** (brand name/context missing).
- All other sub-tasks execute directly unless safety or missing required inputs block execution.

**Platform image set planner** — when the user requests multiple listing images, create a plan before generation. Each planned image is a **composite slot**, not a single scene: resolve its layer stack and archetype via `references/platform-product-guidelines.md` → **Composite Slot Model**, then load the reference for its base visual layer AND for every overlay layer it uses (copy, graphics/callouts/steps/cutaway, model, accessories, second subject). The list below names each slot's **base layer only**:

1. Hero/main image — full product, clean white/light background, no promotional text unless the platform allows it → load `references/white-background.md`
2. Scene image — a real, furnished use-context environment while preserving the product → load `references/scene-image.md`. **This is the default base for supporting slots**; satisfy `platform-product-guidelines.md` → **Scene layer richness** (place identity, closed 6–9 named element list with material + position, three depth planes, named light, depth of field, art-direction register)
3. Selling-point image — only user-provided or visible/verifiable claims → load `references/selling-point.md` (including its **Step 5: Typography Design** whenever the image carries copy)
4. Structure / steps / contents image — how it works, how it is operated or maintained, what is included → load `references/selling-point.md` (layouts ⑥⑦⑧) plus the base-layer reference
5. Model / human-interaction image — a person or hands **using or presenting** the product → load `references/model-showcase.md` + `references/scene-image.md`. Plan it per product per `platform-product-guidelines.md` → **Human interaction planning** (typically 1–2 slots in a set)

> **Human interaction is judged, not stamped.** Decide which slots genuinely benefit from a person, then pick the level **from the product**: for products people **sit in, lie on, or rest their body against** (massage chair, pedicure/spa chair, mattress, sofa, bathtub) show an **occupant actually using it** — reclined, feet in the basin, hands on the armrests — not a hand touching the frame; hands-only for hands-on operation (removing/refilling/cleaning a part); partial body for observe/app-controlled use; full body for floor-standing scale or "it runs while you're out" narratives; for pet/baby products the cared-for subject may carry the life instead of a person. **No disembodied arm reaching in from off-frame more than once per set.** Every person/hand needs a stated action — no idle bystander — and none belongs in the hero, cutaway, contents, or dual-state slots. TikTok Shop is the platform exception that does require human presence in most slots.

> **Assign one unique message per slot before anything else.** Use the message taxonomy in `platform-product-guidelines.md` → **Slot differentiation contract** (what it is / where it's used / who uses it / how it works / how it's operated / how it's cleaned / what's included / configuration options / scale / material). Two slots that reduce to the same sentence are duplicates — and a mirrored or slightly re-angled version of another slot is a duplicate, not a variation. Fix duplication by changing the **message** first, then the scene, then the shot scale.

> **No detail-crop slot.** `references/image-detail.md` is for a standalone close-up the user explicitly asked for — never plan it as a set slot. When a close range is needed inside a set, frame it tightly **inside a real scene** and add labels or a hand.

> **Only the hero may be a single-capability image; every supporting slot MUST be composite.** A supporting slot is `base layer + at least two enrichment layers` (copy, callouts/steps/cutaway, model/hand interaction, accessory line-up, companion device) chosen from what the platform permits — see `references/platform-product-guidelines.md` → **Supporting-slot enrichment mandate**. Keep ONE AI call per slot, load every layer's reference, and treat it as **dense-layout** (a slot enriched only with a person stays standard). A bare alternate-angle shot, an unlabeled close-up, or a plain lifestyle photo does NOT satisfy a supporting slot — deliver those only as extras beyond the required set. When the platform bans in-image text/graphics (e.g. TikTok Shop, eBay), meet the minimum with non-text layers instead; never smuggle in forbidden copy. The hero slot is the only exception: when the platform mandates a white background or bans overlays, it stays base-layer-only.

> **Vary how each slot speaks.** Satisfy `platform-product-guidelines.md` → **Expression-mode diversity**: ≥3 distinct expression modes in a 4-image set (≥4 for 5–6, ≥5 for 7+), and **at most ONE slot with leader lines / callout labels**. The default carrier of a slot's message is photography plus a headline — not annotation. Never repeat "product + a few leader lines + short labels" across the set, and never label visible parts outside that single annotated slot.

Rules: generate/edit one final image per planned output (do not split one planned output into multiple AI calls unless Step 5 requires `true_sequential`); if the tool produces one image per call, run multiple calls or state the limitation; output count must match the requested count when feasible; for uploaded product images every planned image must preserve product identity and use `image_edit`.

> **In-image language (for any planned image that will contain text)**: resolve the target language and write it explicitly into that image's prompt per `references/platform-product-guidelines.md` → **Default In-Image Language**. When the user did not specify a language, also run its **Source-Text Language Conflict Check** (compare the source image's non-brand text language to the platform default; on conflict, ask the user to keep the original language or translate to the platform default before generating).

### Priority 2 — Single-Operation Scenes

Exact single-operation requests. Resolve the execution mode via **Execution Mode Resolution**. Express the operation through the prompt.

| Scene | Trigger Keywords | Reference | Mode | Disambiguation |
|-------|-----------------|-----------|------|----------------|
| **White Background** | white/pure white bg, remove background to white/transparent, transparent PNG, cutout, no background, alpha channel | `references/white-background.md` | standard | Non-white/scene background → Scene Image; native resize/crop only → native |
| **Watermark / Element Removal** | remove authorized watermark, URL/contact/QR overlay, accidental overlay, non-product object/clutter | `references/remove-watermark.md` | standard | Product/package text or brand mark → Text Editing (local removal) |
| **HD Upscale** | upscale, enhance resolution, make clearer, sharpen, higher quality | `references/hd-upscale.md` | standard | File-size increase/format conversion → native; explicit target resolution → `references/resolution-routing.md` |
| **Image Resize** | resize to WxH, change dimensions, scale to, aspect ratio W:H, make it Xpx wide/tall, square | `references/image-resize.md` | standard | Content changes/crop/compress/format only → native |

**Single-Operation Use Rule**: route here only when the request exactly matches the single operation and needs no layout, composition, lighting, platform compliance, text editing, or multiple visual changes.

**Single-Operation Fallback** — switch to a merged plan (or `true_sequential`) when: the request has 2+ intents; the user asks for platform-/listing-ready output; the user uses broad language ("professional", "optimized", "cleaner", "main image", "selling image"); or the user requests follow-up edits after the initial operation.

### Priority 3 — Specialized Editing Scenes

| Scene | Trigger Keywords | Reference | Mode | Disambiguation |
|-------|-----------------|-----------|------|----------------|
| **Scene Image** | scene shot, change/swap background, place in environment, lifestyle shot | `references/scene-image.md` | standard | Pure white bg only → White Background; recolor only → SKU Color Change; text only → Text Editing |
| **SKU Color Change** | recolor product, change product color, SKU color variant | `references/sku-color-change.md` | standard | Background color change → Scene Image |
| **Logo Customization** | print logo on product, logo mockup, emboss/engrave/stamp logo | `references/logo-customization.md` | standard | Design a new logo from scratch → Logo Design |
| **Model Showcase** | model photo, add model, model wearing/holding product | `references/model-showcase.md` | standard | Model + new lifestyle scene → also load Scene Image; + selling-point copy → also load Selling Point |
| **Image Detail** | detail shot, zoom in, close-up of texture/stitching | `references/image-detail.md` | standard | Callouts/annotations/dimensions/marketing copy → Selling Point |
| **Selling Point Image** | selling point image, highlight features, comparison image, vs competitors, how it works / internal structure, usage or cleaning steps, dual mode/state | `references/selling-point.md` | standard / dense-layout | Local detail crop without text/layout → Image Detail; manufacturing "how it's made" flow → Process Flowchart |
| **Image Translation** | translate text in image, convert image text to [language] | `references/image-translation.md` | standard | Same-language replace/fix/add text → Text Editing |
| **Text Editing** | change text, replace text, fix typo, update price/date | `references/text-editing.md` | standard / dense-layout | Cross-language translation → Image Translation; marketing copy/layout → Selling Point |
| **Logo Design** | design a logo, create brand mark, logo from scratch | `references/logo-design.md` | dense-layout (generate); standard (edit existing) | Apply existing logo to product → Logo Customization |
| **Tech Pack** | tech pack, dimension drawing, manufacturing spec, assembly diagram | `references/tech-pack.md` | dense-layout | Consumer selling-point infographic → Selling Point |
| **Process Flowchart** | process flow, manufacturing flow, craft flow, how it's made, production process diagram | `references/process-flow.md` | dense-layout | OEM technical drawings → Tech Pack; text-only explanation → respond with text |

> **Image Translation mandatory rule**: when the user requests an edited translated image, load `references/image-translation.md` and call `image_edit` after required inputs are available. Do not substitute a text-only translation for an image-edit request.

### Priority 4 — General (Fallback)

If no specialized scene matches, use semantic instructions and choose the tool by whether a reference image exists:

- **No reference image** (text-to-image): use `image_generate` under the resolved mode.
- **Reference image provided**: use `image_edit` under the resolved mode.

Refer to `references/style-guide.md` for prompt enrichment vocabulary (atmosphere, composition, lighting, materials).

### Strict Product Fidelity Mode (Identity Match)

Enable whenever the user asks to keep the product unchanged, produce platform/listing images from a reference, remove/replace text while preserving the product, make a white-background hero, or change only the surrounding scene/background.

This mode enforces **identity match** (the generated subject reads as the same product as the source), NOT a pixel-frozen copy. Camera angle, pose, distance, and subject position are free to change; the product's intrinsic identity is not. The allowed/forbidden lists are defined once in the **Identity Match Contract** below.

Append this constraint to all relevant `image_edit` prompts:

```
Keep the product identity unchanged — preserve geometry, proportions, color, material, texture, prints, logo, and on-product text.
Camera angle, pose, and composition may change to fit the shot. Only change: [describe allowed changes here].
Do not redraw, simplify, recolor, or invent any product detail.
```

Keep the constraint concise (≤3 lines). Verbose lists (20+ protected items) do not improve compliance and can reduce execution quality. When product identity conflicts with a creative instruction, identity match wins unless the user explicitly asks to redesign the product. When this mode is active, treat the task as a **standard scene** under Execution Mode Resolution unless the loaded reference requires dense layout or annotations.

### Identity Match Contract (single source of truth)

Every scene, reference, and prompt template uses one definition of "the generated subject is consistent with the original." "Fidelity", "preserve the product", and "product consistency" throughout this skill all mean **identity match**, defined here:

**MUST stay unchanged (product intrinsic identity):**
- Geometry / silhouette / structural parts and their proportions
- Color and color family
- Material and surface finish
- Texture and weave
- Prints, patterns, and graphics
- Logo and brand marks
- On-product / on-package text and labels

**MAY change (framing and presentation — vary these freely to serve the shot):**
- Camera angle and viewing perspective
- Shot distance / focal length / crop (景别: close-up ↔ full shot)
- Subject position within the frame and composition
- Product placement pose and orientation (within physical plausibility)
- Background / environment / lighting / shadow

> Adjusting an item in the "MAY change" list is never a fidelity failure — it is expected. A result fails identity match only when an item in the "MUST stay unchanged" list is altered, or when the change breaks physical plausibility. Do NOT freeze camera angle or composition in the name of fidelity.



---

## Execution Mode Resolution (single source of truth)

This is the **only** section that decides the execution mode / `task_type` and the parameter shape. All reference files and other sections defer to it. A reference only declares whether its scene is **standard** or **dense-layout**, and whether it generates from scratch (`image_generate`) or edits (`image_edit`). It never hard-codes a task_type.

### Step A — Detect tool capability

Before selecting any `task_type`, inspect the actual tool schema available in the current runtime. Do **not** assume a mode is supported and do **not** default to `simple`/`simple_generation` without this check.

- `image_generate`: if `auto` is in the valid `task_type` enum, auto mode is supported.
- `image_edit`: if `auto_generation` is in the valid `task_type` enum, auto mode is supported.
- If the schema does not expose `auto`/`auto_generation`, auto mode is unavailable.
- If you cannot inspect the schema, attempt `auto`/`auto_generation` only when the host runtime explicitly advertises it; otherwise treat it as unavailable.

### Step B — Resolve the mode

| Tool supports `auto`? | Standard scene | Dense-layout scene |
|-----------------------|----------------|--------------------|
| `image_generate` supports `auto` | `auto` | `auto` |
| `image_edit` supports `auto_generation` | `auto_generation` | `auto_generation` |
| `image_generate` does NOT support `auto` | `simple` | `complex` |
| `image_edit` does NOT support `auto_generation` | `simple_generation` | `complex_generation` |

- When `auto`/`auto_generation` is available, **always prefer it** — it lets the tool decide simple vs complex internally.
- When unavailable, fall back to `simple`/`simple_generation` for standard scenes, and `complex`/`complex_generation` only for dense-layout scenes.

> **Anti-default guard**: never choose `simple`/`simple_generation` just because it is "safer" or because you skipped the schema check. The parameter shape differs by mode (see below); passing the wrong shape silently degrades output quality or resolution.

### Scene class

**Standard scenes** (fall back to `simple`/`simple_generation`): white background, HD upscale, watermark/element removal, scene/background swap, SKU recolor, model showcase, image detail, logo customization, image translation, single-region text editing, image resize, and any product-fidelity edit.

**Dense-layout scenes** (need `complex` fallback when `auto` is unavailable): selling-point images with multi-region layout / comparison grids, tech pack drawings, logo design generation from scratch, multi-region or difficult perspective/curved text editing, full creative posters / infographics.

White background, HD upscale, and watermark/element removal are standard — express their intent through the prompt (e.g., "replace background with pure white #FFFFFF", "enhance resolution and sharpness without changing any content", "remove the authorized watermark/overlay only") and run them under the resolved mode.

### Parameter-shape table (authoritative)

This table is the single definition of which parameters each mode accepts. `Step 0.5`, `Aspect Ratio`, and `references/resolution-routing.md` all defer here.

| Resolved mode | Required parameter shape | Forbidden |
|---------------|--------------------------|-----------|
| `auto` / `auto_generation` | `size: "<W>x<H>"` (concrete pixels; both multiples of 16). For source-following, use the measured source `size` + closest `aspect_ratio`. For a resolution target, long edge = target px, short edge from source ratio. | Do NOT pass `resolution` + `aspect_ratio` as a substitute for `size` |
| `simple` / `simple_generation` | closest supported `aspect_ratio` (Auto-Match Table) + `resolution` (`"1K"`/`"2K"`) when a resolution is specified | Do NOT pass raw pixel `size` |
| `complex` / `complex_generation` | same as simple: closest `aspect_ratio` + `resolution` | Do NOT pass raw pixel `size`; avoid for HD upscale / product-fidelity edits unless forced by tool limitations |

#### Size area bounds (applies whenever a concrete `size` is passed — i.e. `auto` / `auto_generation`)

The final pixel `size` must have a total area (W × H) within **655360 – 8294400** px². This applies to a user-provided `size` and to a source-following `size` measured in Step 0.5. If the area falls outside the range, scale the dimensions proportionally to bring it in range, then re-round to multiples of 16 — do NOT crop, stretch, or change the aspect ratio.

1. Compute area `A = W × H`.
2. If `A < 655360` → scale up by factor `f = sqrt(655360 / A)`. If `A > 8294400` → scale down by factor `f = sqrt(8294400 / A)`. If within range → no scaling.
3. Apply `f` to both edges: `W' = W × f`, `H' = H × f`.
4. Round both `W'` and `H'` to the nearest multiple of 16 (keeping aspect ratio as close as possible).
5. Use `W'×H'` as the final `size`.

> Example: source `640×640` (A = 409600, below the floor) → `f = sqrt(655360/409600) ≈ 1.2649` → `809.5×809.5` → round to 16 → **`816×816`** (A = 665856, in range). Example: source `4000×3000` (A = 12,000,000, above the ceiling) → `f = sqrt(8294400/12000000) ≈ 0.8315` → `3325.9×2494.4` → round to 16 → **`3328×2496`** (A ≈ 8,306,688 ≈ within tolerance; nudge the long edge down one step to `3312×2496` if a hard ceiling is required). This area clamp is a size-only adjustment; the parameter shape and mode selection above are unchanged. `simple`/`complex` modes pass `aspect_ratio`+`resolution` (no raw `size`) and are not affected.

> `aspect_ratio` controls proportions only; `size`/`resolution` control output pixels. If the constructed parameters do not match the resolved mode, revisit Step A and correct the set before invoking the tool.

### Simple vs Complex (when auto is unavailable)

`complex_generation` is higher-risk for product-fidelity tasks because many runtimes treat complex edits as broad redraws rather than localized edits. **Default to `simple_generation`** unless the task genuinely needs dense layout, annotations, comparison grids, or full-image design composition. A visually rich background or detailed scene is still a `simple_generation` task when the product is preserved. If using `complex_generation` with a product reference, always enable Strict Product Fidelity Mode.

| Scenario | task_type |
|----------|-----------|
| Background swap / scene change (product preserved) | `simple_generation` |
| Single-region edit (recolor, remove object, add logo) | `simple_generation` |
| White/light hero image, platform main image (product preserved) | `simple_generation` |
| Model showcase with product | `simple_generation` |
| Localized product/package text removal | `simple_generation` (Text Editing local removal) |
| Authorized watermark/contact/QR/non-product overlay removal | `simple_generation` (watermark_removal intent) |
| Dense annotations / selling-point layout / comparison grid | `complex_generation` |
| Multi-region independent edits in one image | `complex_generation` |
| Full creative poster / heavy compositional redesign | `complex_generation` |
| Tech pack with dimension callouts | `complex_generation` |

**Rule of thumb**: if the product must stay unchanged, use `simple_generation`. "Complex" in the user's wording (rich background, detailed scene) does not mean `complex_generation`.

### Misrouting guard (quick reference)

| User Request | Avoid | Prefer |
|-------------|-------|--------|
| "Make this an Amazon main image" | single-purpose white background only | Platform workflow + prompted edit |
| "Make it cleaner / professional / optimize" | HD upscale or any single-purpose type | Clarify intent → product cleanup / platform intent |
| "Remove text and make white background" | watermark_removal only | Load Text Editing/Watermark + White Background → one merged edit call (standard) |
| "Change background and improve lighting" | white background only | Load Scene Image → one merged edit call (standard) |
| "Turn this into a listing image" | any single-purpose type | Platform or product image workflow |

> `task_type` is an execution hint, not the user's intent. Always: (1) identify the final outcome, (2) list required visual changes, (3) check whether one mode satisfies them all, (4) otherwise use a merged or `true_sequential` plan per Step 5.

---

## Prompt Construction

The formulas below are base skeletons, not complete production prompts. Every prompt goes through the same three-stage pipeline:

**reference (content) → Mandatory Prompt Enhancer (completeness) → Final Prompt Assembly (format) → Prompt-Intent Validation Gate (gate) → tool call**

A matched reference remains authoritative on content: the Enhancer fills safe missing execution detail but never relaxes, replaces, or contradicts reference rules, and the Assembly layer only decides how that content is laid out in the final string.

### Mandatory Prompt Enhancer

Convert the confirmed request, image intake, output plan, and loaded reference rules into one self-contained production prompt per output image. Enhance only fields relevant to that image's role; completeness matters more than length.

#### 1. Separate facts from visual decisions

- **Facts — never invent**: product count/SKU, geometry, color, material not visibly supported, packaging text, claims, dimensions, certifications, included accessories, hidden parts, and exact marketing copy. Take these only from the user, visible image evidence, or confirmed platform rules.
- **Safe visual decisions — infer when unspecified**: image-role-appropriate composition, framing, viewpoint, lens character, focus, depth of field, lighting direction/quality, shadow behavior, whitespace, restrained color treatment, and typography styling for confirmed copy.
- Minimal category-appropriate scene props may be inferred only when the requested scene needs them; keep them secondary and never imply that they are included with the product.
- Record uncertainty as a constraint (`do not reveal or invent <hidden detail>`) instead of filling it creatively.

#### 2. Build a set lock for multi-image requests

Before writing per-image prompts, define an internal set lock containing: product identity invariants, shared art direction, palette, lighting language, type system, graphic language, and continuity rules. Reuse the same shared style wording verbatim across the set. Give each image one primary role/message and vary only what that role requires: layout, camera, scene, detail region, or information module.

#### 3. Expand each image through the relevant blocks

Use the following order. Omit conditional blocks that do not apply; never output empty labels.

| Block | Minimum useful detail |
|---|---|
| **Task / role** | Intended use and the single primary objective of this image |
| **Input authority** | Identify each input image's role and the product source of truth |
| **Canvas** | Aspect ratio, orientation, and safe margin or mobile-readability intent when relevant |
| **Subject** | Exact count, hierarchy, orientation, visible face/label, and interaction |
| **Composition** | Layout skeleton, relative placement, subject scale/occupancy, spacing, depth order, negative space, and occlusion rules |
| **Camera** | For photographic/3D work: shot scale, viewpoint, lens character, focus target, depth of field, and perspective constraints |
| **Scene** | Background, support surface, foreground/midground/background roles, and restrained prop placement |
| **Lighting / physics** | Key-light direction and softness, fill/rim only when useful, contact/cast shadows, reflection or ambient occlusion, and physical grounding |
| **Materials / color / style** | Important surface finish and light response, palette, contrast, white balance, and concrete art direction |
| **Typography** | Only for confirmed text: exact copy, language, role/hierarchy, font class, relative size, color, position, alignment, max width/line count, and `no extra text` |
| **Graphics** | For callouts/lines/cards/icons: exact count, geometry, position, source/detail mapping, anchors, and crossing/occlusion rules |
| **Prompt contract** | Allowed changes, hard product invariants (≤3 lines), a concise avoid list (≤8 items, no nameable objects), and observable acceptance checks — the checks are kept **agent-side** and never emitted in the prompt |

Use relative spatial language first (`back-left`, `upper text zone`, `fills about two-thirds of the frame`). Use percentages or coordinates only when they materially reduce ambiguity in dense layouts, callouts, or repeated failed positioning; avoid fake precision.

> **Exception — platform image-set slots**: quantified staging is mandatory there. State the product's occupancy % and position zone, plus each secondary subject's (pet, person, phone, accessory) occupancy %, position, and action, per `references/platform-product-guidelines.md` → **Scene layer richness** and its **Slot brief template**.

#### 4. Apply role-specific depth

- **Exact single operations** (resize, upscale, text replacement, authorized removal, local detail crop): keep enhancement minimal. Preserve the loaded reference template and add only missing constraints needed to prevent drift. Do not add new art direction.
- **Standard product visuals** (hero, white background, alternate arrangement, model, scene): fully specify composition, camera, lighting, grounding, material response, and product invariants.
- **Dense information visuals** (selling point, comparison, process flow, tech pack, multi-region poster): also fully specify typography, graphic geometry, mapping, information hierarchy, and no-extra-content rules.
- **Detail images**: use only a visibly supported source region; do not reconstruct hidden structure or add marketing layout unless the user requested it.
- **Platform hero images**: platform and loaded-reference prohibitions override enhancement; do not add props or overlay copy when forbidden.

#### 5. Compile and check

Write each block in concise natural English, then hand the completed blocks to **Final Prompt Assembly** below — that section owns the label names, block order, and required-block set. Do not invent an ad-hoc layout and do not emit a free-form paragraph. The final tool prompt must stand alone; do not rely on unstated conversation context or a separate shared brief.

Before the existing **Prompt-Intent Validation Gate**, check five ambiguity classes:

1. **Identity** — product count, visible structure, labels, and source authority are unambiguous.
2. **Space** — subject, copy, graphics, props, depth, whitespace, and forbidden overlaps have defined relationships.
3. **Photography** — camera, focus, lighting, shadow, reflection, and grounding form one coherent setup when applicable.
4. **Design** — exact copy, hierarchy, placement, and graphic mapping are complete when text/graphics are present.
5. **Boundary** — allowed changes, invariants, avoid items, and the 3–6 observable acceptance checks (recorded agent-side) do not contradict each other.

If a missing item is a safe visual execution choice, infer it and complete the prompt. If it is a missing fact or unsupported claim, ask the user or omit it; never guess.

### Final Prompt Assembly (single source of truth for prompt FORMAT)

**Division of responsibility** — references supply CONTENT, this section supplies FORMAT:

| Layer | Owns | Must not |
|---|---|---|
| Reference (`references/*.md`) | operation wording, prompt templates, fixed constraint text, layout keywords, hard constraints, safety rules | define label names, block order, or the required-block set |
| Final Prompt Assembly (this section) | label names, block order, required blocks per tier, tier resolution | reword, soften, shorten, or drop reference content |

Every `image_edit` / `image_generate` prompt MUST be emitted as a **labeled block string** using the canonical labels and order below, written in English. A free-form paragraph without labels is not a valid output.

#### Step A — Resolve the assembly tier

| Tier | Applies to | Required blocks |
|---|---|---|
| `minimal` | exact single operations where the reference forbids new art direction: image resize, HD upscale, watermark/element removal, pure white-background replacement, single-region text editing, image translation, SKU color change | 1, 3, 11–13 (2 conditional) |
| `standard` | standard scenes that need a full photographic setup: scene/background swap, platform white hero, model showcase, image detail, logo customization, alternate arrangement, any merged product-fidelity edit | 1, 3–8, 11–13 (2 conditional) |
| `dense` | dense-layout scenes: selling-point / comparison layouts, tech pack, process flowchart, logo design generation, multi-region text editing, full poster or infographic | 1, 3–13 (2 conditional) |

Tier follows the scene's mode class from the **Scene Router** plus the reference's Apply Method: a reference that forbids added art direction ("Do not add creative scene, layout, or marketing content") forces `minimal` even if the request sounds elaborate. Merging two or more intents into one output image raises `minimal` → `standard`.

#### Step B — Canonical block schema (fixed labels, fixed order)

Only these 13 blocks may appear in the string sent to the tool. Every block must carry information that the model cannot derive from another block or from a call parameter.

| # | Label (verbatim) | Tier | Content source and scope limit |
|---|---|---|---|
| 1 | `Asset type:` | all | the output image's role from Step 1 outcome intent / platform planner slot. **Genre/role prior only** — do NOT restate aspect ratio or pixel size (already carried by `size` / `aspect_ratio`) |
| 2 | `Input images:` | **conditional** — required when 2 or more input images are passed; also allowed for a single input whose on-image text/labels must be preserved verbatim. Omit for a plain single-image edit (block 11 already asserts the source of truth) and for pure text-to-image | each input image's role + which image is the product source of truth |
| 3 | `Primary request:` | all | the reference template / rewriter output — see Step C mapping |
| 4 | `Canvas and composition:` | standard, dense | Enhancer **Canvas** + **Composition**. Relative spatial language first; percentages only where they remove real ambiguity — **except platform set slots, where the product's occupancy % + position zone and every secondary subject's occupancy %/position/action are required**. Do NOT restate ratio/pixel size. When the loaded reference requires composition preservation, this block must say "keep the source framing, subject scale, and position" instead of inventing new framing |
| 5 | `Camera:` | standard, dense (photographic work) | Enhancer **Camera**; may be folded into 4 as `Canvas and camera:`. Omit entirely when the reference forbids reframing |
| 6 | `Scene/backdrop:` | standard, dense | Enhancer **Scene**. Name the place, the three depth planes, and the environment elements as a **positive closed list** with material + position, sized to the shot's role (**a platform lifestyle slot needs 6–9 named elements**: support surface, background architecture, one furniture anchor per side, 2–4 secondary props, one organic element), ending with "no other objects" — this is where prop control lives, not in block 13. A platform hero, cutaway, or flat-lay slot instead names the clean studio/fabric surface and backdrop only |
| 7 | `Lighting and grounding:` | standard, dense | Enhancer **Lighting / physics** — key direction/softness, fill, contact shadow, ambient occlusion, reflection, single coherent light |
| 8 | `Materials, color and style:` | standard, dense | Enhancer **Materials / color / style**, **environment side only**: palette, contrast, white balance, grade, a named art-direction register (e.g. "refined Scandinavian interiors editorial") with an anti-ad clause, and how the environment lights the product. The product's own material/finish belongs to block 11 — never state it twice |
| 9 | `Typography:` | dense, **and any tier whose output contains added text** | confirmed exact copy only + the design decisions from `references/selling-point.md` → **Step 5: Typography Design** (skeleton zone, relative type scale, weight/colour pair, alignment, margin) + `no other text`. Copy is customer-facing wording only — it must state a benefit, scenario, spec, or instruction; never a part name outside the single annotated slot, never briefing vocabulary ("front view", "visible components", occupancy numbers, slot names), and never a line that merely describes the photograph ("… Setting", "… Context", "Product shown in …") |
| 10 | `Graphics and callouts:` | dense (callouts, leader lines, grids, arrows, cards, icons) | exact count, geometry, position, anchors, crossing rules. **In a platform image set, leader-line/callout annotation is allowed in at most ONE slot** (`platform-product-guidelines.md` → **Expression-mode diversity**); other slots use column/panel/flat-lay geometry or screen cards, or omit this block entirely |
| 11 | `Product invariants:` | all tasks with a product | **Identity Match Contract** + the reference's fixed constraint text. **Hard cap: ≤3 lines.** Do not enumerate 20+ protected items — it does not improve compliance and degrades execution |
| 12 | `Allowed changes:` | all | short **closed** allow list ending with `only`. Not a restatement of `Primary request:` |
| 13 | `Avoid:` | all | **Hard cap: ≤8 items**, and only negations that cannot be expressed positively elsewhere — e.g. no added text, no watermark, no altered spelling, no floating product, no extra/duplicated product, no reconstructed hidden parts. **Never name a paintable object** ("no flowers, no candles, no stones") — naming it invites it; control props positively in block 6 instead |

Omit a block that does not apply — never emit an empty label. Do not add labels outside this list, do not rename them, and do not reorder them.

> **Do not add a `Use case:` / task-type line.** Whether the call is an edit or a from-scratch generation is already carried by the presence of `Input images:` and by the `task_type` parameter — restating it as a constant wastes the highest-attention position and, for restage or layout work, mislabels the job as a pixel-local edit.

> **Acceptance checks are agent-side, not prompt-side.** Still produce 3–6 observable checks for `standard` / `dense` (Enhancer **Prompt contract** + the reference's acceptance criteria), but keep them in the agent's internal plan and feed them to **Result Check**. An image model cannot execute a checklist, and the text merely repeats blocks 11–13 while risking being rendered as on-image text. Fold only the most failure-prone assertions into the prompt where they belong — exact product/element count into `Primary request:` or block 6, exact copy into `Typography:`.

> **Composition-preserving references override blocks 4–5.** When a loaded reference mandates keeping the original framing (e.g. `references/white-background.md`: "do not re-center, re-crop, or reframe the subject unless the user explicitly asks"), blocks 4–5 must not invent a new camera, crop, or subject scale, even at `standard` tier. Reference content wins over Enhancer inference.

#### Step C — Apply Method → block mapping (how reference text enters the schema)

Each reference declares an `Apply Method`. It no longer decides the final shape; it decides **where its text lands**:

| Reference `Apply Method` | Destination | Rule |
|---|---|---|
| `Direct Apply` (white-background, image-resize, remove-watermark, image-translation, model-showcase) | template text → `Primary request:` **verbatim** | keep the wording, placeholders resolved; add only the schema blocks around it. Never paraphrase or trim |
| `Concatenate` (selling-point, text-editing, sku-color-change, image-detail, logo-customization, hd-upscale) | built prompt → `Primary request:`; the fixed constraint text → distributed into `Product invariants:` / `Avoid:` (and `Typography:` when it governs copy) | distribution is allowed, weakening is not — every requirement must survive in some block, while respecting the block 11/13 caps: compress duplicates instead of dropping requirements |
| `Use as Final Prompt` (process-flow) | the whole block → `Primary request:` unchanged | only blocks 1–2 may be prepended (block 2 per its conditional rule) and 11–13 appended; add no scene, layout, or marketing content |
| Rewriter output (scene-image) | JSON `"prompt"` value → `Primary request:` **verbatim** | see `references/scene-image.md` → Rewriter Output Contract. The rewriter result is an assembly **input**, not the final prompt |

#### Step D — Format assertions (enforced by the Validation Gate)

1. Labels appear exactly as written in Step B, in ascending order, each on its own line/paragraph; no empty label.
2. All tier-required blocks are present; no non-schema label was invented (in particular no `Use case:` and no `Acceptance checks:` inside the prompt).
3. Every product task has `Product invariants:`. `Input images:` appears **only** when 2+ inputs are passed or a single input's on-image text must be preserved verbatim.
4. Any output containing added text has `Typography:` with the exact copy in quotes plus an explicit "no other text" clause.
5. Length caps hold: `Product invariants:` ≤ 3 lines; `Avoid:` ≤ 8 items; `Allowed changes:` is a closed list ending with `only`.
6. `Avoid:` names no paintable object; prop control appears positively in `Scene/backdrop:`.
7. No requirement is stated in two blocks with different wording — product material/finish only in block 11, environment grade only in block 8.
8. `minimal` gained **no** new art direction (no invented scene, lighting, props, or copy) and the reference template text is intact.
9. When a reference mandates composition preservation, blocks 4–5 preserve the source framing (or block 5 is omitted).
10. `dense` layouts state exact counts and positions for every added text and graphic element.
11. 3–6 observable acceptance checks exist **agent-side** for `standard` / `dense` and are handed to Result Check.

#### Skeletons

`minimal` (e.g. resize, white background, watermark removal) — single input, so block 2 is omitted:

```
Asset type: <output role>
Primary request: <reference template text, verbatim>
Product invariants: <identity-match clause + reference constraint text, ≤3 lines>
Allowed changes: <allow list> only.
Avoid: <≤8 non-nameable negations>
```

`standard` / `dense` add blocks 4–10 in schema order:

```
Asset type: / [Input images:] / Primary request: /
Canvas and composition: / Camera: / Scene/backdrop: / Lighting and grounding: /
Materials, color and style: / [Typography:] / [Graphics and callouts:] /
Product invariants: / Allowed changes: / Avoid:
```

(3–6 acceptance checks are recorded agent-side and never appended to the string above.)

### Generation Prompt Formula (base skeleton)

```
[Shot type] of [Subject] in [Setting], [Action/State].
[Style], [Composition], [Lighting], [Color palette], [Quality].
```

| Element | Description | Examples |
|---------|-------------|----------|
| Subject | What to depict (be specific) | "ginger tabby cat", "ergonomic wireless headphones" |
| Setting | Environment/location | "windowsill with afternoon sunlight", "minimalist studio" |
| Style | Overall aesthetic | "cinematic", "watercolor", "flat vector" |
| Composition | Camera/framing | "close-up", "wide-angle", "rule-of-thirds" |
| Lighting | Light source and mood | "golden hour", "soft diffused", "Rembrandt lighting" |
| Color | Palette direction | "Morandi palette", "high saturation", "monochromatic" |
| Quality | Detail level | "8K", "hyperrealistic", "sharp detail" |

For text in images, use explicit quotes: `Display "LIMITED EDITION" in bold serif font`.

> This formula produces the **content** of `Primary request:` (plus material for blocks 4–10). The final prompt string must still be assembled per **Final Prompt Assembly**.

### Editing Prompt Formula (base skeleton)

> This formula produces the **content** of `Primary request:` (the edit instruction) and `Product invariants:` / `Allowed changes:` (the preservation clause). It is not the final prompt shape — assemble the labeled blocks per **Final Prompt Assembly**.

```
[Edit instruction targeting specific area].
[Preservation clause (concise, ≤3 lines)].
```

**Preservation clause template** (append to every edit prompt — enforces **identity match**, not a frozen photo):

```
Keep the product identity unchanged — preserve geometry, proportions, color, material, texture, prints, logo, and on-product text.
Camera angle, pose, and composition may change to fit the shot. Only change: [specific allowed changes].
Do not redraw, simplify, recolor, or invent any product detail.
```

Keep it concise (≤3 lines). Long enumeration lists (20+ protected items) do not improve compliance and may reduce execution quality. Do NOT lock camera angle, pose, distance, or subject position — those are composition choices the scene may vary (see **Identity Match Contract**).

**Example — Scene change**:
```
Place the product on a modern kitchen countertop with warm morning light, framed at a fresh angle that suits the scene.
Keep the product identity unchanged — preserve geometry, proportions, color, material, texture, prints, logo, and on-product text.
Only change: background/scene, camera angle, and composition. Do not redraw, simplify, recolor, or invent any product detail.
```

### Prompt-Intent Validation Gate (before every `image_edit` / `image_generate` call)

**This gate is global and mandatory for every scene.** It applies to every `image_edit` / `image_generate` call regardless of which reference built the prompt — whether the prompt came from a reference's own template (white background, selling point, text editing, process flow, tech pack, etc.), from an autonomous rewriter (scene image), or from this file's Prompt Construction. A reference's "Tool Invocation" section does not need to restate this gate; running it is required either way. No prompt reaches a tool without passing this gate.

After constructing the final prompt for a single image operation, and **before invoking the tool**, validate the prompt against the original user query for that operation. This is a pre-invocation check — it catches conflicts the model would otherwise bake into the output.

Check the constructed prompt against the user's request for:

1. **Intent match**: the prompt actually performs what the user asked (right operation, right target region, right output).
2. **No contradiction**: the prompt does not instruct a change the user did not ask for, or the opposite of what the user asked (e.g., user said "keep the background", prompt replaces it; user said "3 items", prompt implies a different count).
3. **No fabricated content**: no added claims, text, colors, counts, materials, or features that are absent from the user request and not visible in the source image.
4. **Constraint preservation**: any user hard constraint (specific ratio, exact text, "do not change X") is reflected in the prompt.
5. **Schema conformance**: the prompt satisfies every **Final Prompt Assembly → Format assertions** item (canonical labels, correct order, all tier-required blocks present, no empty label, reference content preserved verbatim where required).

Decision:

- **Schema violation only** (checks 1–4 pass, check 5 fails) → do NOT call the tool and do NOT ask the user. Re-assemble the prompt per Final Prompt Assembly and re-run this gate. A formatting defect is fixed silently, never escalated.
- **No conflict** → proceed with the tool call.
- **Conflict or genuine ambiguity found** → do NOT call the tool. Ask the user to confirm/clarify (use a selectable-options prompt when the host supports it), state the specific conflict, then rebuild the prompt from the confirmed intent.
- **Minor, safe divergence** (a purely visual execution choice that does not change the user's meaning or introduce a factual claim) → proceed, and note the assumption in the final summary.

> Do not silently "fix" a conflict by guessing what the user meant. Surfacing the conflict once, up front, is cheaper than generating a wrong image and re-doing it. This gate complements the post-generation Result Check below: this one validates *intent → prompt*; Result Check validates *prompt → output*.

---

## Result Check

After receiving a generation or editing result, evaluate it against the 3–6 acceptance checks recorded agent-side during **Final Prompt Assembly**, then run:

1. **Preservation audit**: compare the result against the preservation clause. If protected elements were altered (product shape distorted, text removed, colors shifted), retry with a stronger constraint — add a "CRITICAL:" prefix to `Product invariants:` and name the specific element that drifted, or reduce the edit scope. Stay within the ≤3-line cap; do not expand into a 20-item protected list.
2. **Intent completeness**: verify all requested changes are present. If a sub-task from Step 5 was missed, execute the remaining sub-tasks on the current output.
3. **Quality gate**: if the result is clearly unusable (heavy artifacts, wrong subject, garbled text), inform the user and offer to retry with adjusted parameters (e.g., when auto is unavailable, switch from the standard fallback to the dense-layout fallback per Execution Mode Resolution, or simplify the prompt).

Hard failure conditions (identity-match violations — see **Identity Match Contract**):
- Product geometry/proportions, structure, SKU color/pattern, material/texture, prints, packaging text, logo, handle, seam, hole, or accessory changed when not requested
- A crop/split/resize/format task was handled by generating a new product image
- Multi-image or multi-SKU output count does not match the requested/confirmed count
- White-background output changes the product or leaves damaged/blurred edges
- Text editing/removal causes garbled text, misspellings, or modifies unspecified text
- Platform hero image includes prohibited overlays, watermarks, contact information, or unsupported claims
- User requested "do not change the product" but the result redraws or reimagines the product

### Scene Acceptance Criteria

| Scene | Acceptance Criteria |
|-------|---------------------|
| White Background | Background pure white or near #FFFFFF (or transparent alpha if requested); product shape unchanged; edges clean |
| HD Upscale | More detail without changing identity, color, text, or layout |
| Watermark / Element Removal | Removed target element only; no damage to product or surrounding content |
| Text Editing | Exact requested text; readable; no garbled characters |
| Product Cleanup | Product identity preserved; lighting/background improved; no invented claims |
| Selling Point Image | No fabricated claims; labels readable; text does not cover product |
| Platform Hero | Meets platform background, text, watermark, ratio, and product coverage rules |
| Logo Design | Original, legible, commercially safe, not similar to known trademarks |

> Do NOT silently retry indefinitely. After 2 failed attempts at the same task, inform the user of the limitation and suggest alternatives.

---

## Tool Contract / Host Mapping

Concrete tool names may vary by runtime. Map workflow intent to available tools.

Required conceptual operations: text-to-image generation; image-to-image editing; native resize/crop/compress/format conversion (if available); user clarification/selection prompt (if available).

> **Mandatory pre-invocation gate**: before ANY `image_edit` / `image_generate` call — no matter which reference produced the prompt — the prompt must be assembled per **Final Prompt Assembly** and then run through the **Prompt-Intent Validation Gate**. On conflict/ambiguity, confirm with the user before calling the tool. Reference "Tool Invocation" sections assume both steps run and do not restate them.

For image generation — Required: prompt. Optional: aspect_ratio, resolution, task_type.
For image editing — Required: reference_images, prompt or task_type. Optional: aspect_ratio, resolution, size.

> When editing, preserve source proportions per Step 0.5, and pass parameters per the **Execution Mode Resolution → parameter-shape table**. Override priority: explicit user ratio/size → platform image-set requirement (HARD) → resolution-changing tasks (target size).

If the runtime lacks a native resize/compress/format tool, use available local image-processing libraries when permitted; otherwise explain the limitation.

### Canonical task_type values

Selection is governed by **Execution Mode Resolution**: prefer `auto`/`auto_generation` when supported; otherwise `simple`/`simple_generation` (standard) or `complex`/`complex_generation` (dense-layout).

`image_generate`: `auto` (preferred), `simple`, `complex`.
`image_edit`: `auto_generation` (preferred), `simple_generation`, `complex_generation`.

White background, HD upscale, and watermark/element removal are expressed via the prompt and run under the resolved mode.

---

## Aspect Ratio

### Supported Values

```
1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9
```

### Selection Rules

Priority order: explicit user ratio → platform requirement (hard) → source-following → default. The parameter shape for each mode is defined in **Execution Mode Resolution → parameter-shape table**.

1. **User specified a supported ratio** → use it directly.
2. **User specified an unsupported ratio** (e.g., 5:3) → inform user and ask to choose from the supported list.
3. **Platform product image set** (Priority 1 workflow) — **HARD**: the platform's required ratio/size from `references/platform-product-guidelines.md` (e.g., Alibaba.com 1:1, 1000×1000) is MANDATORY and does NOT follow source-following. Only an explicit user ratio can override it.
4. **User did not specify (non-platform)**:
   - Scenes with an uploaded image → follow the source (auto → source `size` + closest `aspect_ratio`; non-auto → ONLY the closest `aspect_ratio` from the table below).
   - Scenes without an image → default `1:1`.

### Auto-Match Table (for uploaded images without user-specified ratio)

| Image Shape | W:H Range | Best Match |
|-------------|-----------|------------|
| Square | 0.9 – 1.1 | `1:1` |
| Slightly tall | 0.75 – 0.9 | `4:5` |
| Portrait | 0.6 – 0.75 | `3:4` |
| Tall portrait | 0.5 – 0.6 | `2:3` |
| Very tall | < 0.5 | `9:16` |
| Slightly wide | 1.1 – 1.35 | `5:4` |
| Landscape | 1.35 – 1.6 | `4:3` |
| Wide landscape | 1.6 – 1.8 | `3:2` |
| Widescreen | 1.8 – 2.2 | `16:9` |
| Ultra-wide | > 2.2 | `21:9` |

> Compute W/H of the uploaded image and find the matching range. If the closest ratio deviates >10% from the original, briefly inform the user about potential cropping.

> For resolution targets (1K/2K) and pixel-size computation, see `references/resolution-routing.md`.

---

## Multilingual Handling

When the user's input is not in English:

1. **Detect the input language.**
2. **Preserve key terms**: embed the user's original nouns/descriptions directly into the prompt rather than translating them (translation can distort meaning).
3. **Build prompts in English**: the image model works best with English prompts, but anchor key concepts from the original language.
4. **Respond in the user's language.**

> Example: "A máquina parada (dor financeira)" (Portuguese) → extract "máquina parada" = stopped machine, "dor financeira" = financial pain → prompt: "idle/stopped CNC machine, conveying financial loss and downtime frustration" — NOT "professional, precise, clean machine" (semantic reversal).

---

## Batch Operations

When the user references a folder or multiple images:

1. List the images in the folder/selection.
2. If the user has not specified what to do per image, ask for the operation before editing.
3. If all images need the same operation → batch-execute the same scene (load the Batch Generation section of `references/platform-product-guidelines.md`).
4. If different images need different operations → classify and route individually.
5. **Never guess-edit** folder contents without explicit instructions.
