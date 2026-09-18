# Image expand / outpaint (ArtShift · 2026-09-18)

## What Peerawat asked

How to **expand / outpaint** an existing image (extend canvas left / right / top / bottom) for ArtShift, given:

- GPT Image via **OpenAI Images API (direct BYOK)** and **Replicate GPT Image**
- OpenAI custom sizes capped at longer:shorter ≤ **3:1**, edges ÷16, max edge **3840**, pixel budget **655,360–8,294,400**
- Product need: expand a filled **3:1** banner toward **29×7cm (~4.14:1)**, which exceeds the API aspect cap

Related: [GPT Image size bounds](./gpt-image-size-bounds-2026-09-17.md).

Source policy: **primary sources only** (OpenAI API docs / reference / OpenAI cookbook; Replicate first-party model README + OpenAPI schema). Checked **2026-09-18**.

## Executive finding

| Path | Can outpaint? | Output ratio still ≤ 3:1? | Mask? |
|---|---|---|---|
| OpenAI `POST /v1/images/edits` (GPT Image) | Yes — endpoint is defined as creating an **edited or extended** image; localized replace via RGBA mask | **Yes** — edits `size` uses the same 1:3–3:1 custom-size rules as generations | **Yes** — `mask` param; α=0 = edit region |
| OpenAI `POST /v1/images/generations` | No input image — generate only | Same size rules | N/A |
| Replicate `openai/gpt-image-2` / `gpt-image-2.5-*` | Edit via `input_images` + prompt only | Output `aspect_ratio` is a **fixed enum** (no arbitrary `WxH`; no ~4.14:1 token) | **No** `mask` in model Input schema |

**Single-shot outpaint to 29×7cm (~4.14:1) is impossible** on both paths: OpenAI rejects / forbids aspect > 3:1; Replicate never exposes a custom 4.14:1 size. Getting a true ultra-wide print raster requires **client-side stitch** (or accept letterboxing / soft crop as in the size-bounds note).

---

## Official size constraints (still apply to edits)

### OpenAI Images API (generations **and** edits)

Sources:

- [Image generation guide — size constraints](https://developers.openai.com/api/docs/guides/image-generation)
- [Create image (`/images/generations`)](https://developers.openai.com/api/reference/resources/images/methods/generate/)
- [Create image edit (`/images/edits`)](https://developers.openai.com/api/reference/resources/images/methods/edit/)
- [Python Images.edit reference](https://developers.openai.com/api/reference/python/resources/images/methods/edit/)

For `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-2.5-sunburst` (+ snapshot), and `gpt-image-2.5-flare` (+ snapshot), both **generations** and **edits** document the same custom `size` rules:

- `WIDTHxHEIGHT` string (e.g. `1536x864`)
- Width and height **divisible by 16**
- Aspect ratio between **1:3 and 3:1** (long:short ≤ **3:1**)
- Neither edge above **3840** (reference also cites max supported resolution `3840x2160`)
- Pixel count between **655,360** and **8,294,400**
- Resolutions above **2560×1440** are experimental
- Recommended presets still include `1024x1024`, `1536x1024`, `1024x1536` (+ `auto` where supported)

Implication for expand: **requested output `size` for an outpaint call must itself stay inside 1:3–3:1**. Padding a source onto a 4.14:1 canvas and asking the API for that `size` is out of bounds.

### Replicate GPT Image

Sources:

- [GPT Image 2.5 Sunburst README](https://replicate.com/openai/gpt-image-2.5-sunburst/readme)
- [GPT Image 2 README](https://replicate.com/openai/gpt-image-2/readme)
- Model Input OpenAPI (`dereferenced_openapi_schema` on the model API page / Cog Input): `aspect_ratio` enum for Sunburst and GPT Image 2 includes named ratios (`1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `16:9`, `9:16`, `auto`) and discrete pixel tokens (`1024x1024`, `1536x1024`, `1024x1536`, `2048x1152`, `3840x2160`, `2160x3840`, …) — **not** arbitrary `WxH`, and **no** ~4.14:1 token.

`input_images` is present; **`mask` is not** in the Input schema for these models.

---

## Official edits / mask semantics

### What `/images/edits` is for

[Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit/) / [Python edit](https://developers.openai.com/api/reference/python/resources/images/methods/edit/):

> Creates an **edited or extended** image given one or more source images and a prompt.

[Image generation guide — Edit Images](https://developers.openai.com/api/docs/guides/image-generation):

- Edit existing images
- Generate new images using other images as a reference
- Edit parts of an image by uploading an image and a **mask** that identifies areas to replace

### Mask rules (GPT Image)

From the guide + API reference + [GPT Image cookbook (mask section)](https://developers.openai.com/cookbook/examples/generate_images_with_gpt_image):

| Rule | Source |
|---|---|
| Fully **transparent** mask pixels (α = 0) mark where `image` should be edited / regenerated | [Python `mask` param](https://developers.openai.com/api/reference/python/resources/images/methods/edit/); [DALL·E cookbook (same α=0 rule)](https://developers.openai.com/cookbook/examples/dalle/image_generations_edits_and_variations_with_dall-e) |
| Mask must include an **alpha channel** (PNG) | [Image generation guide — Mask requirements](https://developers.openai.com/api/docs/guides/image-generation); cookbook |
| Mask must match the **same dimensions** as the (first) input image | Python `mask` docs; guide |
| If multiple input images, mask applies to the **first** | Guide + cookbook |
| Masking is **guidance**, not pixel-perfect; model may still touch “preserved” regions | Guide (“prompt-based”); cookbook |
| Prompt should describe the **entire** resulting image, not only the hole | Cookbook |
| GPT Image inputs: up to **16** images on the current edit reference; each `png`/`webp`/`jpg` &lt; **50MB** | [Python edit `image` param](https://developers.openai.com/api/reference/python/resources/images/methods/edit/) |
| Guide also notes image+mask same format/size and &lt; **50MB** | [Mask requirements](https://developers.openai.com/api/docs/guides/image-generation) |
| Python `mask` text still says mask PNG &lt; **4MB** and same dims as `image` | [Python `mask`](https://developers.openai.com/api/reference/python/resources/images/methods/edit/) — treat as additional constraint to satisfy |

### Legacy DALL·E note (transparent image as implicit mask)

[DALL·E cookbook — Edits](https://developers.openai.com/cookbook/examples/dalle/image_generations_edits_and_variations_with_dall-e) (archived, DALL·E-2 era):

- Endpoint “edits or **extends** an existing image”
- If **mask is not provided**, the image **must have transparency**, which will be used as the mask

GPT Image docs/reference **document an explicit `mask` field** and do **not** restate the “transparency-of-image-alone = mask” shortcut. For ArtShift on GPT Image, prefer **explicit RGBA mask** rather than relying on DALL·E-2 implicit-mask behavior.

---

## Concrete recipes

### Recipe A — Padded canvas + mask → `/images/edits` (preferred on OpenAI BYOK)

**Goal:** Extend left / right / top / bottom while keeping the original content.

1. **Choose a legal target size** `W×H` (÷16, 1:3–3:1, pixel budget, ≤3840).  
   Example: expand a 3:1 banner only up to another legal landscape (still ≤3:1), not to 4.14:1.
2. **Client-compose input image:** new RGBA (or RGB) canvas `W×H`; paste the source centered (or flush to the opposite edge of the expand direction). Fill new strips with any placeholder (opaque black/white is fine if using a separate mask).
3. **Build mask PNG** same `W×H`: α=255 (opaque) over pixels to **preserve**; α=0 (transparent) over the **new border strips** to regenerate ([α=0 = edit](https://developers.openai.com/api/reference/python/resources/images/methods/edit/)).
4. `POST /v1/images/edits` with:
   - `model`: e.g. `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare` / `gpt-image-2`
   - `image`: padded canvas
   - `mask`: RGBA mask
   - `prompt`: full-scene description + “extend seamlessly into the empty border; preserve the original subject, layout, and style”
   - `size`: `"WxH"` (same legal size)
   - Optional: `quality`, `background` (`opaque` for filled print banners; `transparent` only if the extension itself should stay alpha — requires `output_format` `png` or `webp` per [guide](https://developers.openai.com/api/docs/guides/image-generation) / [prompting guide](https://developers.openai.com/api/docs/guides/image-prompting))
5. Expect imperfect mask adherence; may need a second tight inpaint pass on seams.

**Does output `size` still need 1:3–3:1?** **Yes** — edits reference states the same aspect / edge / pixel rules as generations ([edit `size`](https://developers.openai.com/api/reference/resources/images/methods/edit/)).

### Recipe B — Transparent-border canvas (+ mask)

Same as A, but the padded input image itself has **α=0 in the border**:

- Useful for visualizing the hole and for tools that preview alpha.
- On **GPT Image**, still send an **explicit mask** aligned to that hole (do not assume DALL·E-2 “image alpha alone” behavior).
- On **DALL·E-2 only**, cookbook allows omitting `mask` when the image already carries transparency ([DALL·E cookbook](https://developers.openai.com/cookbook/examples/dalle/image_generations_edits_and_variations_with_dall-e)). ArtShift’s GPT Image path should not depend on this.

### Recipe C — Prompt-only edit with `input_images` (weaker preservation)

Supported on both OpenAI edits (no mask) and Replicate (`input_images`):

- Pass the original image + prompt “extend the scene 20% to the left/right…”
- Request a **larger legal** `size` / `aspect_ratio`
- Model may **recompose** rather than strictly outpaint; OpenAI positions mask-less edits as full/partial rewrite or reference compose ([guide](https://developers.openai.com/api/docs/guides/image-generation); [Sunburst README](https://replicate.com/openai/gpt-image-2.5-sunburst/readme))

Use when speed &gt; geometric fidelity; not the first choice for print banners that must keep the filled 3:1 content fixed.

### Recipe D — Multi-step side panels + client stitch (ratios &gt; 3:1)

**Not an OpenAI/Replicate feature** — product pipeline forced by the **3:1** / enum caps above.

1. Keep the filled **≤3:1** (or max legal) center as the authoritative panel (already generated / edited via A–C).
2. For each missing side (e.g. left and right for 29×7):
   - Crop a **seed strip** from that edge of the center (overlap for blending).
   - Call edits (OpenAI + mask preferred) or Replicate `input_images` to generate a **continuation panel** at a legal size (often square or 3:2 / 16:9 enum on Replicate).
   - Prompt: continue perspective, lighting, and motif; lock identity of overlapping content.
3. **Client stitch** panels with overlap feather / hard seam; crop or letterbox to exact print pixels for 29×7cm.
4. Optional: final OpenAI mask inpaint only along seams at a legal size, then re-stitch.

This is the only path that can produce a true **~4.14:1** raster while each model call stays legal.

---

## What ArtShift already has vs what to build

Checked adapters:

### Already present

- **OpenAI BYOK** (`lib/server/ai/adapters/openaiAdapter.ts`): if `input.inputImages` is non-empty, `generateImage` calls `POST https://api.openai.com/v1/images/edits` with multipart `image[]`, `prompt`, `size`, `quality`, `background`, `output_format`.
- **Replicate** (`lib/server/ai/adapters/replicateAdapter.ts`): passes `input_images` data URLs into the GPT Image prediction when present; sets `aspect_ratio` via `normalizeReplicateAspectRatio`.
- **Contract** (`lib/ai-runtime/contracts.ts`): `AiImageGenerateInput.inputImages?: AiImageInput[]` — reference/edit images, no expand op.

### Missing for product-grade expand

| Gap | Why it matters |
|---|---|
| No `mask` on OpenAI adapter / contract | Recipe A/B cannot be sent; only prompt-only edits |
| No padded-canvas / mask builder in orchestration | Expand geometry is client/server image work not yet owned |
| No expand / outpaint task or UI | Users cannot request left/right/top/bottom deltas |
| Replicate path cannot take a mask | Precision outpaint should prefer **OpenAI BYOK** when available |
| No multi-panel stitch for &gt;3:1 | 29×7cm full-bleed cannot be one API call |
| Size routing still snaps/clamps per [size-bounds note](./gpt-image-size-bounds-2026-09-17.md) | Must compose with expand (legal panel sizes vs final print frame) |

---

## ArtShift recommendation — expand toward 29×7cm (~4.14:1)

Ranked options:

1. **Best fidelity (recommended):** **OpenAI BYOK + Recipe A** for any expand that stays ≤ **3:1**; for **29×7cm**, use **Recipe D** (center at max legal ~3:1, left/right continuation panels with mask, client stitch to print pixels). Prefer Sunburst when preservation of the filled banner matters ([Sunburst positioning](https://replicate.com/openai/gpt-image-2.5-sunburst/readme)).
2. **Accept soft sides (shipped posture today):** Keep generating / cropping at ≤3:1 and accept slight side padding on a 4.14 frame — matches [size-bounds remediation](./gpt-image-size-bounds-2026-09-17.md). Lowest eng cost; not true outpaint.
3. **Replicate-only:** Prompt + `input_images` (Recipe C) at nearest enum aspect; **cannot** mask; **cannot** emit 4.14:1. OK for drafts; weak for print expand.
4. **Do not pursue:** Single-shot `size` / `aspect_ratio` at ~4.14:1 — blocked by OpenAI 3:1 and Replicate enum ([generations](https://developers.openai.com/api/reference/resources/images/methods/generate/), [edits](https://developers.openai.com/api/reference/resources/images/methods/edit/), Replicate Input schema).

**Minimal build order:** (1) contract + OpenAI `mask` upload, (2) client pad+mask helper for ≤3:1 expand, (3) optional multi-panel stitch for 29×7 only when full-bleed print is required.
