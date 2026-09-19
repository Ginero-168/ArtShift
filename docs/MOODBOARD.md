# ArtShift Moodboard — Spec v2.0 (artboard pivot)

**Locked 2026-09-19 (Asia/Bangkok)** — Peerawat product pivot. Supersedes the tilted-card / SerpAPI fill loop.

## North star

Moodboard is an **infinite artboard** that reuses the normal canvas toolchain (select, move, resize, layers, properties, chat). Designers place **their own reference images**. Keyword **Expand** only produces vibe labels and structure — it does **not** auto-pull stock photos.

**No SerpAPI.** **No generative images** on Moodboard. **Images stay upright** (rotation locked at 0°).

## Slide model

- `SlideKind: "artwork" | "moodboard"` (default artwork)
- Moodboard = frameless infinite board, create via `+ Moodboard` only (no convert)
- `moodboard?: MoodboardState` on `EngineSlide`; items are not mirrored into `elements[]` while you work on the board
- Moodboard items share the same transform fields as slide objects (`x`, `y`, `width`, `height`, `rotation`) so they can be copied onto a normal artwork slide as `EngineElement`s

## Image intake (core loop)

The designer finds and selects images. ArtShift does not scrape Google or Pinterest.

1. **Local upload / drag-drop / paste** of PNG, JPEG, WebP onto the infinite board
2. **Image URL paste** (`https://…`) onto the board
3. **References panel** — a local tray of saved URLs and uploads, with **Add to board**
4. **Pinterest tab** — paste a Pin or `pinimg.com` URL the user already saved

### Pinterest first slice (honest)

Official saved-Pins / board APIs need a reviewed Pinterest developer app (`blocked_pending_app_review`). This MVP:

- classifies `pinterest.*` / `pinimg.com` URLs
- stores them locally in `artshift.moodboard.references.v1`
- does **not** scrape Pinterest or Google Images
- does **not** call SerpAPI

OAuth / official board sync can plug into the same panel later.

## Expand (structure only)

1. LLM expands a keyword into lateral associations
2. Bucket into Subject / Setting / Prop / Mood / Color (quantity-first, ~18–24 **labels**)
3. Place upright notes/chips on the artboard — **no `/api/stock` call**
4. Requires auth + cloudConsent + BYOK for the LLM step
5. Expand chat uses JSON-only mode (`assistant.chat` `jsonObject`, up to 65535 Gemini output tokens). Truncated JSON is repaired when possible.

`/api/stock` (Unsplash / Pexels / Google CSE) remains for other surfaces such as the AI image panel. Moodboard Expand does not use it.

## Copy to a normal artwork slide

- Toolbar **Copy to slide** (also `Ctrl/Cmd+Shift+C`)
- Copies **selected** items, or **all** items if nothing is selected
- Creates a new `artwork` slide and adds `EngineElement`s (`createImage` / `createText`) with the same name, size, and upright transform
- After copy, layers / option bar / properties on that slide are the normal artwork tools

## Visual rules

- Infinite canvas with a quiet grid — not a scrapbook
- **No default tilt / rotation aesthetic**
- Selection ring + resize handle; properties panel edits X/Y/W/H; rotation stays 0°
- Layers list the board objects

## Acceptance

- [x] No SerpAPI path in Moodboard, `/api/stock`, env, or docs
- [x] Expand yields vibe labels in 5 roles and does not fetch stock
- [x] Upright media only
- [x] Drop / paste / URL / reference panel intake
- [x] Documented Pinterest limitation + usable paste tray
- [x] Copy to artwork slide
- [x] Artwork slides unchanged
