# ArtShift Moodboard — Expand ideas → 9 Replicate images

**Locked product intent (Peerawat)** — Infinity Canvas is the frameless Moodboard board. Stock keyword → Unsplash/Pexels stays available separately. This document covers the **additional** AI batch path.

## Action

On an **Infinity Canvas** slide, the top bar shows **ขยายไอเดีย** (Expand ideas):

1. Designer enters one short keyword / vibe.
2. `POST /api/moodboard/expand` runs an LLM associative expansion (Subject / Setting / Prop / Mood / Color) and returns **exactly 9** distinct image prompts.
3. The client generates **9 images** via `POST /api/moodboard/generate` (one call per prompt).
4. Successful images are placed as normal upright canvas images in a **3×3 grid** near a staging origin (viewport center when empty, otherwise beside existing work / near board origin). Partial failures still place whatever succeeded.

## Model + BYOK

| Piece | Value |
|---|---|
| Image model | `black-forest-labs/flux-schnell` (~$0.003/image) |
| Alias | `image-moodboard` (hardcoded for v1) |
| Auth | Account session required |
| Consent | Explicit `cloudConsent: true` + client confirm |
| Credentials | Per-account Replicate BYOK via `requireEndUserCloudAi` — **never** shared `REPLICATE_API_TOKEN` |

Expand uses `assistant.chat` only. Generate uses `image.generate` with the Moodboard alias. Chat’s default output-count=1 policy does **not** apply to this button (batch of 9 is intentional).

## Placement

- Images are normal `EngineElement` images (copyable, selectable, editable).
- Rotation locked at `0°` (upright only).
- Grid helpers: `layoutMoodboard3x3`, `findMoodboardStagingOrigin`.
- Progress uses the existing Preload / processing preview tray (`kind: "generate"`).

## What this is not

- Not a replacement for `/api/stock` or the Unsplash panel.
- Not the abandoned Moodboard slide kind (`kind: "moodboard"` still migrates to Infinity Canvas).
- Does not reintroduce SerpAPI / Google Images scraping.
