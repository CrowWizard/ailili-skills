# Selling Point Image

## Routing Header

- **Load when**: user wants selling points, feature highlights, comparison images, callouts, marketing copy, infographic layout, lifestyle callouts, a how-it-works/structure explanation, usage or maintenance steps, or a dual-state/dual-configuration image.
- **Do not load when**: user only wants a close-up/detail crop without text or layout; load Image Detail instead. For a manufacturing "how it's made" flow, load Process Flowchart instead.
- **Merge notes**: for a single requested selling-point image, merge detail zooms, lifestyle scene, model usage, and callouts into one layout prompt instead of generating intermediate images. Only create separate images when the user asks for multiple outputs. When called as a platform set slot, this reference supplies the L1 copy and L2 graphics layers of a composite slot — see `platform-product-guidelines.md` → **Composite Slot Model**.
- **Hard stop**: never fabricate claims, numbers, certifications, performance data, hidden details, or competitor brand references.

## Scene Description

Generate marketing images that highlight product selling points through **product subject + detail close-ups (optional) + selling-point copy (concise) + layout**. The goal is to help consumers quickly understand product advantages.

> **vs Image Detail**: Detail images are purely "local zoom-in" without copy or layout. Selling Point Image is marketing-oriented — it combines copy + visual layout to convey product selling points.

## Apply Method: Concatenate

Append the fixed constraint text after the selling-point prompt built through Steps 1–4.

---

## Step 1: Selling Point Source

| Situation | Condition | Agent Behavior |
|-----------|-----------|----------------|
| **User provided specific selling points** | User explicitly mentions selling points (e.g., "highlight waterproof and lightweight") | Use user's selling points directly. Agent only adapts wording (translate to English phrases, control word count). **No confirmation needed — execute directly.** |
| **User did not provide selling points** | User only says "make a selling point image" without specifying points | Agent proposes selling points using the Five Dimensions below. **Must confirm with the user before generating.** |
| **Mixed** | User provided partial selling points | Use user's points as L1. Agent supplements L2/L3. **Supplemented parts must be confirmed with the user.** |

### Selling Point Confirmation

When the Agent infers/supplements selling points, present the proposal to the user **before** image generation. Use the host's prompt/selection UI when available; otherwise ask a concise question in chat.

**Step 1 — Confirmation popup** (selling points in the title, only 2 options):

```
Title (markdown, blank line between each tier):

Based on the product features, here is a proposed selling-point plan:

**Core Selling Point**: {L1 copy}

**Feature Highlights**: {L2-1}, {L2-2}

**Trust Signal**: {L3 copy}

Layout template: "{template name}"

Options:
- Confirm & Generate
- Edit Selling Points
```

**Step 2 — If user clicks "Edit"**, show a second popup with the full plan pre-filled in the input field for the user to modify. After submission, treat the edited content as user-provided selling points and execute directly without further confirmation.

**Rules**:
- Only ask for confirmation when the Agent infers/supplements selling points
- One round of confirmation only — no second-guessing after user confirms or edits
- Edited content = user-provided selling points; Agent only adapts wording, never overrides intent

## Step 2: Selling Point Criteria (Five Dimensions)

Candidate selling points must fall into one of these five dimensions:

| Dimension | Description | Examples |
|-----------|-------------|----------|
| **Benefit / Experience** | Direct benefit or user experience | "all-day comfort", "silent commute", "effortless cleaning" |
| **Quantifiable Advantage** | Hard metrics with numbers | "40dB ANC", "24h cold", "30H Battery", "IPX8" |
| **Use Case / Target Audience** | Specific scenario or user segment | "office-friendly", "travel-ready", "baby-safe" |
| **Certification / Credential** | Authority endorsement or compliance | "FDA-grade silicone", "BPA-free", "CE Certified", "OEKO-TEX" — only use certification claims that the user explicitly verifies or that are visibly present on the product/packaging |
| **Pain Point Resolution** | Directly addresses consumer complaints | "no slipping", "leak-proof", "anti-scratch" |

**NOT selling points**: subjective adjectives ("high quality", "beautiful"), category common sense ("holds water"), marketing clichés ("crafted with care"), **names of visible parts** ("backrest", "foot basin", "lid"), and **briefing/planning terms** ("front view", "visible components", "floor contact"). Never output these as selling points or as on-image copy.

## Step 3: Selling Point Tiering (L1 → L2 → L3)

Organize candidates into three tiers. User-facing labels: Core Selling Point / Feature Highlights / Trust Signal.

| Tier | User Label | Selection Rule | Copy Requirement |
|------|-----------|----------------|------------------|
| **L1** | **Core Selling Point** | Most differentiated / highest purchase-decision weight — pick 1 | Ultra-concise (≤4 words). Typically "Benefit/Experience" or "Quantifiable Advantage" |
| **L2** | **Feature Highlights** | Expands or supplements L1 — 1–2 items | Short (≤6 words). Typically "Use Case" or "Quantifiable Advantage" |
| **L3** | **Trust Signal** | Contains verifiable elements: numbers, certifications, test conditions | Phrase form, e.g., "FDA-grade silicone", "Loved by 10k+ moms" |

**Tier output rules**:

| Candidate Pool | Output Tiers | Mode class |
|----------------|-------------|-----------|
| Only 1 differentiating point, or user requests "minimal" | L1 only | standard |
| 1 core + 1–2 supplements (typical) | L1 + L2 | standard |
| Differentiating point + functional supplements + verifiable evidence | L1 + L2 + L3 | dense-layout |

**Copy rules** (all tiers):
- Max 6 English words per line
- Prefer data-driven expressions ("40dB ANC" over "powerful noise canceling")
- Preserve the core meaning of user's original wording
- L1 must be the most differentiated; L2 must not repeat L1; L3 must contain verifiable elements

## Step 4: Layout Template Selection

Select ONE of the 8 layout templates based on tier output and product characteristics:

| # | Template | When to Use | Visual Anchors (required in prompt) | Prompt Keywords |
|---|----------|-------------|-------------------------------------|-----------------|
| ① | **Single Highlight** | 1 core selling point; social media hero; ad header | Dynamic motion lines (wind/light arc/curved trail) + optional circular zoom-in | `"single bold headline beside the product, large typography, generous whitespace, dynamic motion lines emphasizing the selling point, optional circular zoom-in, one-focal-point composition"` |
| ② | **Multi-Point Grid** | 2–4 parallel selling points; detail page; A+ module | Circular close-up per point + short text label (≤6 words) | `"product centered, surrounded by circular close-up callouts, each paired with a short text label (≤6 words), arranged in 2x2 grid or 3-column layout with even spacing"` |
| ③ | **Spec Infographic** | Quantifiable specs; tech/electronics/outdoor gear | Double-headed arrows + leader lines + numeric values (not overlapping product) | `"product with technical callouts, double-headed arrows with leader lines indicating dimensions/specs, numeric values alongside leader lines (not overlapping product), small icons, infographic style"` |
| ④ | **Lifestyle + Callouts** | Usage scenario + target audience; apparel/home/outdoor | Thin leader lines → short text labels (≤6 words), never crossing faces or product silhouette | `"product in real-life usage scene, thin leader lines connecting short text labels to specific usage details, lifestyle context, leader lines never crossing faces or main product silhouette"` |
| ⑤ | **Competitor Comparison** | Differentiation; highly commoditized categories | Split-screen "Others" vs "Ours" with row-aligned ✓/✗ marks | `"split-screen comparison layout, left 'Others' with generic gray silhouette (NO brand names/logos/trademarks), pain points with red ✗, right 'Ours' with green ✓, bold 'VS' divider, equal items both sides"` |
| ⑥ | **Structure Cutaway** | How-it-works / internal path for appliances, dispensers, mechanical goods | Half-body semi-transparent cutaway aligned to the real silhouette + directional flow arrows + thin leader lines with dot anchors | `"one half of the product keeps its normal exterior, the other half is a semi-transparent cutaway precisely aligned to the same silhouette, showing only the few internal parts named in the prompt, thick directional arrows tracing the material path, thin leader lines with dot anchors linking each short label to its part, clean studio gradient background"` |
| ⑦ | **Step Sequence** | Usage, installation, cleaning, or assembly steps (NOT manufacturing) | 2–4 equal-width columns + circular numbered badges 1..N + one caption per column + identical product in every column | `"2 to 4 equal-width vertical panels separated by a hairline or natural boundary and no thick borders, each panel topped by a circular numbered badge, one realistic photo per panel showing that step, one short caption under each panel, the same product with identical structure in every panel"` |
| ⑧ | **Dual-State Parallel** | One product shown in two configurations/modes/states (power source, size, mode) | Two identical units placed symmetrically + per-side differentiator expressed only through accessory/light/state, no marks | `"two identical units of the same product placed symmetrically side by side, same angle, same accessories, same visible features, each side differentiated only by the state-specific element named in the prompt, symmetric balanced composition, no check marks, no cross marks, no versus divider, no comparison wording"` |

**Selection rules**:

| Trigger | Recommended Layout |
|---------|--------------------|
| L1 only, or user wants "highlight one point" | ① Single Highlight |
| L1 + L2 (2–4 parallel points, no strong data) | ② Multi-Point Grid |
| Strong quantifiable metrics AND **user already provided specific numeric values** | ③ Spec Infographic |
| Clear usage scenario or target audience | ④ Lifestyle + Callouts |
| User explicitly requests "comparison" / "vs competitors" | ⑤ Competitor Comparison |
| User wants to explain the internal working principle, flow path, or "why it does not jam" | ⑥ Structure Cutaway |
| User wants ordered usage / cleaning / installation steps | ⑦ Step Sequence |
| User wants two power modes, two sizes, or two operating states of the SAME product | ⑧ Dual-State Parallel |

> **Spec Infographic prerequisite**: Layout ③ may ONLY be used when the **user has provided specific numeric values** (dimensions, capacity, battery life, IP rating, etc.). If the user has not provided numbers, do NOT fabricate values — fall back to ②, ④, or ⑥ (a labeled cutaway conveys structure without inventing numbers).

> **Structure Cutaway boundary (⑥)**: the cutaway may show ONLY internal parts the user named or that are plainly implied by the visible product type, and the cut half must stay precisely aligned with the real silhouette. Never generate gears, wiring, circuit boards, screens, or mechanisms that were not stated, and never turn the product into a different product.

> **Step Sequence boundary (⑦)**: use ⑦ for user-side steps only — a manufacturing/production flow goes to `references/process-flow.md`. Step count 2–4; badges unique and sequential; the product's structure identical in every panel; hands anatomically correct and never pierced by water or parts.

> **Dual-State Parallel boundary (⑧)**: ⑧ is a self-comparison, NOT ⑤. Never add ✓/✗, "VS", "Others", or better/worse wording, and never add per-side headlines unless the user supplied that copy. Never imply unconfirmed specs (battery count, runtime, capacity) through the state difference.

> **Annotation cap inside a platform image set**: the leader-line / callout styles (③, ④'s leader lines, ⑥) may be used in **at most ONE image of the whole set** — see `platform-product-guidelines.md` → **Expression-mode diversity**. Other slots must carry their message through photography + headline, per-column captions, panel geometry, a feature strip, or an in-frame device screen. Vary the layout template between slots; never reuse the same skeleton twice in one set.

> **Copy must be a message, not a part name**: "Backrest", "Armrest", "Foot Basin", "Front Base" name what is already visible and are only acceptable as labels inside the single annotated image. Everywhere else the copy states a benefit, scenario, or verified spec. **Never render planning vocabulary** — "Front View", "Visible Components", "Floor Contact", "Retail Interior Context", occupancy percentages, angle or slot names — as on-image text; those are briefing terms, not copy.

**Layout → Mode class**: ①② → standard; ③④⑤⑥⑦⑧ → dense-layout. (Mode resolved once in the Tool Invocation section below.)

## Step 5: Typography Design (required whenever the image carries text)

Copy is not "added on top" of the photo — it is designed into the frame. Every text-bearing prompt must specify the six items below, or the result reads like a caption pasted over a product shot.

### 1. Pick ONE type skeleton

| Skeleton | Use when | Layout rule |
|---|---|---|
| **Top band** | headline is the slot's message; product sits lower | copy occupies the top 18–26% of the canvas, product below it; the band is empty photographic space, not a color bar unless stated |
| **Left (or right) column** | tall product, or lifestyle shot with open wall/floor space | copy occupies one vertical third, product in the opposite two-thirds; all lines share one edge |
| **Lower third** | scene/person-led shots where the upper frame carries the environment | copy sits in the bottom 20–28%, above the frame's bottom margin |

Reserve that zone in the composition **first** (state it as negative space in the scene/composition wording), then place the type in it.

### 2. Type scale (relative, not px)

- **H1 headline**: cap height ≈ 6–9% of canvas height; ≤2 lines; ≤12 CJK characters or ≤6 English words per line.
- **H2 subhead**: 45–60% of H1 size; 1–2 lines; may use a thin separator (`｜` or a hairline) between short phrases.
- **H3 tertiary strip** (optional, one per image): 30–40% of H1 size — a feature strip, an "In the Box" line, or a safety note. Use **wide letter-tracking with centred middot separators** (`App Control · Portion Scheduling · Dual Power`) or the CJK full-width bar (`定时喂养｜份量设置｜余粮可视`). Placed at the bottom centre, or directly under H2 when it is a feature strip.
- **Labels / captions**: 25–35% of H1 size; ≤6 words each.
- Size ratio between adjacent levels must be visible at a glance — avoid H1/H2 within 20% of each other.
- **Line balancing**: when copy needs two lines, break it at a phrase boundary into two visually similar lengths and write both lines out verbatim in the prompt — never let the model choose the break.
- **Tracking**: H1 normal to slightly tight; H3 strips widely tracked; never letter-space CJK headlines.

### 3. Weight and colour pair

- H1: extra-bold / heavy sans (CJK: heavy 黑体), near-black `#1A1A1A` on light backgrounds, pure white on dark.
- H2 and labels: medium or semibold, mid-grey `#6B6B6B` (or 70% white on dark).
- **At most two type families** in one image (ideally one family, two weights) and **at most one accent colour**, reused from the product or scene palette.

### 4. Alignment and margins

- One alignment per image (all centered, or all flush-left) — never mix. Flush-left upper-left headlines suit lifestyle/scene slots; centred headlines suit studio and symmetric slots.
- Text block keeps a ≥5% canvas-edge margin; on mobile-first platforms keep ≥8%.
- Optical alignment with a scene edge (counter line, wall edge, product axis) instead of floating mid-air.
- At most three text levels per image (H1 + H2 + one H3 strip/note, or H1 + H2 + labels) — never four.

### 5. Restrained accent treatment (max one per image)

Allowed: a hairline rule under H1; a small solid dot or square before a label; a light translucent card (≥15% opacity difference from the background) ONLY where a busy background would hurt legibility; a thin key-colour underline.

### 6. Typography prohibitions

- No outlined, drop-shadowed, embossed, gradient, 3D, or warped/arched text.
- No text over the product, over a face, or crossing the product silhouette.
- No text inside a heavy colour block, ribbon, banner, sticker, or badge unless the user asked for one.
- No more than one headline per image; no repeated copy; no filler line to "balance" the layout.
- No mixed languages in one text block unless the user supplied it that way.

> Write these decisions into the prompt as concrete design instructions (zone, relative size, weight, colour, alignment, margin), not as adjectives like "beautiful typography".

## Prompt Construction

**Formula**:

```
[Product subject], [detail close-up (optional)], [L1 copy + L2 copy (optional) + L3 copy (optional)], [Layout template prompt keywords], [Typography Design decisions from Step 5: skeleton zone + relative sizes + weight/colour + alignment]. [Style/background/color (optional)].
```

**Example — L1 + L2, Layout ② Multi-Point Grid**:

```
Wireless noise-canceling headphones centered as the main subject. Surround the product with four circular close-up callouts in a 2x2 grid: ear cushion close-up paired with "Memory Foam", driver close-up paired with "40dB ANC", battery icon close-up paired with "30H Battery", Bluetooth chip close-up paired with "BT 5.3". Each circular thumbnail with even spacing and short text label below. Headline "All-Day Comfort" on top. Minimalist light gray background, modern tech style.
```

## Fixed Constraint Text

Append to every selling-point prompt:

```
Create a selling-point product image that clearly highlights the product's key advantages. The product subject must be prominently displayed as the visual focus and must remain fully consistent with the original image in shape, color, texture, material details, and structural features — do NOT alter, simplify, or reimagine any aspect of the product's appearance. For any parts that are occluded, blocked, or hidden in the original image, do NOT infer, reconstruct, or fabricate the hidden content — only highlight selling points based on the visible portions actually shown in the original image. Selling-point text labels must be short (max 6 words each), legible, and well-positioned without overlapping the product. Maintain a clean, professional e-commerce layout with balanced whitespace. Do NOT add any text or elements not specified in the prompt.
```

## Tool Invocation

- Tool: `image_edit` (when user uploaded a product image) / `image_generate` (text-only, no reference image)
- Mode: **standard** for single-point layouts; **dense-layout** for multi-region grids, comparison, or spec layouts — resolve the `task_type` via SKILL.md **Execution Mode Resolution** (prefer `auto`/`auto_generation`).
- Dimensions (mandatory): for `image_edit` (uploaded product) follow SKILL.md Step 0.5 (auto → source `size` + closest `aspect_ratio`; non-auto → ONLY closest `aspect_ratio`); for text-only `image_generate` (no source image) use the user's requested ratio/size or default `1:1`.

## Notes

- **Product must be the visual focus** — copy must not overpower the product
- **Selling points must fall within the Five Dimensions** — no subjective adjectives, common sense, or marketing clichés
- **Tier hierarchy must be visually clear** — L1 largest font, L3 typically a small badge in the corner
- **Typography is designed, not pasted** — every text-bearing image must carry the Step 5 decisions (skeleton zone, relative type scale, weight/colour pair, alignment, margins); reserve the copy zone as negative space in the composition before placing type
- **Single layout only** — pick the best match from the 8 templates; do not mix layout skeletons
- **Visual anchors are mandatory** — each layout's required visual elements must appear in the prompt (① motion lines; ② circular callouts; ③ arrows + leader lines; ④ thin leader lines; ⑤ row-aligned ✓/✗; ⑥ aligned cutaway + flow arrows + dot-anchored leaders; ⑦ numbered badges + equal columns; ⑧ two identical symmetric units)
- **Repeated-product consistency** (⑦⑧): when the product appears more than once in one image, every instance must be structurally identical — same window, buttons, outlet, bowl, and angle. Divergent copies are a hard failure.
- **No invented internals** (⑥): only render the internal parts named in the prompt; keep them simple, plausible, and manufacturable.
- **Competitor comparison compliance**: Layout ⑤ must NEVER show competitor brand names, logos, trademarks, or recognizable packaging. Use generic gray silhouettes only.
- **No fabrication of occluded areas**: only base selling points on what is actually visible in the original image
- **Keep copy concise**: L1 ≤4 words, L2/L3 ≤6 words
- **User selling points take priority**: when user provides specific selling points, execute directly without confirmation
- **Platform image set rule**: when called within a platform image set workflow and user uploaded product images, must use `image_edit`
