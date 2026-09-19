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

### Pinterest panel

Four screens, in order:

1. **Disconnected empty state** — dark panel titled Pinterest, centered red P logo, “Not connected to Pinterest yet”, outlined **Connect Pinterest**. No local-session paste tray as the primary path.
2. **Connect** opens real Pinterest OAuth (`https://www.pinterest.com/oauth/` → `pinterest.com/login`).
3. **Grant** asks for public + secret boards/pins and the user account. App display name is **ArtShift** unless `PINTEREST_APP_NAME` is set (Pinterest console).
4. **Connected feed** — Pins | Boards tabs, refresh + ⋯, masonry of the user’s Pins (and boards). **Disconnect** returns to state 1.

`Connect` → `GET /api/pinterest/oauth/start?returnTo=/projects…` → callback `GET /api/pinterest/oauth/callback`. Tokens stay in an encrypted httpOnly cookie (`artshift_pinterest_session`).

Required env:

- `PINTEREST_CLIENT_ID`
- `PINTEREST_CLIENT_SECRET`
- `ARTSHIFT_PUBLIC_URL` (redirect `{publicUrl}/api/pinterest/oauth/callback`)

If credentials are missing, the empty state stays on screen; Connect explains setup (start returns 503). Paste / URL import is a labeled **fallback** under ⋯, not the happy path.

`GET /api/pinterest/status` reports `oauthConfigured`, `connected`, and `officialSavedPins: oauth_when_configured`. ArtShift does not scrape Pinterest or Google Images.

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
- [x] Pinterest Connect OAuth + Pins/Boards masonry; Disconnect returns to empty state
- [x] Note available in the Block library
- [x] Normal editor chrome (chat, Option Bar, layers, properties) on Moodboard
- [x] Copy to artwork slide
- [x] Artwork slides unchanged
