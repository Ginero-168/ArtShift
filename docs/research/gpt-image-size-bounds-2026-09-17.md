# GPT Image size bounds (ArtShift · 2026-09-17)

## What Peerawat asked

OpenAI “should” generate any size without borders except ultra-wide **29×7cm**.
ArtShift results showed thick white letterboxing on several sizes.

## Provider path (important)

ArtShift Image Studio uses the **OpenAI GPT Image 2.5 Sunburst model**, but traffic
goes **through Replicate**:

`browser → /api/ai/image → Replicate → openai/gpt-image-2.5-sunburst`

So capability is the **intersection** of OpenAI’s model limits and Replicate’s
input schema — not raw OpenAI Image API.

## Official OpenAI Image API bounds

Source: [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)

- Custom `size` as `WIDTHxHEIGHT`
- Width/height multiples of **16**
- Aspect ratio between **1:3 and 3:1**
- Neither edge above **3840**
- Pixel count between **655,360 and 8,294,400**
- Above **2560×1440** is experimental
- Recommended presets: `1024x1024`, `1536x1024`, `1024x1536` (+ 2K variants in docs)

Implication: **29×7cm ≈ 4.14:1 is outside 3:1**. Even direct OpenAI cannot emit a
true full-bleed 29×7 raster; slight side padding (Image 1) is expected.

Sizes like 53×20cm (~2.65:1), 1844×880 (~2.1:1), 1040×1040 (1:1) are **inside**
OpenAI’s 3:1 envelope.

## Replicate GPT Image 2.5 Sunburst input

Source: [Replicate model readme / schema](https://replicate.com/openai/gpt-image-2.5-sunburst)

`aspect_ratio` is a **fixed enum**, including named ratios
(`1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `16:9`, `9:16`, `auto`) and a short list of
pixel tokens (`1024x1024`, `2048x1152`, `3840x2160`, …).

Arbitrary tokens such as `2048x688` (ArtShift’s internal 3:1 banner size) are
**rejected with HTTP 422**. ArtShift previously surfaced that as a generic **502**.

## Why ArtShift looked like Image 2

1. Requested print ratio (e.g. 3:1 / 29×7 clamped) was sent as custom `WIDTHxHEIGHT`.
2. Replicate rejected or fell back toward a nearer enum (often ~16:9).
3. The bitmap was placed into a wider/taller frame **without cropping** → white bars.

## ArtShift remediation (this change)

1. **Snap** every upstream `aspect_ratio` to a Replicate-allowed token.
2. **Auto-crop** the result to the user’s target ratio (trim black/white letterbox,
   then center-crop) so banners fill edge-to-edge when the target ≤ 3:1.
3. For **> 3:1** (29×7cm): generate at max legal ~3:1, crop to 3:1; remaining side
   padding on a true 4.14 frame matches Image 1’s “นิดหน่อย” expectation.

## Practical size cheat-sheet for ArtShift users

| Request | Ratio | Expectation |
|---|---|---|
| 1040×1040 | 1:1 | Full bleed |
| 1844×880 | ~2.1:1 | Full bleed (within 3:1) |
| 53×20 cm | ~2.65:1 | Full bleed (within 3:1) |
| 1240×348 | ~3.56:1 | Crop toward 3:1; tiny edge risk |
| 29×7 cm | ~4.14:1 | **Must** keep slight side bars (model max 3:1) |
