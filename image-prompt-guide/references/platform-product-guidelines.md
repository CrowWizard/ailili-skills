# E-Commerce Platform Product Image Guidelines
> **Updated**: 2026-05-11

## Routing Header

- **Load when**: user names a covered e-commerce platform and asks for main images, hero images, listing images, product image sets, or listing-risk/compliance-oriented image guidance.
- **Do not load when**: user asks for generic cleanup, background change, logo application, or resize with no platform/listing intent.
- **Merge notes**: use this file to select platform constraints, then load only the output scene references needed for each requested image. Each planned set image is a **composite slot** (one base visual layer + the overlay layers it needs) — resolve its layer stack via **Composite Slot Model** below and load every layer's reference, but still emit ONE AI call per slot. Do not split one platform hero into separate AI calls for background, centering, shadow, and coverage when one product-fidelity prompt can satisfy them.
- **Hard stop**: if the user requests latest compliance, official verification, or policy-sensitive review, verify against official platform documentation before finalizing.

## Usage

1. **Primary reference**: Use this document as the default built-in reference for platform product hero/set image requirements.
2. **Official verification**: If the user asks for latest compliance, official verification, listing-risk review, policy-sensitive checks, or requirements not covered here, consult official platform documentation before finalizing.
3. **Platforms covered**: Amazon, eBay, Walmart, Shopify, Etsy, AliExpress, TikTok Shop, Shopee, Lazada, Alibaba.com, 1688.

---

## Default In-Image Language

Any text/copy rendered inside a platform image (headlines, callouts, selling-point labels, spec labels, annotations) must have a definite language.

**Resolution order (highest first):**

1. **Explicit user request** — if the user specifies a language (or a target market/locale that implies one), use it.
2. **Platform default (below)** — if the user did NOT specify a language, use the platform's default language from the table.
3. **Fallback** — if the platform is not listed or is ambiguous, default to **English**.

> This only sets the language of text the user already approved to appear in the image. It does NOT authorize adding new text, claims, or copy — the No-Hallucination and platform prohibited-element rules still apply (e.g., Alibaba.com/1688 hero images forbid marketing text entirely). Never translate a brand name, trademark, or user-provided exact string unless the user asks.

| Platform | Default in-image language | Rationale |
|----------|---------------------------|-----------|
| Amazon | English (en-US) | Primary marketplace is US; other locales only when the user names them |
| eBay | English (en-US) | US/global default |
| Walmart | English (en-US) | US marketplace (CA: English default, French only if requested for Québec) |
| Shopify | English (en-US) | Brand-owned; no platform locale — English unless the merchant's market says otherwise |
| Etsy | English (en-US) | Global handmade marketplace, English-first |
| AliExpress | English | Cross-border B2C to a global audience |
| TikTok Shop | English (en-US) | US-first; per-region language only when the user targets a specific market |
| Shopee | English | SEA multi-country; English is the safe cross-market default (use Thai/Vietnamese/Bahasa only when the target country is given) |
| Lazada | English | SEA multi-country; same rule as Shopee |
| Alibaba.com | English | B2B international; Chinese is strictly prohibited in-image (see platform spec) |
| 1688 | Simplified Chinese (zh-CN) | Domestic China wholesale platform; buyers are Chinese |

> **Market-implied language**: if the user names a specific country/site without naming a language (e.g., "Amazon Japan", "Shopee Thailand", "Lazada Vietnam"), infer that market's primary language (Japanese, Thai, Vietnamese) — this counts as an explicit user signal under rule 1, overriding the English default.

### Source-Text Language Conflict Check (image set + no user-specified language)

Run this check **only when BOTH conditions hold**: (a) the user is requesting an image set / listing images, AND (b) the user did NOT specify an in-image language (so the platform default from the table would apply).

1. **Detect source text**: inspect the uploaded source image(s) for **non-brand text that carries meaning** — selling points, product descriptions, spec/parameter values, feature callouts, usage instructions. Exclude brand names, logos, trademarks, and model numbers (those are never translated and never trigger this check).
2. **No such text** → no conflict; proceed with the platform default language.
3. **Such text exists → compare its language to the platform default:**
   - **Same language** → no conflict; proceed.
   - **Different language (conflict)** → do NOT silently pick one. **Ask the user to choose** (use a selectable-options prompt when the host supports it), presenting exactly two options:
     - **(A) Keep the original language** — reproduce the source text in its original language in the generated set.
     - **(B) Use the platform default language** — translate the source text into the platform default (per the table above), then proceed with generation using the translated copy.
4. **After the user chooses**, proceed with the rest of the image-set generation using the confirmed language. If the user picks (B), route the translation through the Image Translation scene (`references/image-translation.md`) — do not free-hand translate spec values or claims.

> **Boundaries**: This check governs the language of text the source already contains; it never adds new claims and never alters brand/trademark strings. If a platform prohibits in-image marketing text entirely (e.g., Alibaba.com / 1688 hero image), the prohibition wins — remove the text per that platform's rule instead of translating it, and do not raise the conflict prompt for that specific image.

### Applying the Target Language to the Prompt

For any planned image in the set that will contain text, the resolved target language (explicit user request → platform default → confirmed choice from the conflict check above) MUST be written explicitly into that image's final `image_edit` / `image_generate` prompt. Do not leave the in-image language implicit.

- **Add an explicit language constraint** to the prompt, e.g.: `All in-image text must be written in <target language> (e.g., English / Simplified Chinese).`
- **Keep exact strings verbatim**: quote any user-provided or must-preserve copy exactly, and state that brand names, trademarks, and model numbers are not translated.
- **Only images that will contain no text at all** skip the language constraint — do not inject text into an image that should have none. Do NOT exclude an image by type: a white-background image still gets the language constraint if it will carry any text (e.g., labels, spec callouts).
- **Consistency across the set**: use the same target-language constraint wording for every text-bearing image in the same set, so the whole set stays in one language unless the user asked otherwise.

> Example (planned selling-point image, platform default English): append to the prompt — `All in-image text must be in English; keep the brand name "<Brand>" unchanged; do not add any text beyond the specified labels.`

---

## Platform Image Set Style Systems

> These are **proven principles**, not layouts to photocopy. Match the product's emotional register (sporty / cozy / premium / handmade) first, then regenerate the execution within each platform's grammar.

When a user requests a multi-image listing set for a platform, keep the following cross-platform rules in mind:

1. **One platform = one style system.** All images in the same set share the same background world, lighting language, and palette. Mixed-style sets read as disconnected and usually get rejected.
2. **Same style system ≠ same composition.** A shared style system fixes the *treatment* (background world, lighting, palette, mood), NOT the *shot*. Composition is a per-image planning decision: choose each shot's camera angle, distance/景别, and subject position based on **what that slot needs to show** and the **product's physical characteristics and scene norms** — not by a rule that every shot must differ. A shot may reuse the original image's framing when that framing is the right one for the slot (e.g. a straight-on hero) and it conforms to the scene/platform requirements.
   - Let the set's role structure drive framing (e.g. hero = full product; detail = close-up/macro; scene = in-use/lifestyle; scale = top-down or with reference object). Different roles naturally produce different compositions; do not force artificial variety beyond what the roles call for. These roles name only each slot's **base visual layer** — every non-hero slot still stacks its enrichment layers per **Composite Slot Model**.
   - Plan the angle a real product photographer would use for each slot given the product's shape, orientation, and physical constraints; keep it physically plausible.
   - Keep the style tokens (background world, lighting, palette) constant across the set; let composition follow each slot's purpose.
3. **Identity match, not a frozen shot.** The product's intrinsic identity never changes — same geometry, proportions, weave/texture, color family, prints, logo, and on-product text across every image (identity match per SKILL.md **Identity Match Contract**). Camera angle, pose, distance, and composition may differ per image (or match the original) as each slot requires, and are NOT identity changes. If the product line has messy colors, propose ONE tonal family and get user confirmation before generating the set.
4. **Platform grammar is fixed; execution is category-flexible.** For example, TikTok always requires strong human presence, but the exact mood can shift between "flash-lit editorial sports" and "warm golden cozy" depending on the category.
5. **Style tokens should be repeated verbatim** across shots in the same set to hold background/lighting/palette constant. Composition/framing tokens are chosen per slot (see rule 2) — they may repeat when a slot genuinely needs the same framing, and need not be artificially varied. Number shots ("shot N of 4") to help the model keep style continuity.
6. **Before delivering, run a consistency gate:** check that no single shot leaks a different season, venue, or temperature into the set; verify in-image text spelling; flag any inferred multi-view angles or spec numbers that need user sanity-check. Also confirm each shot's composition suits its slot role and the scene; a shot repeating the original framing is fine when that is the right framing for the slot.
7. **AI generation resolution (excluding Batch Generation):** for AI-generated platform product images and sets, generate at **2K resolution (long edge 2048 px)** whenever possible. This applies to hero/main images, listing sets, and platform-specific lifestyle/detail shots; it does not override user-specified sizes or platform-mandated minimums, but should be the default production target.

The sections below pair each platform's **hard specs** with an **optional image-set style notes** subsection. Use the specs for compliance; use the style notes as a starting point that should be adapted to the product's emotional register.

---

## Composite Slot Model (every set image is a capability stack)

> **Core rule**: a planned set image is a **slot**, not a single scene. One slot = one **base visual layer** + the overlay layers that slot's message requires. A slot is NOT satisfied by "one detail shot" / "one scene shot" / "one selling-point card" when its job also needs copy, callouts, steps, a person, accessories, or a companion device. The Scene Router still owns routing and this section owns **how many scenes stack into one slot**; SKILL.md **Final Prompt Assembly** still owns the prompt's labels, block order, and tier.

### Layer stack

| Layer | Role | Reference to load | Required |
|---|---|---|---|
| **L0 Base visual** | where the shot happens and how rich the environment is | exactly ONE of `scene-image.md` (**default for supporting slots** — a real, furnished environment) or `white-background.md` (clean studio/gradient — hero, cutaway, and contents slots only). **`image-detail.md` is NOT a set slot** — never plan a bare macro crop as a set image; shoot the close range inside a real scene instead | Always |
| **L1 Copy** | headline + subhead + short labels carrying the slot's single message | copy sourcing/tiering per `selling-point.md` Steps 1–3; language per **Default In-Image Language** | **Enrichment layer** — the normal carrier of a slot's message; copy must be customer-facing benefit/scenario wording, never a part name or a planning term |
| **L2 Graphics** | three distinct kinds: **L2-anno** (leader lines, dot anchors, arrows pointing at parts, cutaway), **L2-geo** (equal columns, two-panel split, step badges, grids, flat-lay arrangement), **L2-ui** (cards/rows inside a device screen) | layout template per `selling-point.md` Step 4 | **Optional, and L2-anno is capped at ONE slot per set** — see **Expression-mode diversity**. L2-geo and L2-ui are not annotation and are not capped |
| **L3 Human / interaction** | model, hands, in-use gesture | `model-showcase.md` (+ `scene-image.md` for the setting) | **Planned per product** — see **Human interaction planning**: usually 1–2 slots per set, with the level chosen from the product's form and operation mode. Never stamped onto every slot |
| **L4 Accessory / packaging** | what's-in-the-box line-up, accessory arrangement | no dedicated reference — plan as L0 composition; only items the user confirmed are included | **Enrichment layer** — counts toward the minimum |
| **L5 Second subject** | phone/app screen, controller, companion device | no dedicated reference — allowed only when the user supplied the exact UI text and feature list | **Enrichment layer** — counts toward the minimum |

Stacking rules:

1. **Load every layer's reference** for that slot per the Reference Loading Contract, then emit **one merged AI call per slot** — layer count never multiplies AI calls.
2. **Mode class**: L0 (+L3) only → **standard**. Any slot carrying L1, L2, L4, or L5 → **dense-layout**.
3. **Facts gate**: L1 / L4 / L5 content must come from the user or be visible in the source. Never invent copy, accessory counts, battery/runtime data, UI features, or certifications just to fill a layer. Do not reveal or reconstruct internals that are not user-confirmed.
4. **Quantify overlays**: L1 needs verbatim copy + "appears once" + "no other text"; L2 needs exact element counts, positions, and anchor targets; L4 needs the exact item list; L5 needs the exact on-screen strings.
5. **Identity across layers**: when a slot repeats the product (multi-column steps, dual units), every instance must show the identical visible structure (identity match per SKILL.md **Identity Match Contract**).

### Supporting-slot enrichment mandate (HARD)

> **In every platform image set, only the first/hero slot may be a single-capability image. Every other slot MUST be a composite slot.**

1. **Hero slot (image 1)**: base layer only whenever the platform mandates a white/solid background or bans in-image text and overlays (Amazon, eBay, Walmart, AliExpress, TikTok Shop, Shopee, Lazada, Alibaba.com, 1688). On platforms with no such ban (Shopify, Etsy), the hero may be composite (archetype A1).
2. **Every supporting slot (images 2..N)**: MUST be `L0 + at least TWO enrichment layers` drawn from the platform-permitted set, and at least one of them MUST carry the slot's message — normally **L1 copy**. Annotation graphics (L2-anno) are NOT the default way to carry a message and are capped at one slot per set (see **Expression-mode diversity**). A supporting slot is planned as an archetype (A2–A10), never as a bare scene/detail/angle shot.
3. **Explicitly forbidden as a supporting slot**:
   - an alternate-angle white-background shot with nothing added;
   - a macro/detail crop with no labels, no callouts, and no interaction;
   - a plain lifestyle photo with no copy, no graphics, no person, and no accessories;
   - a slot whose only difference from another slot is the camera angle.
   These may be delivered as **extra** images beyond the required composite set, never as one of the required slots.
4. **When a platform bans text and graphics** (TikTok Shop set-wide; eBay; and any slot where L1/L2 are prohibited): the two-enrichment minimum must be met with the **non-text layers** — L3 human/hand interaction, L4 accessory/packaging line-up, L5 companion device, in-use action, or scale reference. Never satisfy the mandate by smuggling in text the platform forbids, and never fall back to a bare product shot.
5. **Mode class**: a supporting slot carrying L1, L2, L4, or L5 is **dense-layout**. A supporting slot enriched only with L3 (e.g. a TikTok in-use shot) stays **standard**.
6. **Message coverage**: because every supporting slot is information-bearing, each one must own a distinct message (use context, working principle, operation, maintenance, contents, benefit, dual state). If the user cannot supply enough verified messages for the requested count, ask which messages to use or reduce the count — do not pad the set with bare angle shots.

> **Reading the platform specs below**: where a platform section lists supporting-image *types* ("back, side, detail, scene, packaging", "multiple angles", "scale reference"), it is describing the content each platform **permits**, not a delivery plan. Every such image must still be produced as a composite slot under this mandate — e.g. "detail" becomes a labeled structure/cutaway or a close-range in-use shot inside a real scene, "packaging" becomes an accessory line-up with a contents caption. Never read those lists as permission to ship a bare view.

### Scene layer richness (default base = a furnished scene)

Flat, empty results come from a studio base plus a thin environment. Fix it at the base layer, not with more text.

1. **Base default**: every supporting slot uses a real environment (`scene-image.md`). The clean studio base is allowed ONLY for three slot types: the hero, a structure/cutaway slot (A4), and a contents / dual-state slot (A6 / A8). In a set of 5+ images, **at least half of the supporting slots must use the scene base**.
2. **Every scene slot's prompt must name all seven of**:
   - **Place identity** — which room and which part of it ("kitchen counter beside the stone sink", "living room floor between the cabinet and the sofa"), not just "modern home".
   - **Named element inventory (positive, closed)** — **6–9 named elements** for a lifestyle slot, each with **material + position**: the support surface, the background architecture (wall / window / curtain / doorway / cabinetry / floor line), 1 furniture anchor per side (e.g. "light oak cabinet on the left", "cream textured sofa on the right"), 2–4 secondary props (ceramic vase with one branch, two neutral books, woven rug, side table, ceramic cup, closed notebook), and 1 organic element (plant / greenery outside the window). Close the list with "no other objects". A studio slot instead names the surface, the gradient/backdrop, and nothing else.
   - **Three depth planes** — assign named content to foreground, midground, and background, and state which plane holds the product.
   - **Light source** — a named window/lamp with side, time of day, quality, and the resulting shadow behaviour on the product and surface ("soft morning daylight entering from a window on the left, restrained contact shadows").
   - **Depth of field** — what is sharp and what falls off ("product sharp, cabinet and greenery softly defocused"), so the frame reads as one photograph.
   - **Material & palette** — floor/wall/counter materials plus the set palette (warm ivory, pale oak, cream, low-saturation neutrals).
   - **Art direction statement** — one named editorial register plus an anti-ad clause: e.g. "refined Scandinavian interiors editorial, quiet and spacious; it must read like a premium interiors photograph, not an advertisement filled with graphics".
3. **Quantified staging (mandatory for every slot, studio or scene)**:
   - product **occupancy %** of the frame and its **position zone** ("lower-left to slightly left of center, about 47% of the frame");
   - every secondary subject's own occupancy % and position (pet ~25–30%, phone ~29%, person full-body or kneeling on one side);
   - the subject's **specific action** ("cat lowers its head and eats from the stainless-steel bowl", "woman kneels and rests her right hand on the lid, looking at the window"), plus clothing description when a person appears;
   - camera angle and height ("slightly elevated front three-quarter", "from behind and slightly over the shoulder").
4. **Living-subject and physics guards** — whenever a pet, person, hands, liquid, or falling material appears, state them explicitly:
   - correct anatomy (limbs, tail, ears, paws; five correct fingers; no extra limbs);
   - the subject must not block the product's key structural features;
   - granular/liquid material obeys gravity (kibble falls into the bowl, never floats or sprays; water never passes through a palm);
   - every object rests on a surface with correct contact shadow and ambient occlusion;
   - electrical parts stay dry when water is present, and say so.
5. **Banned wording on scene slots**: "clean minimal background", "simple studio", "plain backdrop" — those describe the studio base and are only valid in the three exceptions above.
6. Props stay secondary: never imply they are included with the product, never let them touch or overlap the product silhouette.

### Human interaction planning (the level follows the product, not a fixed count)

A person is one way to **prove usability or scale** — not a decoration to stamp on every slot. Plan it deliberately, then leave it out where it adds nothing.

1. **Judgement, not quota**: decide per set whether a person helps, and in which slots. For a typical 4–8 image set that is **1–2 slots** (3 at most for lifestyle-led categories). Never add a person to the hero (when the platform requires a bare product shot), to a structure/cutaway slot (A4), to a contents slot (A6), or to a dual-state slot (A8).
2. **The level follows the product** — choose from this table instead of defaulting to a full-body model:

| Product trait | Suitable level | Typical action |
|---|---|---|
| **Sat in / lain on / body-supported (massage chair, pedicure spa chair, mattress, sofa, office chair, bathtub, stroller)** | **occupant in use** — a person seated, reclined, or lying on the product, shown from full or three-quarter body | client reclined in the chair with feet in the basin, relaxed hands on the armrests, eyes closed; optionally a second person (technician/attendant) working beside them |
| Worn / carried / handheld (apparel, bags, wearables, tools, grooming) | full or partial body **wearing/holding** | worn, carried, gripped in genuine use |
| Tabletop appliance with hands-on parts (feeder, kettle, blender, printer) | **hands only** for operation slots; partial body for an observe/check slot | removing a bowl, refilling, pressing a control, rinsing a part |
| App- or remote-operated device | **partial body** with the phone in frame | seated or over-the-shoulder, phone held, product in the same room |
| Floor-standing / large / installed (furniture, purifier, appliance) | **full body in room** for scale, or partial body for interaction | walking past, kneeling beside it, adjusting it |
| Hands-free automatic operation (the point is "it runs without you") | **full body leaving/arriving**, or no person at all | stepping out of the entryway while the device runs |
| Pet / baby / plant products | the **cared-for subject** is the primary living element; the person is secondary or absent | pet eating from the bowl, adult nearby supervising |
| Sensitive / regulated / hygiene-critical | hands only, or none | clean hands, face out of frame |

> **For sit-in / lie-on products, "a hand touching the armrest" is the wrong answer.** The buyer needs to see the product **occupied and in use** — posture, recline angle, where the limbs rest, whether it fits a real body. State the occupant's clothing (salon-appropriate: robe, casual wear, or the service uniform), posture and recline state, limb placement, gaze or eyes-closed, and that the occupant must not hide the product's silhouette or key structure. For a service product, one occupant plus one attendant is stronger than either alone.

3. **No disembodied limbs.** A hand or forearm entering from the frame edge with no plausible body attached is a failure pattern: either show enough of the person to read as a person (torso + arm, kneeling, seated), or frame the hands close in on the part being operated so the crop is natural. **The "arm reaching in from off-frame" gesture may appear at most once in a set** — and never in two slots that share a similar setting.
4. **Every person or hand needs a stated purpose** — operation, scale, care, or benefit. An idle bystander standing beside the product with no action is a failed slot: give them a real action or remove them.
5. **A living subject does not have to be human**: for pet/baby/plant categories, the animal or plant can carry the life in the frame while people stay out of it.
6. **When a person or hand does appear, state all of**:
   1. **Persona**: age band and gender presentation (e.g. "young adult woman"); ethnicity only when the user named a target market; no minors as the primary subject unless the product is for children and the user approved it.
   2. **Wardrobe**: top, bottom, and footwear with colour + material ("white knit top, pale beige trousers, soft house slippers"); plain and unbranded, fully and modestly clothed.
   3. **Posture and exact action**: what the body does and **which hand touches which part of the product**.
   4. **Gaze**: where the person looks (at the product, at the pet, out the window, away from camera).
   5. **Placement**: which side of the frame, and their own occupancy % relative to the product's.
   6. **Face policy**: visible and calm, or deliberately cropped/turned out of frame — state which; AI-original person, never a recognizable likeness.
   7. **Anatomy and hierarchy guards**: five correct fingers per hand, natural joints and proportions, no extra limbs, undistorted face; the person must **not cover the product's key structural features**, and the product stays the visual focus.
7. **Persona lock**: when more than one slot shows a person, lock ONE persona (same age band, hair, wardrobe palette) so the set reads as one household story, and vary the interaction level, pose, and framing between those slots — never repeat the same pose or hand gesture.
8. **Platform overrides** (these outrank the judgement above):
   - **TikTok Shop**: platform grammar *requires* human presence in ≥3 of 4 slots.
   - **Amazon**: mannequins are forbidden (real people are fine in supporting images).
   - **TikTok children's swimwear/underwear**: flat lay only, no model.
   - **Regulated / sensitive categories**: downgrade to hands-only or omit people, and say so in the delivery summary.

### Expression-mode diversity (stop the leader-line clone set)

The most common failure is a set where every image is "product + two or three leader lines + short labels". A set must **vary how it speaks**, not just what it says.

**Five expression modes:**

| Mode | How the message is carried | Copy role | Typical archetypes |
|---|---|---|---|
| **M1 Editorial photograph** | one strong photograph; the message lives in the composition and a headline in reserved space | benefit or scenario headline + subhead; **no labels on the product** | A1, A7, close-range in-scene frame |
| **M2 Narrative scene** | a person, pet, or action tells the story (leaving home, feeding, checking, tidying) | scenario headline + one supporting line | A2, A7, A9 |
| **M3 Geometry-driven** | meaning comes from layout: equal columns, two panels, numbered steps, flat lay, symmetric pair | short caption per column/panel, or one feature strip | A5, A6, A8, A9, A10 |
| **M4 Annotated technical** | leader lines, dot anchors, arrows, cutaway pointing at parts | part or function labels — **this is the only mode allowed to label parts** | A4 |
| **M5 Second-subject demo** | a phone/app/controller in frame shows how it is operated | exact UI strings + headline | A3 |

**Mode quota per set:**

| Requested images | Distinct modes required | Caps |
|---|---|---|
| 4 | ≥3 | M4 ≤ 1 slot; no other mode more than twice |
| 5–6 | ≥4 | M4 ≤ 1 slot; no other mode more than twice |
| 7+ | ≥5 | M4 ≤ 1 slot; no other mode more than three times |

**Hard rules:**

1. **One annotated slot maximum.** After the set's single M4 slot, no other image may carry leader lines, dot-anchored labels, or arrows pointing at parts. Move that information into a caption, a step column, or the environment instead.
2. **Do not label visible parts as if they were selling points.** "Backrest", "Armrest", "Seat", "Foot Basin", "Front Base" are part names, not messages — they belong only in the single M4 slot, and even there each label must earn its place (function, benefit, or material).
3. **Never render planning vocabulary as on-image text.** Words used to brief the shot — "Front View", "Visible Components", "Floor Contact", "Retail Interior Context", "Salon Placement", "Front Assembly Detail", occupancy percentages, angle names, slot or archetype names — are instructions to the model, not copy. On-image text may only be the customer-facing strings the user approved.
4. **Copy must speak to the buyer, not describe the photo.** Captions like "Client Service Context", "Salon & Spa Setting", "Product shown within a salon service setting", "Pedicure chair shown in a professional service environment" only narrate what is already visible. Apply the **copy voice test**: does the line state a benefit, a scenario, a verified spec, or an instruction the buyer needs? If it merely names or describes the picture, rewrite it.
5. **Vary the copy shape too**: if one slot uses a centred headline + subhead, another should use a flush-left headline, another a feature strip, another per-column captions. Not every slot gets "headline + 3 short labels".
6. **A slot may also be purely photographic** (headline only, or even copy-free where the platform prefers it) when the message is emotional, scale, or context — that still satisfies enrichment through scene richness plus a person/pet/accessory.

### Slot brief template (fill before writing any prompt)

A thin prompt comes from a thin brief. For every slot, fill all ten fields — then the Enhancer turns them into the labeled prompt:

| Field | Content |
|---|---|
| 1. Message | the single thing this slot proves |
| 2. Base | scene (which place) or studio (why it qualifies for the exception) |
| 3. Element inventory | 6–9 named elements with material + position, closed list (studio: surface + backdrop only) |
| 4. Staging | product occupancy % + position zone; each secondary subject's occupancy %, position, and action; whether this slot carries a person/hand at all, and if so the level (hands / partial body / full body) with persona, wardrobe, gaze |
| 5. Camera | angle, height, shot scale, and what is sharp vs defocused |
| 6. Light | named source, side, time of day, quality, shadow behaviour |
| 7. Art direction | named editorial register + palette + anti-ad clause |
| 8. Copy | exact strings per text level (H1 / H2 / tertiary strip or note), language, and the type skeleton zone |
| 9. Graphics | which L2 kind, if any: L2-anno (only in the set's single M4 slot), L2-geo (columns/panels/badges/flat lay), L2-ui (screen cards) — with exact count, geometry, anchors — or an explicit "no icons, arrows, cards, or badges" when the slot is photography-led |
| 10. Guards | anatomy, gravity, grounding, dryness, and identity clauses relevant to this slot |

> Field 9 matters in both directions: a lifestyle or macro slot should often **state that no graphics are added**, so the model does not decorate it. Richness comes from environment, staging, and light — not from more overlays.

### Slot differentiation contract (no two slots may look alike)

**Message uniqueness comes first.** Assign each slot a distinct message from this taxonomy, and never assign the same one twice:

`what it is` · `where it is used / placement in a room` · `who uses it and how it feels` · `how it works inside` · `how it is operated` · `how it is cleaned / maintained` · `what is included` · `configuration or state options` · `scale vs a human or room` · `material and finish quality`

> "Placement in a salon" and "shown in a professional salon setting" are the **same message** — two slots like that are a duplicate, not a variation. If two planned slots reduce to the same sentence, change one of their messages before touching the visuals.

Then fill this matrix for the whole set **before** writing any prompt. Two slots may not share the same value in more than two columns:

| Slot | Place / area of the world | Shot scale + camera height | Product position & occupancy % | Expression mode (M1–M5) | Enrichment layers | Person present? |
|---|---|---|---|---|---|---|

- **Expression mode**: satisfy the **Expression-mode diversity** quota — ≥3 distinct modes in a 4-image set, and only one M4 annotated slot.
- **Shot scale**: a 4+ slot set needs at least one wide/environmental, one medium, and one tight composition.
- **Camera height**: eye level, product level (low), and slightly high (~30°) should each appear at least once in a 5+ slot set.
- **Product placement**: left-third / right-third / centered must not all be identical, and occupancy should differ by ≥10 percentage points between neighbouring slots.
- **Place**: a different room area or vantage per slot — never reuse the identical backdrop with only new copy.
- **Mirroring is not variation**: flipping the composition left↔right, nudging the camera a few degrees, or swapping which side the person's arm enters from produces a **duplicate**. A real variation changes at least the message plus one of {place, shot scale, expression mode, interaction level}.
- If two planned slots still read alike, change the **message first**, then the base scene, then the shot scale. Never fix similarity by adding more text or more callouts.

### Typography is design, not an overlay

L1 is a **designed type system**, not text pasted onto a photo. Build every text-bearing slot per `selling-point.md` → **Step 5: Typography Design**, and lock one system for the whole set:

- one type skeleton (top band / left column / lower third) reused across the set;
- one type scale (H1 : H2 : label size ratios), one weight pair, one colour pair;
- one restrained accent treatment (hairline rule, single dot, or light translucent card) used at most once per slot, and only where the background would otherwise hurt legibility;
- copy always sits in **reserved negative space** planned in the composition — never over the product, never crossing a face or the product silhouette.

### Slot archetypes (reusable stacks)

Use these as the planning vocabulary. Pick 4–8 per set; each slot carries exactly one primary message.

| # | Archetype | Stack | Mode | Must be stated explicitly in the prompt |
|---|---|---|---|---|
| A1 | **Hero + headline** | L0 studio/gradient + L1 | dense | product occupancy %, headline + subhead verbatim, closed prop list |
| A2 | **Scene narrative** | L0 scene + L1 (+ minimal L2 icon/link) (+ L3) | dense | soft left/right narrative without hard split, icon count, person's action |
| A3 | **App / control demo** | L0 scene + L5 device + L1 + L2 cards | dense | card count, per-card label verbatim, no invented UI, no brand marks on screen |
| A4 | **Structure / how-it-works cutaway** | L0 studio + L2 cutaway + flow arrows + leader labels | dense | which half is cut, the allowed internal parts, arrow path, each label's anchor |
| A5 | **Usage / maintenance steps** | L0 scene × N columns + L2 step badges + L1 captions | dense | column count, unique badges 1..N, identical product per column, hand realism |
| A6 | **Accessories / what's in the box** | L0 studio + L4 line-up + L1 list caption | dense | exact item list, all items grounded with contact shadow, nothing extra |
| A7 | **Lifestyle benefit with person** | L0 scene + L3 + L1 (no L2) | dense | person pose/action, product occupancy %, explicitly no icons/cards/arrows |
| A8 | **Dual state / dual configuration** | L0 two identical units + L1 | dense | both units identical in every visible feature; no ✓/✗ marks, no competitor framing |
| A9 | **Two-panel narrative** | full-width L1 header + two equal panels, each its own L0 scene (+ L3 / L5 inside a panel) | dense | header spans both panels, hairline divider (no thick border), each panel's own place/staging, shared palette and photographic quality |
| A10 | **Top-down flat lay** | L0 fabric/wood surface shot from above + L4 line-up + L1 + optional tertiary contents line | dense | top-down camera, deliberate asymmetry with calm spacing, each item's position named, unbranded packaging, directional sunlight |

> Layout mapping: A1 → `selling-point.md` ①; A2/A7 → ④; A3/A6 → ②; A4 → ⑥; A5/A9 → ⑦; A8 → ⑧; A10 → ② geometry, top-down.

> **Base rule**: A1, A4, A6, A8, A10 use the clean studio/gradient/fabric base; **A2, A3, A5, A7, A9 use a furnished scene base** and must satisfy **Scene layer richness**. There is no detail-crop archetype — when a close range is needed, shoot it as a **close-range editorial frame inside a real interior** (softly defocused room behind, headline in reserved space, no callouts), which stays a scene slot.

> **Secondary-subject variant**: A1, A2, A5, A7, A9 may add a live pet or a person as a secondary subject when the category supports it — state its occupancy %, position, action, and anatomy guards, and keep it from covering the product's key structural features. On platforms whose hero must be a bare white-background product shot, this variant is not available to the hero.

### Composite planning of a set

1. Lock the platform hard specs first (hero rule, slot count, ratio, prohibited elements) from the platform section below.
2. Assign an archetype per slot so the set answers, in order: **what it is → where it is used → how it works → how it is operated → how it is maintained → what is included**. Add a lifestyle/benefit or dual-state slot when the count allows. Every slot after the hero must satisfy the **Supporting-slot enrichment mandate**.
3. **Hero exception**: when the platform forbids in-image text or overlays on the hero, that slot is **L0 only** — strip L1/L2 entirely instead of shrinking the copy. This exception applies to the hero slot ONLY; it never justifies a bare supporting slot.
4. Do not reuse one archetype twice in a set unless the platform requires multiple scene/detail slots — and even then, the two slots must carry different messages and different enrichment layers. Vary the archetype, never the style tokens.
5. One AI call per slot; slot count must match the requested/platform count (≥4 for a complete set).
6. If an archetype needs a fact the user has not supplied (UI strings, accessory list, internal structure), ask for that fact or swap in another enriched archetype — never substitute a generic single-scene or single-angle image silently.

### Layer permission by platform

| Platform | Hero slot | Supporting slots | Minimum enrichment per supporting slot | Hard layer bans |
|---|---|---|---|---|
| Amazon | L0 only, pure white, ≥85% coverage | L1 / L2 / L3 / L4 / L5 all allowed | L1 + one of L2/L3/L4/L5 | no text, logo, or graphic overlay on the hero |
| eBay | L0 only, neutral/white | L3 / L4 / L5 (text and badges banned) | two of L3/L4/L5 (in-use, accessories, scale reference) | text, badges, and borders banned on every image |
| Walmart | L0 only, seamless white | L1 / L2 / L3 / L4 | L1 + one of L2/L3/L4 | no text overlay or promo language on the hero |
| Shopify | L0 (L1 allowed) | all layers | L1 + one of L2/L4/L5 (L3 limited) | L3 limited to at most one anonymous hand |
| Etsy | L0 + handwritten L1/L2 | all layers | handwritten L1 + one of L2/L3/L4 | no placeholder/mockup copy on the hero |
| AliExpress | L0 only, pure white | L1 / L2 / L3 / L4 | L1 + one of L2/L3/L4 | no oversized marketing type or color blocks; no collage |
| TikTok Shop | L0 only, pure white | L3 required in ≥3 slots; **L1 and L2 banned set-wide** | L3 + one of L4/L5 (or a second distinct interaction) | no text overlay, no graphic overlay, no stickers |
| Shopee | L0 only, solid-color cover | L1 / L2 / L3 / L4 | L1 + one of L2/L3/L4 | no promo text/symbols, no collage |
| Lazada | L0 only, pure white | L2 / L3 / L4 (informational labels only, no promo copy) | L2 + one of L3/L4 | no promotional text or decorative overlays on any slot |
| Alibaba.com | L0 only, real photo, 75–80% | L1 (English only) / L2 / L3 / L4 / L5 | L1 + one of L2/L3/L4/L5 | Chinese text banned; marketing/discount wording banned |
| 1688 | L0 only, pure white | L1 (zh-CN) / L2 / L3 / L4 / L5 | L1 + one of L2/L3/L4/L5 | no excessive text overlay, no other-platform watermark |

> The platform ban always wins over the archetype. If an archetype's message cannot survive the ban (e.g. A4 leader labels in a TikTok set), move that message to a slot the platform allows or drop the archetype — never smuggle the text in at a smaller size.

### Set lock — extended for composite slots

Beyond the style tokens (background world, lighting, palette), lock the following across the whole set and reuse the wording verbatim in every slot's prompt:

- **Product structure lock** — every slot shows the same visible structure (same window, buttons, outlet, bowl, ports, seams). Multi-column and dual-unit slots must be internally identical as well.
- **Persona lock** — when more than one slot shows a person, use one persona (age band, hair, wardrobe palette) across them; pose, interaction level, and framing change per slot.
- **Scene world lock with room variety** — one coherent world (same home/workspace, same palette, same light temperature), but a different room area, vantage, or depth arrangement in every slot.
- **Type system lock** — one type skeleton, one type scale, one headline weight/colour, one subhead weight/colour, one label style for the entire set (see `selling-point.md` → Step 5).
- **Graphic language lock** — one leader-line weight/color, one arrow style, one badge shape/color for the entire set.
- **Message uniqueness** — each slot owns one message; never restate another slot's headline.

### Composite slot check (agent-side)

- Every slot's layer list matches its archetype, and each layer's reference was loaded.
- **Every non-hero slot carries ≥2 enrichment layers** permitted by the platform; no supporting slot is a bare angle, bare crop, or bare scene shot.
- **No slot is a bare macro/detail crop** — `image-detail.md` was not used as a slot base.
- **Every slot has a filled slot brief** (all ten fields), including quantified staging: product occupancy % + position, and each secondary subject's occupancy %, position, and action.
- **Every scene slot names** 6–9 elements with material and position, three depth planes, the light source, the depth-of-field intent, and an art-direction register with an anti-ad clause; at least half of the supporting slots use the scene base.
- **Physics/anatomy guards are present** wherever a pet, person, hands, water, or falling material appears (correct anatomy, gravity, contact shadow, electrical parts dry).
- **Human interaction is planned, not stamped**: the chosen level matches the product's form and operation mode, every person/hand has a stated action (no idle bystander), no person appears in hero/structure/contents/dual-state slots, and the persona is locked when more than one slot shows a person.
- **Every slot has a unique message** from the taxonomy; no two slots reduce to the same sentence, and no slot is a mirrored/re-angled copy of another.
- **Sit-in / lie-on products show an occupant actually using the product** in at least one slot, not just a hand on the armrest; no disembodied arm enters the frame in more than one slot.
- **Copy passes the voice test** — it states a benefit, scenario, spec, or instruction, and never merely describes the photograph ("… Setting", "… Context", "Product shown in …").
- **Expression-mode quota is met**: ≥3 distinct modes (4 images), ≥4 (5–6), ≥5 (7+); **exactly one annotated (M4) slot at most**; no other mode overused.
- **No part-name labels outside the single M4 slot**, and **no planning vocabulary rendered as on-image text** (no "Front View", "Visible Components", "Floor Contact", occupancy numbers, slot names).
- **Copy shape varies across the set** — not every slot is "headline + a few short labels".
- **Photography-led slots explicitly say no graphics are added**, so they are not decorated with stray icons or badges.
- **The differentiation matrix is filled** and no two slots share more than two identical columns; shot scale, camera height, and product placement vary across the set.
- **Typography follows the locked skeleton and scale**; copy sits in reserved negative space and never overlaps the product or a face.
- The hero slot is the only single-capability image in the set, and it complies with the platform's layer ban.
- Slot count matches the requested/platform count, with one AI call per slot.
- Each L1 string is verbatim, appears exactly once, and is in the resolved target language.
- Each L2 element has a stated count, position, and anchor; each L4 item is in the confirmed list.
- Each supporting slot carries a distinct message; no two slots differ only by camera angle.
- No layer introduces a fact absent from the user request or the source image.

---

## Special Scenario — Batch Generation

> Use this scenario when the user uploads **multiple images** and asks for the **same operation** to be applied to all of them (e.g., "batch process these 20 product photos to white background", "make all these images into Amazon main images", "apply the same scene style to every SKU photo").

> **Scope boundary**: the **Supporting-slot enrichment mandate** does NOT apply here. Batch Generation repeats one requested operation per input image, so a batch of plain white-background or plain scene outputs is correct. The mandate applies only when the user asks for a platform image **set** for one product — including each set inside a "batch of platform image sets".

### Core Rules

1. **User-specified parameters are the hard batch contract.**
   - Any parameter the user explicitly specifies (operation, background color, ratio, lighting mood, output format, platform target, resolution) must be honored for every image.
   - Do not reinterpret the operation differently per image.
   - If the user's request contains ambiguity (e.g., "make them look better"), propose a single safe default and apply it uniformly across the whole batch — do not let the interpretation drift from image to image.

2. **Style consistency is pursued, not enforced rigidly.**
   - The agent should plan prompts so that the batch reads as visually aligned where semantically reasonable, but it is **not required** to force every image into an identical background world, lighting language, or color palette.
   - Use a **batch style token** as a default anchor, then adapt it per image when strict reuse would create semantic or environmental conflicts.
   - Examples of conflicts where strict reuse should be relaxed:
     - A kitchen product and an outdoor product both asked for "warm home scene" — the outdoor product should get an appropriate warm outdoor context, not a kitchen counter.
     - A dark tech gadget and a pastel baby product both asked for "soft shadows" — the lighting quality can stay similar while the surrounding world differs.
   - When in doubt, prefer **coherence in quality and treatment** over **sameness of scene**.

### Workflow

1. **Intake all images first.**
   - List the batch: file names, dimensions, formats, visible content, and any obvious outliers (damaged, wrong category, extreme aspect ratio).
   - Note domain/style diversity: are these all similar products, or mixed categories? This determines how rigid the style lock should be.
   - Flag images that cannot be processed as requested (e.g., a logo-design request on a corrupted file) and report them before starting the batch.

2. **Lock the hard contract; plan a flexible style anchor.**
   - Summarize back to the user: operation, target ratio, output count, and any assumptions.
   - Propose a **flexible style anchor** — a short phrase that captures the shared treatment (e.g., "clean studio lighting, soft shadow, neutral background") without prescribing a single literal scene.
   - Example: *"Batch plan: convert all 12 images to clean white-bg product hero, 1:1, 1600×1600, with consistent studio lighting and soft shadow. If a product clearly belongs in a different environment, we'll adapt the background while keeping the lighting quality uniform."*
   - Ask for confirmation if the request is ambiguous or if outliers exist.

3. **Generate one image at a time with a shared template and per-image adaptation.**
   - Use a reusable prompt skeleton: `[Operation] + [Flexible style anchor] + [Per-image adaptation] + [Per-image preservation clause]`.
   - The **style anchor** should stay as consistent as possible across the batch; the **per-image adaptation** resolves semantic conflicts (e.g., different appropriate environments for different product types).
   - Number outputs ("image N of M") to help the model maintain continuity.

4. **Coherence gate before delivery.**
   - Spot-check at least 3 outputs across the batch: first, middle, and last.
   - Verify that the shared treatment feels consistent at a glance: lighting quality, shadow softness, color temperature, output ratio, and overall finish.
   - Do not flag a result as inconsistent just because the literal background scene differs — flag it only if the **treatment quality** visibly diverges (e.g., one image is harsh flash while others are soft window light).
   - If one output diverges in treatment, identify which style anchor was lost and regenerate only that image with the corrected prompt.

### Difference from Platform Image Sets

| Dimension | Platform Image Set | Batch Generation |
|-----------|-------------------|------------------|
| Input | Usually one reference product | Multiple distinct images |
| Goal | Per-platform campaign coherence | Same operation applied with shared treatment |
| Style unit | One style system per platform | One flexible style anchor per batch, with per-image adaptation |
| Output relationship | 4–6 images tell one product story | Each image is independent but visually aligned where reasonable |
| Ratio | Platform-mandated | User/platform-mandated; may follow source if user asks |
| Background world | Must be shared | Should be coherent in quality, may differ by product domain |

### Batch of Platform Image Sets

When the user uploads **multiple product images** and asks for a **platform image set for each** (e.g., "make each of these 10 products into an Alibaba 6-image set"), the two modifiers overlap. Apply these rules:

1. **One platform set per input image** — treat each uploaded product image as the single reference for its own set. Do not mix products across sets.
2. **Per-set style contract is primary; batch-wide anchor is secondary** — within one set, use the platform's style system (shared background world, lighting, palette). Across different sets, the style contract restarts for each new product. Do not force unrelated products into a single shared literal background just because they are processed in the same batch; keep treatment quality consistent, not the literal scene.
3. **Output mapping** — aggregate results by input image so the user can clearly map each generated image back to its source product (e.g., "Product A — hero", "Product A — scene", "Product B — hero", ...).
4. **Reference count** — load `references/platform-product-guidelines.md` once, then apply its rules independently to each product's set.
5. **Do not average products** — each set preserves only its own product's identity; never generate a "generic" set that blends features from multiple inputs.

### Common Pitfalls

- **Over-locking the scene**: forcing a kitchen counter background onto every image when the batch contains outdoor gear will produce nonsensical results. Lock the treatment, not the literal environment.
- **Drifting treatment adjectives**: replacing "soft natural shadow" with "gentle shadow" or "subtle drop shadow" across calls will break batch coherence. Pick one phrase for the shared anchor and stick to it.
- **Source-ratio following by default**: when the user says "batch process these", they usually expect visual consistency more than pixel-perfect source preservation. Confirm the target ratio instead of silently mixing ratios.
- **Outlier contamination**: one corrupted, miscategorized, or heavily watermarked image can make the whole batch look uneven if its output is included without flagging.
- **Silent enhancement variance**: applying HD upscale to only the low-res images while leaving others untouched creates a visibly uneven batch.

---

## Cross-Border B2C

### 1. Amazon

1. **Hero image count**: 1 hero required; recommended total ≥6 supporting images + 1 video.
2. **White background**: ✅ Mandatory pure white (RGB 255, 255, 255).
3. **Recommended size**: Longest side min 500 px, max 10,000 px; recommended ≥1600 px for best zoom. **AI generation target: 2K (2048 px on the longest edge)**.
4. **Aspect ratio**: No strict enforcement; typically 1:1 or category-appropriate.
5. **File format**: JPEG preferred; also TIFF, PNG, GIF (non-animated).
6. **Max file size**: 10 MB.
7. **Resolution/DPI**: 72 DPI recommended; longest side ≥1000 px enables Zoom.
8. **Product coverage**: ≥85%.
9. **Background**: Hero must be pure white; supporting images allow lifestyle scenes, text, infographics.
10. **Prohibited elements**: Watermarks, borders, text, logos, URLs, prices, promotions (e.g., "Free Shipping"), non-included accessories, mannequins (except apparel), reviews/ratings, Amazon logos.
11. **Supporting images**: Allow product details, scale references, lifestyle scenes, text overlays, infographics, models.
12. **Video/3D**: 1 video recommended, MP4 or common formats.
13. **Category-specific rules**:
    - Footwear: single shoe facing left at 45°
    - Adult apparel: hero must use model, standing
    - Underwear/swimwear/infant clothing: must be flat lay, no model
14. **Official docs**: [Image requirements](https://sellercentral.amazon.com/help/hub/reference/external/G1881) | [Style guide](https://sellercentral.amazon.com/help/hub/reference/external/G9FUUH87RBNXGKB7)

### Amazon Image Set Style Notes

Amazon is the **info-first** platform. The winning structure for a 4-image set is usually:

1. **White-bg hero** — all colorways in a neat grid or a single clear product shot on pure white; communicates SKU value instantly.
2. **Spec chart** — dimension callouts (diameter, thickness, length, stretch) in one clean infographic slot; merge dimensions rather than spreading them across multiple images.
3. **Usage guide** — 2–4 configurations/positions with short headings and sub-lines showing how the product is used.
4. **Benefit callout** — product arrangement + real hand or lifestyle detail + one benefit sentence; keep it inside the white-bg world.

Style tokens: `clean white background, thin dark gray dimension arrows, small neat sans-serif labels, generous white space, soft neutral shadows`.

> **Enrichment mandate for Amazon**: slot 1 is the hero (L0 only, pure white, ≥85%). Slots 2–4 are composite by construction — spec chart = L0 studio + L2 arrows/leader lines + L1 values; usage guide = L0 studio or scene columns + L2 step badges + L1 captions; benefit callout = L0 + L3 hand or lifestyle detail + L1 benefit line. Any additional supporting image (slots 5–7) must also carry ≥2 enrichment layers; a plain back/side/angle shot is an extra, not a required slot.

> **Why this works**: Amazon buyers are in comparison mode; info density and clarity beat atmospheric lifestyle scenes. Lifestyle can still appear in slots 5–7 if the user wants them, but the core 4-image set should answer "what is it, what size, how do I use it, why is it better" first.

---

### 2. eBay

1. **Image count**: 1–24.
2. **White background**: ⭕ Strongly recommended.
3. **Recommended size**: Min 500×500 px; recommended 1600×1600 px for clearer display and zoom viewing. **AI generation target: 2K (2048 px on the longest edge)**.
4. **Aspect ratio**: 1:1 or 16:9.
5. **File format**: JPEG, PNG, GIF, TIFF, BMP, WEBP, HEIC, AVIF.
6. **Max file size**: 12 MB.
7. **Resolution**: High resolution (1600 px recommended) enables zoom.
8. **Product coverage**: Not specified; must show full product without clutter.
9. **Background**: Neutral or white recommended; avoid cluttered environments.
10. **Prohibited elements**: Borders, text, logos, copyright notices, watermarks, promotional badges.
11. **Supporting images**: Multiple angles, details, defects, size reference (e.g., coin), package contents.
12. **Video**: Via Photos & Video panel.
13. **Category-specific**: Used/vintage items must use actual photos (no stock images); PSA Graded Cards have a dedicated auto-fill flow.
14. **Official docs**: [Picture requirements](https://www.ebay.com/help/selling/listings/adding-pictures-listings/picture-requirements?id=4148)

### eBay Image Set Style Notes

eBay is the **trust-first catalog** platform. The safest 4-image set is a consistent light-gray or white multi-view catalog:

1. **3/4 hero** — angled front view on neutral background (L0 only; the set's single-capability image).
2. **Condition / mechanism composite slot** — straight-on or profile base + hand demonstrating the mechanism, opening, or fit (L0 + L3 + a second interaction/context cue).
3. **Scale composite slot** — detail or profile base + a scale reference held or placed beside the product (coin, hand, everyday object) + visible contact grounding.
4. **Contents composite slot** — product with its included accessories/packaging laid out, or macro material shot with a hand presenting it (L0 + L4, or L0 + L3 + L4).

Style tokens: `light gray seamless background, even soft shadow, consistent camera height and lighting across all views, no props that do not come with the product`.

> **Enrichment mandate for eBay**: eBay bans in-image text and badges, so slots 2–4 must still be composite via non-text layers — e.g. hand-held scale reference, product in use, accessory/packaging line-up, or mechanism shown mid-action. A plain second/third camera angle does not count as a required slot (see **Supporting-slot enrichment mandate**).

> **Why this works**: eBay buyers need to verify condition and authenticity; multi-view consistency is the trust signal. This set is a solid fallback when the user does not need a styled campaign, but it is usually lower priority than Amazon/TikTok/Etsy/Shopify sets.

---

### 3. Walmart Marketplace

1. **Image count**: ≥1; recommended ≥4.
2. **White background**: ✅ Mandatory seamless pure white (RGB 255, 255, 255).
3. **Recommended size**: US: 2200×2200 px; CA: 2000×2000 px @ 300 ppi. **AI generation target: 2K (2048 px on the longest edge)**, then scale to market final size.
4. **Aspect ratio**: 1:1 (square).
5. **File format**: JPEG, JPG, PNG, BMP (no animated GIF).
6. **Color format**: RGB; bit depth: 8 bits per pixel.
7. **Max file size**: US: 5 MB; CA: 1 MB.
8. **Resolution**: Min 500×500 px (below = auto-delist); zoom requires 1500×1500 (US) / 2000×2000 (CA).
9. **Image duplication**: Do not duplicate images on the same product detail page.
10. **Product coverage**: Fill frame as closely as possible.
11. **Background**: Hero must be seamless white; supporting images allow environment/detail shots.
12. **Prohibited elements**: Watermarks, personal/company logos, text overlays, promotional language, price tags, borders, non-included accessories, other retailer logos.
13. **Supporting images**: Back, side, detail, multi-angle, lifestyle; apparel allows "Pack Bugs". These are the platform-permitted content types, not a delivery plan — build each as a composite slot (`L0 + L1 labels + one of L2/L3/L4`) per **Supporting-slot enrichment mandate**; a bare back/side/angle shot is an extra image, never a required slot.
14. **Video/3D**: Rich Media supported per Walmart media library standards.
15. **Category-specific**: Large items (e.g., bedding) may include reasonable lifestyle environment.
16. **Official docs**: [US guidelines](https://marketplacelearn.walmart.com/guides/Item%20setup/Item%20content,%20imagery,%20and%20media/Product-detail-page:-Image-guidelines-&-requirements) | [CA guidelines](https://marketplacelearn.walmart.com/ca/guides/Item%20setup/Item%20content,%20imagery,%20and%20media/item-image-guidelines)

---

### 4. Shopify

1. **Image count**: Min 1; max 250 media items per product (images + 3D + video).
2. **White background**: Not required; theme-dependent.
3. **Recommended size**: 2048×2048 px (square) for best display. **AI generation target: 2K (2048 px on the longest edge)**.
4. **Aspect ratio**: 1:1 recommended; any ratio supported (auto-generates thumbnails).
5. **File format**: PNG (preferred), JPEG, WebP, PSD, TIFF, BMP, GIF, SVG, HEIC. Animated GIF and WebP files are supported.
6. **Max file size**: Image 20 MB; 3D model 500 MB; video 1 GB.
7. **Resolution**: Max 5000×5000 px or 25 megapixels.
8. **Product coverage**: Not specified; product should be clear.
9. **Background**: Not specified; driven by merchant brand style.
10. **Prohibited elements**: Embedded videos must not use private/restricted-access videos (must be public/unlisted).
11. **Supporting images**: Encouraged multi-angle; system auto-generates size variants.
12. **Video/3D**: Uploaded video ≤10 min, ≤1 GB, up to 4K (4096×2160 px), in .mp4, .mov, or .webm format; 3D models ≤500 MB, in .GLB or .USDZ format.
13. **Category-specific**: None (customized via apps/theme code).
14. **Official docs**: [Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types) | [Add media](https://help.shopify.com/en/manual/products/product-media/add-media)

### Shopify Image Set Style Notes

Shopify is the **brand-owned premium** platform. There is no platform-imposed style, so the image world should match the merchant's page theme. A proven 4-image luxury/professional set:

1. **Product portrait** — negative-space hero under deliberate lighting (spotlight or rim light).
2. **Detail macro** — material, weave, texture, or craft close-up.
3. **Styled flat lay** — curated surface arrangement showing the product as object.
4. **Gift box / packaging shot** — only when gifting is the selling angle; otherwise replace with another detail or lifestyle still.

Style tokens: `dark moody premium, deliberate lighting design, controlled shadows, styled surfaces, editorial composition, subtle film grain`.

> **Enrichment mandate for Shopify**: slots 2–4 must still be composite — pair the macro/flat-lay/packaging base with brand-voice copy plus one more layer (annotation, swatch cards, accessory line-up, or the single anonymous hand). A bare macro or bare flat lay does not satisfy a required slot.

Hard boundary vs TikTok: **people are absent, or at most one anonymous styling hand**. The product-as-object is the selling point; it should feel like a brand lookbook, not a creator post.

> **Why this works**: Shopify shoppers buy into a brand world. Coherence between the image set and the page theme (dark set → dark theme, serif wordmark, swatch dots) is the conversion driver. Adapt the palette to the product category (navy/teal for premium, warm earth for artisan, monochrome for minimalist).

---

### 5. Etsy

1. **Image count**: Max 20 photos.
2. **White background**: Not required; stock images and placeholder renders prohibited.
3. **Recommended size**: Width and height ≥2000 px; the first image should have both width and height ≥635 px to avoid appearing lower in search results. **AI generation target: 2048 px on the shortest side** (ensures both dimensions meet Etsy's ≥2000 px recommendation; note this differs from other platforms where 2K refers to the longest edge).
4. **Aspect ratio**: 4:3 or 1:1 recommended (first image horizontal or square for thumbnail cropping).
5. **File format**: .jpg, .gif, .png, .svg, .heic (no animated .gif, no transparent .png).
6. **Max file size**: ≤1 MB recommended for stable upload.
7. **Resolution**: 72 PPI recommended; sRGB color mode.
8. **Product coverage**: Centered with adequate negative space (for cropping tolerance).
9. **Background**: Clean with ample whitespace recommended.
10. **Prohibited elements**: Hero must not contain placeholder mockups (e.g., "Your Text Here"); must use original photos.
11. **Supporting images**: Subsequent images may use renders to show customization options.
12. **Video**: 3–15 s, silent, ≤100 MB, MP4/MOV/FLV/AAC/AVI/3GP/MPEG, 1080p recommended.
13. **Category-specific**: Children's products must meet safety policy; custom products require real sample as hero.
14. **Official docs**: [Image help](https://help.etsy.com/hc/en-us/articles/115015663347) | [Image requirements](https://www.etsy.com/legal/policy/listing-image-requirements/253962679005)

### Etsy Image Set Style Notes

Etsy is the **handmade / warm / gifting** platform. The winning system is a handwritten scrapbook collage set, all in **4:3 landscape** with content kept in the central safe zone (desktop thumbnails crop 4:3, mobile crops 1:1).

A proven 4-image structure:

1. **Cover** — product cluster or wreath on one side, large handwritten script title + subline on the other; title must survive thumbnail crop.
2. **Feature chart** — products or details annotated with handwritten color names and small icons.
3. **Usage polaroids** — 1–2 taped photo frames showing the product in use, with warm annotation.
4. **Gift box** — kraft box with tissue/twine, product peeking out; box itself stays text-free, annotation around it.

Style tokens: `textured light gray paper background, beige washi tape, elegant handwritten script typography, hand-drawn hearts/arrows/sparkles, polaroid frames, soft natural shadows`.

> **Enrichment mandate for Etsy**: the handwriting layer is what makes these slots composite — every non-cover slot needs handwritten L1 copy plus one more layer (L2 annotation/icons/polaroid frames, L3 hand, or L4 gift packaging). A clean unannotated product photo does not satisfy a required slot.

> **Why this works**: The handwritten annotation layer carries the 手作感 and personality that plain photography cannot. Do not abandon it because a user complains the template feels repetitive — instead vary the collage dialect (torn-edge scraps, filmstrips, notebook margins, wax seals, pressed flowers) while keeping the handwriting voice.

---

### 6. AliExpress

1. **Image count**: 1–6 (some categories up to 8).
2. **White background**: Mandatory for first hero image.
3. **Recommended size**: ≥800×800 px. **AI generation target: 2K (2048 px on the longest edge)**, then downscale to final delivery size and ≤5 MB if needed.
4. **Aspect ratio**: 1:1.
5. **File format**: JPG, JPEG, PNG.
6. **Max file size**: ≤2 MB or ≤5 MB (varies by category).
7. **Resolution**: Not specified; must be clear and not blurry.
8. **Product coverage**: 70%–85%.
9. **Background**: First image pure white; subsequent allow solid color, scene, or lifestyle.
10. **Prohibited elements**: Borders, watermarks, multi-image collages, oversized marketing text or color blocks.
11. **Brand logo exception**: A brand logo may be placed in the upper-left corner, up to 220×80 px, with a 20 px margin, under the accessible regional guidelines.
12. **Supporting images**: Recommended order: front, back, side, detail, scene, packaging — read as **content types the platform permits, not slots**. Deliver them as composite slots: hero = L0 only pure white; then a use-context slot (L0 scene + L1 + L3/L2), a structure or steps slot (L0 + L2 callouts/cutaway + L1 labels), and a contents slot (L0 + L4 accessory line-up + L1 caption). Keep marketing type restrained (no oversized text or color blocks) and never ship a bare front/back/side view as a required slot.
13. **Video**: ≤30 s (max 2 min), ≤2 GB, AVI/3GP/MOV/MP4.
14. **Category-specific**: Apparel recommends model photography.
15. **Official docs**: [Seller portal](https://sell.aliexpress.com/) | [Seller learning](https://sellerlearning.aliexpress.com/)

---

### 7. TikTok Shop

1. **Image count**: 1–9 (≥5 recommended for "Good" quality rating).
2. **White background**: Hero (first image) must be pure white.
3. **Recommended size**: ≥600×600 px. **AI generation target: 2K (2048 px on the longest edge)**, then compress to ≤2 MB if needed.
4. **Aspect ratio**: 1:1 (square).
5. **File format**: JPG, JPEG, PNG.
6. **Max file size**: Image not specified (≤2 MB recommended); video ≤5 MB.
7. **Resolution**: >600×600 px.
8. **Product coverage**: Not specified; must clearly show the subject.
9. **Background**: Hero must be pure white; no mosaic or blur effects.
10. **Prohibited elements**: Watermarks, text, borders, graphic overlays, marketing stickers (e.g., "Best Seller"), digital renders, black-and-white images.
11. **Supporting images**: Show different angles, functional details, accessories; no duplicate angles.
12. **Video specs**: Max 1 video per listing, **≤5 MB** (very strict limit).
13. **Media Center video**: Product Media Center accepts MP4 videos ≤10 MB, under 60 seconds, with an aspect ratio from 9:16 to 16:9; however, the Product Listing Policy separately limits listing videos to ≤5 MB.
14. **Category-specific**: Food must show packaging; children's swimwear/underwear must be flat lay on background — no live models or mannequins.
15. **Official docs**: [Image guidelines](https://seller-us.tiktok.com/university/essay?knowledge_id=3196690250417921)

### TikTok Shop Image Set Style Notes

TikTok Shop is the **creator / UGC 种草** platform. The hard differentiator is **human presence**: at least 3 of the 4 shots must include a person or body part (hands, arms, lap, shoulder, POV grip) **interacting with the product**.

Recommended 4-image structure:

1. **Worn-as-accessory close-up** — hands, wrist stack, clasped pose, or how the product is worn/held.
2. **Rear-head / hairstyle detail** — product in use with hard shadow on wall; faces out of frame.
3. **Mid-motion freeze** — the core benefit shown in action (secure hold, stretch, grip, etc.).
4. **Pre-activity ritual** — lacing shoes, gear bench, getting-ready moment; product in life, not on a pedestal.

> **Enrichment mandate for TikTok Shop**: text and graphic layers are banned set-wide, so each supporting slot must stack **L3 + one more non-text layer** — a second body/interaction point, an accessory or packaging item in frame, a companion device, or a clear scale/context reference. Shot 1 is the hero (L0 only, pure white). A bare product-only angle never counts as a supporting slot.

Style tokens (sports / active categories): `direct camera flash aesthetic, hard small shadows, slightly grainy editorial film look, cool tones, plain unbranded garments, faces out of frame`.

Style tokens (cozy / home categories): `warm golden light, cream/beige home scenes, influencer phone-photo authenticity, lived-in mess, soft natural skin tones`.

Hard rules:
- **Ratio: 1:1 square ONLY** — never 3:4/4:5, even if official docs are silent on ratio. Use the platform minimum (≥600×600 px) as the floor; the style system targets 800×800+ for best thumbnail quality.
- **No text overlays** on the editorial set; let the action do the selling.
- **AI-original people only**, faces cropped or out of frame; plain unbranded garments; no crests/numbers/athlete likeness.

Boundary vs Shopify: TikTok should feel like *"a creator I follow just posted this"*; Shopify should feel like *"a brand's lookbook page"*. If a generated TikTok set could pass as Shopify, regenerate with stronger human presence and phone-photo angles.

> **Why this works**: TikTok shoppers convert on authentic "someone like me uses it" energy. The person USING the product is the selling point, not the product alone.

---

### 8. Shopee

1. **Image count**: 1–9 (including cover); Shopee Mall requires ≥3 different angles.
2. **White background**: Cover image requires solid-color background (white preferred).
3. **Recommended size**: Mall min 500×500 px; recommended 1024×1024 px. **AI generation target: 2K (2048 px on the longest edge)**, then downscale to final size.
4. **Aspect ratio**: 1:1 mandatory; optional 3:4 upload for extra traffic.
5. **File format**: JPG, JPEG, PNG.
6. **Max file size**: ≤2 MB.
7. **Resolution**: Must be clear, sharp, true-color.
8. **Product coverage**: Cover ≥60%; non-cover ≥50%.
9. **Background**: Cover must be solid color (white preferred); apparel/food/home non-cover may use environment backgrounds.
10. **Prohibited elements**: Watermarks, collages, borders, promotional text/symbols; Mall seller logo limited to top-left corner at <10% area.
11. **Supporting images**: Must show different angles, details, scale, usage, variations, packaging, and relevant specifications; avoid duplicate views. Each of these must be built as a composite slot (`L0 + L1 + one of L2/L3/L4`) per **Supporting-slot enrichment mandate** — "different angles" alone does not satisfy a slot; the angle must carry usage, scale, spec labels, or accessories.
12. **Video**: Max 1, ≤30 MB, resolution ≤1280×1280, 10–60 s, MP4.
13. **Category-specific**: Fashion/beauty cover allows models; adult products require special coverage guidelines.
14. **Official docs**: [Image guide](https://seller.shopee.sg/edu/article/34)

---

### 9. Lazada

1. **Image count**: 3–8. Product images must not be duplicated within the same image set.
2. **White background**: Hero (first image) must be pure white.
3. **Recommended size**: Min 330×330 px; recommended 1000×1000 or 1600×1600 px. **AI generation target: 2K (2048 px on the longest edge)**, then downscale to final size.
4. **Aspect ratio**: 1:1.
5. **File format**: JPG, JPEG, PNG.
6. **Max file size**: ≤3 MB.
7. **Resolution**: ≥72 DPI.
8. **Product coverage**: ~80% (e.g., 80–100 px margin on 1600 px canvas).
9. **Background**: Hero must be pure white (RGB 255, 255, 255).
10. **Prohibited elements**: Watermarks, promotional text, decorative borders, distracting graphic overlays, unrelated objects, competitor branding, and content that obscures or misrepresents the product.
11. **Supporting images**: Must include side, back, detail views; lifestyle scenes or scale references recommended. Build each as a composite slot — because Lazada bans promotional text, use informational L2 labels/callouts plus L3 interaction or L4 accessories (`L2 + one of L3/L4`) rather than promo copy; a bare side/back/detail view is an extra image, never a required slot.
12. **Video**: ≤100 MB, 10–60 s, MP4.
13. **Category-specific**: Fashion supports AI model try-on generated images.
14. **Official docs**: [Lazada University](https://university.lazada.sg/) | [Image requirements](https://redmart.lazada.sg/seller/support/image-requirements-12698.html)

---

## B2B

### 10. Alibaba.com (International)

Use this spec when generating an Alibaba.com main image set (主图套图) so the output meets the platform's upload rules and risk-control requirements.

**1. Set composition — 4 to 6 composite slots (flexible, ordered):** every Alibaba.com main image set MUST include the following slots in this order. The set may contain 4, 5, or 6 images depending on product category and user intent; do not fall below 4 images for a complete listing set. Only slot 1 is a single-capability image — every other slot is a composite slot (`L0 base + ≥2 enrichment layers`) per **Composite Slot Model** → **Supporting-slot enrichment mandate**.

Required base (4 slots):
- **Slot 1 — Hero (white background), L0 only ×1** (must be the first image): pure-white real-product shot, no copy, no callouts, no arrows.
- **Slot 2 — Use-context composite slot ×1**: L0 furnished scene + English L1 headline/subhead + one of L2 (minimal icon/leader line) or L3 (person/hand in use). Archetype A2 or A7. The scene must satisfy **Scene layer richness** (place identity, three depth planes, closed 3–6 element list, named light, depth of field).
- **Slot 3 — Structure / how-it-works composite slot ×1**: L0 clean studio/gradient surface + L2 (cutaway, flow arrows, or dot-anchored leader lines) + English L1 part labels. Archetype A4, or A5 staged in a real scene when the message is an ordered operation. A bare macro crop does NOT satisfy this slot — detail crops are not a slot type.
- **Slot 4 — Feature / contents composite slot ×1**: L0 studio + English L1 headline + one of L2 (feature cards, step badges) / L4 (accessory & packaging line-up) / L5 (app or controller screen). Archetype A3, A6, or A8.

Optional extensions (add in order to reach 5–6 slots):
- **Slot 5 — Second use-context composite slot ×1** — add when the product benefits from showing multiple use contexts (e.g., indoor + outdoor, work + home). Must carry a different message and different enrichment layers than slot 2.
- **Slot 6 — Model composite slot ×1** — add for apparel, accessories, lifestyle, or beauty products where a model adds value: L0 scene + L3 model + English L1 benefit copy. For categories where a model is inappropriate, unsafe, or prohibited (industrial equipment, food packaging, children's swimwear/underwear, sensitive medical devices), replace this slot with another structure/steps or contents composite slot instead.

Do not skip the hero slot, reorder the required base, or omit a required slot's role. Optional slots may be substituted only with another composite scene, structure, or contents slot — never with a duplicate hero, a bare angle shot, or prohibited content.

> Every non-hero slot MUST carry at least two enrichment layers (English copy + callouts/steps/model/accessories); a bare scene photo, an unlabeled close-up, or an alternate-angle white-background shot does not satisfy its slot. The hero slot stays **L0 only**. All L1 copy in this set must be English — Chinese is strictly prohibited.

**2. Base image parameters:**
- Recommended size: not smaller than 640×640; recommended 1000×1000 square. **AI generation target: 2K (2048×2048 square)**, then downscale to 1000×1000 for final delivery.
- Aspect ratio: square (1:1), edge length within 1000×1000.
- File format: JPG / JPEG / PNG.
- File size: ≤5 MB per image.

**3. Hero (white-background) requirements:**
- Mandatory white-background real-product photo: the hero must be a pure-white-background real product shot (also applies to customized products); 3D renders are strictly prohibited.
- Complete and clear subject: the product subject must not be missing or cropped; do not use detail/close-up/partial shots; the subject must be clear with visible details, not too small or blurry.

**4. Composition:**
- Subject coverage: product occupies 75%–80% of the frame, clear and centered.
- No collage, no borders: image collages are not allowed; borders of any form are not allowed, including "white-border images" created by pasting the original onto a white canvas to force a ratio (judged as a border issue — use a ratio-adjustment tool instead).

**5. Copy & language:**
- Any text in the image must be in English.
- Chinese text is strictly prohibited.

**6. Prohibited elements — none of the following may appear:**
- Contact info (including WeChat ID), URLs, QR codes.
- Watermarks (including video watermarks, text watermarks, and watermarks of any form).
- Marketing / discount / platform-benefit wording, including but not limited to: `Local stock`, `EU Local stock`, `Fast customization`, `Guaranteed`, `certified`, `MARCH`, `FREE shipping`, `US$20 off of shipping`, `50% off`, `30% off of new buyers`, `every ¥15 off 15`, `( )% tariff support`, `180-day lowest price`, `delivery`, `dispatch`, `delivery by`, `lower tariff`, `1-year-warranty`, `easy return / money back guarantee`, `GMV`, `1 popular in jewelry`.

**7. Risk-control compliance:**
- Must not contain pornographic, violent, political, terrorist, gory, prohibited-goods, vulgar, or sensitive content; violations will be rejected by the risk-control model after submission.

**8. Official docs**: [Rules](https://rule.alibaba.com/rule/detail/11000682.htm) | [Knowledge base](https://service.alibaba.com/page/knowledge?pageId=128&category=1000000021)

---

### 11. 1688

1. **Image count**: **≥5** (1 hero + ≥4 supporting) — key indicator for product quality score. Only the hero is a single-capability image; every supporting slot is a composite slot (`L0 base + ≥2 enrichment layers`) per **Composite Slot Model** → **Supporting-slot enrichment mandate**. Recommended slot plan:
   - **Slot 1 — Hero, L0 only**: pure-white real-product shot, no copy, no callouts.
   - **Slot 2 — Use-context composite slot**: L0 furnished scene + zh-CN headline/subhead + person/hand or a minimal icon. Archetype A2 / A7; the scene must satisfy **Scene layer richness**.
   - **Slot 3 — Structure / how-it-works composite slot**: L0 clean studio/gradient + cutaway or flow arrows + dot-anchored zh-CN part labels. Archetype A4.
   - **Slot 4 — Operation or maintenance composite slot**: L0 furnished scene columns + numbered step badges + zh-CN step captions. Archetype A5 (or A3 when an app/controller drives operation).
   - **Slot 5 — Contents / configuration composite slot**: L0 studio + accessory & packaging line-up or two identical units + zh-CN headline and contents caption. Archetype A6 / A8.
   - Beyond slot 5, add further composite slots only when each carries a new verified message. A bare alternate angle or unlabeled close-up may be delivered as an extra, never as one of the ≥5 required slots. All in-image copy is Simplified Chinese.
2. **White background**: Hero must be white-background real product photo (no 3D renders for customizable items).
3. **Recommended size**: ≥800×800 px. **AI generation target: 2K (2048 px on the longest edge)**, then downscale to final size.
4. **Aspect ratio**: Strict 1:1.
5. **File format**: JPG / JPEG / PNG.
6. **Max file size**: ≤5 MB per image.
7. **Resolution**: Industrial/technical drawings ≥150 dpi; critical dimensions labeled in mm.
8. **Product coverage**: 75%–80%, centered and clear.
9. **Background**: Pure white (RGB 255, 255, 255), no shadow or very faint shadow.
10. **Prohibited elements**: Watermarks (especially those from other platforms), messaging QR codes, external links, excessive text overlays.
11. **Detail page images**: Width ≤752 px (max 790 px); include material, craft, size chart, factory capability modules.
12. **Video**: MP4, ≤30 s, ≥720P, must showcase core selling points or production process.
13. **Category-specific**: Apparel — hero must cover front/side/detail; hardware/electronics — hero should include technical parameters or drawings.
14. **Official docs**: [Rules](https://rule.1688.com/) | [Wiki](https://wiki.1688.com/zh/WKfkh560fqu60w)
