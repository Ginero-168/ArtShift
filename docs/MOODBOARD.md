# ArtShift Moodboard — Spec v2.0 (artboard pivot)

**Locked 2026-09-19 (Asia/Bangkok)** — Peerawat product pivot. Supersedes the tilted-card / SerpAPI fill loop.

## North star

Moodboard is an **infinite artboard** that reuses the **normal editor chrome** (chat, Option Bar, Block library, layers, properties). Designers place **their own reference images**. There is **no top-center Expand search bar**.

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
3. **Pinterest panel** in the left workspace switcher (Pinterest logo tab next to AI Assistance / Block)
4. **Note** block in the Block library (same insert path as other blocks)

### Pinterest panel (honest)

The panel matches the dark Pins | Boards mock: Sign-in, then masonry Pins, refresh, ⋯, and **Disconnect**.

Official saved-Pins / board APIs need a reviewed Pinterest developer app (`blocked_pending_app_review`). This slice:

- Sign-in starts a **local session** (OAuth start returns 501 until `PINTEREST_CLIENT_ID` exists *and* the app is reviewed)
- classifies `pinterest.*` / `pinimg.com` URLs the user pastes
- stores them in `artshift.moodboard.references.v1` and shows them as a masonry grid
- Boards tab explains the official API blocker
- does **not** scrape Pinterest or Google Images
- does **not** call SerpAPI

`GET /api/pinterest/status` reports `oauthConfigured` and the official-API status.

## Expand (structure only, no search UI)

The LLM expand route still exists for later use. It is **not** shown as a top-center keyword bar. Expand never calls `/api/stock`.

## Copy to a normal artwork slide

- Menu **Copy moodboard to slide** (also `Ctrl/Cmd+Shift+C`)
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
- [x] Expand API exists but is not a top-center search bar
- [x] Upright media only
- [x] Drop / paste / URL / Pinterest panel intake
- [x] Pinterest Sign-in + Pins/Boards shell; official API blocker documented
- [x] Note available in the Block library
- [x] Normal editor chrome (chat, Option Bar, layers, properties) on Moodboard
- [x] Copy to artwork slide
- [x] Artwork slides unchanged
