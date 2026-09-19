# ArtShift Moodboard — Spec v1.2 (MVP)

**Locked 2026-09-19 (Asia/Bangkok)**

## North star

Keyword → **LLM vibe/association expansion** → structure into **Subject / Setting / Prop / Mood / Color** → fill board with **many real photos** (SerpAPI Google Images, then Google CSE, then Unsplash/Pexels).  
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
7. Expand chat uses JSON-only mode (`assistant.chat` `jsonObject`, up to 65535 Gemini output tokens). The parser repairs truncated JSON and synthesizes missing role buckets from associations so a cut-off Bangkok-scale reply still yields a complete pack. Unrecoverable failures return a clear retry message; a secret-redacted preview is only in the `preview` field.

## Stock photo sources

`searchStockPhoto` calls `/api/stock` in this order and fail-closes to a placeholder (never a generative image):

1. **SerpAPI Google Images** (`source=serpapi`) when `SERPAPI_API_KEY` or `SERPAPI_KEY` is set — `https://serpapi.com/search.json?engine=google_images` with `tbs=itp:photos`. Third-party Google Images JSON; no HTML scraping of `google.com/imghp`.
2. **Google Custom Search** (`source=google`) when `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are set — official Programmable Search JSON API only (`https://www.googleapis.com/customsearch/v1`, `searchType=image`). Optional fallback (CSE is closed to many new projects).
3. **Unsplash** (`UNSPLASH_ACCESS_KEY`)
4. **Pexels** (`PEXELS_API_KEY`)

### Configure SerpAPI (recommended for preview)

1. Create a [SerpAPI](https://serpapi.com/) account and copy the API key.
2. Set **one** of these server env vars and restart Node:

```bash
SERPAPI_API_KEY=your-serpapi-key
# or
SERPAPI_KEY=your-serpapi-key
```

**Free tier:** about **250 searches/month**. Each Moodboard Expand photo slot is one search (~15–20 searches per Expand if every visual gets its own query). That is roughly 12–16 full Expands per month on Free.

Credits store the image title as photographer, `provider: "serpapi"`, and the page `link` as `sourceUrl`.

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
