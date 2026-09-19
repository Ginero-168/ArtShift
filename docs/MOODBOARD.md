# ArtShift Moodboard — Spec v1.2 (MVP)

**Locked 2026-09-19 (Asia/Bangkok)**

## North star

Keyword → **LLM vibe/association expansion** → structure into **Subject / Setting / Prop / Mood / Color** → fill board with **many real photos** (Google CSE, then Unsplash/Pexels).  
**No generative images** on Moodboard.

## Slide model

- `SlideKind: "artwork" | "moodboard"` (default artwork)
- Moodboard = frameless infinite board, create via `+ Moodboard` only (no convert)
- `moodboard?: MoodboardState` on `EngineSlide`; do not mirror into `elements[]` in MVP

## Expand formula (locked)

1. LLM expands keyword into broad associations (Bangkok → tuk-tuk, temples, Giant Swing, street food; ice → matcha ice, snowman, North Pole…)
2. Bucket into Subject / Setting / Prop / Mood / Color (quantity-first)
3. Target pack: **~18–24 board items** (e.g. Subject 5–6, Setting 5–6, Prop 4–5, Mood chips 6, Color chips 5; Subject/Setting may use 2 photos each)
4. Each visual item gets a stock query → `/api/stock` only
5. On failure: placeholder + retry — never gen-image fallback
6. Requires auth + cloudConsent + BYOK for LLM step; stock uses existing stock keys
7. Expand chat uses JSON-only mode (`assistant.chat` `jsonObject`) and parses the first JSON object from noisy model text. Parse failures return 502 with a short secret-redacted raw preview.

## Stock photo sources

`searchStockPhoto` calls `/api/stock` in this order and fail-closes to a placeholder (never a generative image):

1. **Google Custom Search** (`source=google`) when `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are set — official Programmable Search JSON API only (`https://www.googleapis.com/customsearch/v1`, `searchType=image`). No HTML scraping of Google Images.
2. **Unsplash** (`UNSPLASH_ACCESS_KEY`)
3. **Pexels** (`PEXELS_API_KEY`)

### Configure Google CSE

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project and enable **Custom Search API**.
2. Create an API key. Restrict it to Custom Search API if possible.
3. At [Programmable Search Engine](https://programmablesearchengine.google.com/) create a search engine.
   - Turn on **Image search**.
   - Turn on **Search the entire web** (otherwise results are limited to sites you listed).
4. Copy the **Search engine ID** (`cx`).
5. Set both server env vars (VPS / hPanel / `.env.local`) and restart the Node process:

```bash
GOOGLE_CSE_API_KEY=your-api-key
GOOGLE_CSE_CX=your-search-engine-id
```

Credits store `title` (or `displayLink`) as photographer, `provider: "google"`, and `image.contextLink` as `sourceUrl`.

## Smart play (keep light)

Light tilt on place, notes/tape, smart rearrange, scenes later if time. No chaos toys.

## MVP implementation order

1. `SlideKind` + empty frameless Moodboard + rail `+ Moodboard`
2. Drop/paste images + notes + pan/zoom
3. Keyword bar + LLM expand API (JSON breakdown only) + stock fill + credits
4. Quantity layout by role clusters + undo expand
5. Hide artwork frame chrome / gen-image entry points on moodboard
6. Add `docs/MOODBOARD.md` from this spec

## Acceptance

- [ ] Frameless moodboard slide in rail
- [ ] Expand yields vibe associations structured in 5 roles with high count
- [ ] All auto images are stock/upload/paste
- [ ] Credits on stock images
- [ ] Artwork slides unchanged
