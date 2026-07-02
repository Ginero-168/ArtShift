# ArtShift — Roadmap & Status

> Single source of truth for planning. Supersedes `docs/ACTION_PLAN.md`, `docs/HANDOVER.md`,
> and `docs/REWRITE_PLAN.md` (all removed 2026-07-02 — this file absorbs anything from them
> that was still accurate).
>
> Last verified against actual code: **2026-07-02**. Previous planning docs had drifted far
> behind reality — several "pending" roadmap items turned out to already be fully implemented.
> Re-verify against the code before trusting a stale checklist again.

---

## Strategic direction: Local-First

ArtShift is a **local-first** app by deliberate choice, not by accident:

- All documents persist to `localStorage` only (`lib/engine/persist.ts`). Nothing is stored server-side.
- There is no auth, no user accounts, no database. `app/api/*` routes are stateless proxies to
  third-party AI services (Anthropic, Gemini, WaveSpeed, Unsplash/Pexels) — they never persist data.
- No cross-device sync, no multi-user collaboration, no share-links. A document lives in one browser.

**Why:** privacy by default (nothing leaves the browser except explicit AI calls) and zero
backend infrastructure to run/pay for/secure. This is the tradeoff we're accepting — not a gap
to "eventually fix". If real collaboration/sync is ever needed, treat it as a deliberate,
large architectural decision (new backend, auth, conflict resolution), not an incremental patch.

**Implications for future work:**
- Don't build features that assume a signed-in user or server-persisted state.
- `lib/engine/presetStore.ts`, `lib/engine/persist.ts` etc. staying `localStorage`-based is correct, not technical debt.
- Rate limiting on `app/api/*` (`lib/rateLimit.ts`) protects *our* API keys from abuse, not user data — it's operational, not a local-first concern.

---

## Current status (verified against code, not assumed from old docs)

| Area | Status |
|---|---|
| Quality gates | `npm run typecheck`, `lint` (Biome), `test` (69 tests / 9 files), `build` all pass clean |
| Routing | Single route `/` (main editor), `/present` (presentation mode), `/api/*`. Legacy `/editor`, `/editor-v2`, `/sandbox`, and the vendored `excalidraw/` folder are gone |
| Canvas engine | Custom Canvas2D (no Konva/Excalidraw lib) — select/move/resize/rotate, marquee, snap-to-edge + gap guides, groups, lock, flip, clipboard, undo/redo |
| **Arrow binding** | **Done.** Bindings are created while drawing (`CanvasEditor.tsx`) and while dragging an endpoint (`Transformer.tsx`); `recomputeArrowBindings` (`lib/engine/binding.ts`) runs after add/update/delete/flip; bound endpoints render a green indicator (`BindingIndicators.tsx`) |
| **Bound text** | **Done.** Double-click a shape spawns centered text with `containerId`; container delete/move cascades to the text (`lib/engine/store.ts`). Not yet clipped to container bounds on overflow (see Known gaps) |
| **Grid snap** | Engine + dot-grid rendering existed but had no UI control — **added a toolbar toggle** (`app/page.tsx`, `#` button next to Presets) |
| **Image crop** | Done — `CropOverlay.tsx` + `ImageSection.tsx` "Crop" button, `ImageElement.crop` persisted and rendered |
| **Frames** | `FrameElement.childIds` + renderer clipping implemented (`lib/renderer/canvas.ts`) |
| **Presets (was "Library")** | Done — `PresetPanel.tsx`, `lib/engine/presetStore.ts` |
| **Search / Stats** | Done — `SearchReplaceModal` and `StatsModal` in `app/page.tsx` |
| **Templates** | Done — `TemplateBrowser.tsx` wired to engine via `lib/templates.ts` |
| **PPTX / PDF / PNG export** | Done — `lib/engine/exportPPTX.ts`, `exportPNG.ts`, Thai font fallback (`Noto Sans Thai`) |
| **AI tool-use mapping** | Done — `lib/engine/chat.ts` (`runEngineChat`) applies AI mutations directly onto the engine store (`add_text`, `add_shape`, `add_image`, `update_object`, `delete_object`, `set_background`, `add_slide`, `apply_template`), with 1280×720 → 1920×1080 coordinate scaling |
| **Color adjustments / vision / bg removal** | Done and wired to real engine elements (`AIImageTools.tsx` reads/writes `ImageElement.adjustments`, calls local Florence-2 vision and WaveSpeed bg removal) |
| Branding | Renamed to **ArtShift** throughout (package.json, manifest, page title, in-app copy, AI persona). Internal `localStorage` keys (`mighty-slides:*`, `mighty-presets`) intentionally left unchanged to avoid silently orphaning existing users' saved data |

---

## Known gaps (verified still open — safe to trust this list)

| Gap | Where | Notes |
|---|---|---|
| Single-element resize on a **rotated** bbox does not snap (only axis-aligned resize does) | `components/Canvas/Transformer.tsx`, the `start.angle === 0` guard | Needs projecting the moving edge into world axes before calling `snapResize`. Real geometry work; `Transformer.tsx` has **zero test coverage**, so write tests alongside this fix, don't wing it |
| Multi-select scaling doesn't preserve rotated children's visual orientation (pure axial scale of each `x/y/w/h`) | `components/Canvas/Transformer.tsx` multi path | Acceptable for now; full fidelity needs a per-element transform matrix |
| Bound text isn't explicitly clipped to its container | `lib/renderer/canvas.ts` | Long text can overflow a small shape. Frame clipping exists as a reference pattern to copy |
| Dot grid color is hardcoded (`rgba(0,0,0,0.08)`), doesn't adapt to dark theme | `components/Canvas/CanvasRoot.tsx` | Cosmetic only — grid is now at least reachable via the new toggle |
| History uses full-doc snapshots | `lib/engine/history.ts` | Fine for small decks; watch memory on very large/long-edited decks |
| Legacy `lib/store.ts` + `lib/types.ts` still exist solely as a one-way "Import legacy" bridge (`legacyToEngineDoc`) | `app/page.tsx` hamburger menu → "Open" | Keep until confident no one still has old `mighty-slides:doc:v1` data worth importing, then delete both plus the adapter |
| Rate limiter trusts client-supplied `x-forwarded-for` unconditionally | `lib/rateLimit.ts` | Spoofable unless the host's edge/proxy overwrites this header before it reaches Next.js. Verify on Hostinger; if untrusted, derive the key from a source the platform actually controls |
| Zero component/interaction tests | `components/Canvas/Transformer.tsx`, `CanvasEditor.tsx`, `PropertiesPanel/*`, `AIImageTools.tsx` | All 69 existing tests hit `lib/engine/*` pure logic only. `@testing-library/react` + `happy-dom` are already configured (`vitest.config.ts`) — just unused for components |

---

## Suggested order of attack

1. **Component test coverage for `Transformer.tsx`** — highest complexity, zero tests, exactly where the last real bug was found (`AIImageTools` adjustment desync was in an equally untested file).
2. **Rotated-resize snap** — do this alongside its tests, not before them.
3. **Bound text clipping** — small, contained, copy the frame-clipping pattern.
4. **Decide the legacy bridge's retirement date** — once decided, delete `lib/store.ts`, `lib/types.ts`, `lib/render.ts`, `lib/clipboard.ts`, `lib/svgImport.ts`, `lib/migrate.ts` in one pass if nothing else depends on them.
5. **Rate limiter key hardening** — quick to verify, cheap to fix if needed, protects real API budget.

---

## Out of scope (permanent, not just deferred — consistent with Local-First)

- Live collaboration (Firebase, WebSocket, CRDTs)
- Cloud workspace / cross-device sync / accounts
- Mermaid → diagram, math/LaTeX, embeds (YouTube/iframe), laser pointer
- Localization beyond Thai/English

---

## Architecture reference

```
app/
  page.tsx                  Main editor (toolbar, hotkeys, autosave, export menu, stats/search modals)
  present/page.tsx          Presentation mode
  api/
    chat/route.ts           Anthropic tool-use (legacy 1280x720 coordinate space; scaled by lib/engine/chat.ts)
    generate/route.ts       Gemini proxy
    removebg/route.ts       WaveSpeed background removal
    stock/route.ts          Unsplash + Pexels
    health/route.ts         Health check
components/
  Canvas/                   React layer: CanvasRoot (viewport), CanvasEditor (gestures),
                             Transformer (resize/rotate/bind), PropertiesPanel/*, SlideRail,
                             TextOverlay, CropOverlay, BindingIndicators, PresetPanel
  AI/AIPanel.tsx            Unified AI entry point (Generate / Stock / Tools tabs)
  AIImageTools.tsx          Vision AI + color adjustments + bg removal (operates on selected ImageElement)
lib/
  engine/                   Pure model + math (no React): types, factory, store (zustand),
                             binding.ts (arrow bindings), snap.ts, history.ts, persist.ts,
                             chat.ts (AI mutation adapter), exportPPTX.ts / exportPNG.ts
  renderer/canvas.ts        Canvas2D scene renderer (single source of truth for editor + thumbnails + export)
  color/adjustments.ts      12-param pixel-level color pipeline
  vision/visionEngine.ts    Local Florence-2 (caption/OCR/detect), 100% client-side
  store.ts, types.ts        Legacy pre-engine store — only used as the "Import legacy" bridge
```

### Key types

| Type | File |
|---|---|
| `EngineDoc` | `lib/engine/types.ts` — title, width, height, slides[], `snapGrid` |
| `EngineElement` | same — discriminated union: rect, ellipse, diamond, triangle, star, hexagon, heart, plus, line, arrow, freedraw, text, image, frame |
| `ArrowElement.startBinding` / `endBinding` | `{ elementId, gap, focus } \| null` |
| `TextElement.containerId` | non-null when bound to a shape |
| `ImageElement.crop` / `.adjustments` | crop rect + color adjustments, both persisted per-element |

### Coordinate system

- Slide is fixed **1920×1080**. World = slide-local, top-left origin, +x right, +y down.
- Element bbox is axis-aligned before rotation; `angle` is radians around the bbox center.
- The AI chat tool schema still speaks 1280×720 (legacy) — `lib/engine/chat.ts` scales by 1.5× in both axes when applying mutations to the engine.
