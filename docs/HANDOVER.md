# Slide Editor Rewrite — Handover

> **Status:** Phase 1 (foundation) and Phase 2 (Tier 2 standard editor) are complete and shipped.
> Phase 3+ (advanced features, polish, exporters) is pending.
>
> **Branch / route:** new editor lives at **`/editor-v2`**. Legacy editor at `/editor` (Excalidraw + Konva) is still mounted as a fallback during migration.

---

## 1. Quick start

```bash
# install
pnpm install        # (or npm install)

# dev (Next.js 15)
pnpm dev
# → http://localhost:3000/editor-v2     ← new engine (this is the main one)
# → http://localhost:3000/editor        ← legacy (kept until parity is locked)
# → http://localhost:3000/sandbox       ← canvas playground for engine debug
```

### Type-check / lint

```bash
npx tsc --noEmit -p tsconfig.json
# Engine + editor-v2 passes clean.
# Only failures live in legacy excalidraw/ and components/ExcalidrawWorkspace.tsx;
# they are scheduled for deletion (see §6.1 below).
```

### Persistence

- Engine doc auto-saves to `localStorage["mighty-slides:engine:v1"]` (debounced 400 ms).
- On first load `/editor-v2` migrates from legacy `mighty-slides:doc:v1` if no engine save exists.
- Manual replace: header → **"Import legacy"** button.

---

## 2. Architecture overview

```
app/editor-v2/page.tsx          ← Next.js page (toolbar + hotkeys + autosave)
components/Canvas/              ← React layer (DOM overlays + canvas host)
   CanvasRoot.tsx               ← viewport: DPR, pan/zoom, hand-tool, space-pan
   CanvasEditor.tsx             ← gestures: select/move/draw/marquee/erase + snap
   Transformer.tsx              ← 8 resize handles + rotate (single + multi AABB)
   PropertiesPanel.tsx          ← right-side inspector (style, layer, group, …)
   ContextMenu.tsx              ← right-click menu
   SlideRail.tsx                ← left rail thumbnails + drag-to-reorder
   TextOverlay.tsx              ← <textarea> overlay for inline text edit
   Marquee.tsx / Guides.tsx     ← passive overlays
   usePasteDrop.ts              ← clipboard image paste + file drop
lib/engine/                     ← pure model + math (no React)
   types.ts                     ← discriminated union: rect, ellipse, diamond,
                                  line, arrow, freedraw, text, image, frame
   factory.ts                   ← createRect/Ellipse/Line/Arrow/Text/Image…
   bounds.ts                    ← elementWorldBBox, unionBBox, localToWorld
   hitTest.ts                   ← pickTopMost, pickInsideRect, hitTestElement
   snap.ts                      ← snapBBox (move) + snapResize (resize)
   history.ts                   ← undo/redo stack (deep-clone snapshots)
   rough.ts                     ← deterministic roughjs wrapper (stable seed)
   freehand.ts                  ← perfect-freehand wrapper
   imageCache.ts                ← decoded HTMLImageElement cache + dataURL
   serialize.ts                 ← doc <-> JSON (with image side-table)
   persist.ts                   ← localStorage I/O
   adapter.ts                   ← legacy SlideDoc → EngineDoc (1.5× scale)
   exportPNG.ts                 ← offscreen-canvas PNG export
   store.ts                     ← Zustand store: doc, selection, tool, history
lib/renderer/canvas.ts          ← Canvas2D scene renderer (slide → ctx)
```

### Key types

| Type | File | Notes |
|---|---|---|
| `EngineDoc` | `lib/engine/types.ts` | top-level: title, width, height, slides[] |
| `EngineSlide` | same | id, name, background, elements[] |
| `EngineElement` | same | discriminated union; `BaseElement` has x/y/w/h/angle/style/z/groupIds/locked |
| `Tool` | `lib/engine/store.ts` | `select \| hand \| rect \| ellipse \| diamond \| line \| arrow \| freedraw \| text \| image \| eraser` |

### Coordinate system

- Slide is **fixed 1920×1080 px** (`SLIDE_W` / `SLIDE_H` in `types.ts`).
- World = slide-local (top-left origin, +x right, +y down).
- Element bbox is **axis-aligned before rotation**; `angle` is in radians around bbox center.
- For `line`/`arrow`/`freedraw`, `points` are **in element-local coords** (origin = `element.x, element.y`).
- `CanvasRoot` owns view (`scale`, `tx`, `ty`); `worldToScreen` / `clientToWorld` cross the boundary.

### Render path (single source of truth)

1. `CanvasEditor` → `<CanvasRoot slide={…} draftElement={draft} … />`.
2. `CanvasRoot.tsx` runs a single rAF loop calling `renderSlide(slide, ctx, …)` from `lib/renderer/canvas.ts`.
3. `SlideRail` thumbs and `exportPNG` use the **same** `renderSlide` call → 100 % visual parity.

### State (Zustand) — `lib/engine/store.ts`

Selectors return references; mutators auto-`pushHistory` before changing `doc`. Major actions:

- selection: `selectOnly`, `toggleSelect`, `clearSelection`, `selectAll`
- elements: `addElement`, `updateElements`, `deleteElements`
- z-order: `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`
- group: `groupElements`, `ungroupElements`
- transform: `flipHorizontal`, `flipVertical`
- clipboard: `copyElements`, `cutElements`, `pasteElements` (in-memory deep clone, fresh ids on paste)
- slides: `addSlide`, `deleteSlide`, `setSlideBackground`, `reorderSlides`, `setCurrentSlide`
- undo/redo: `undo`, `redo` (history is a snapshot stack — see Phase 3 note in §7)

---

## 3. What's done

### Phase 1 — foundation ✅

- Custom Canvas2D engine (no Excalidraw, no Konva, no react-konva at this layer).
- DPR-aware viewport with cursor-anchored zoom and bounded space-pan.
- Tools: select, rect, ellipse, diamond, line, arrow, freedraw, text, image (paste/drop), hand, eraser.
- Move + 8-handle resize + rotate (15° snap with Shift, AR-lock with Shift on corners).
- Marquee selection, Shift+click to add, Shift+marquee additive.
- Snap-to-edges with orange guide overlays (slide edges, centerlines, other elements' edges/centers).
- Inline text editor via `<textarea>` overlay (autosizes to content height).
- Image paste/drop with content-hashed cache.
- Engine-side serialize / deserialize with image side-table.
- Legacy → engine adapter (1280→1920 = 1.5× scale, deg→rad, triangle→diamond).
- `/editor-v2` route with `SlideRail` + auto-save + legacy auto-migration.
- `/sandbox` route for engine debugging (exposes `window.__engine`).

### Phase 2 — Tier 2 standard editor ✅

| Area | Done |
|---|---|
| **Style** | Stroke style (solid/dashed/dotted) · Fill style (hachure/cross-hatch/solid/zigzag/none) · Roughness (clean/normal/rough) · Edge style (sharp/round, rect cornerRadius) · Stroke width · Opacity · Color palette + free picker |
| **Arrows** | Start/end arrowhead pickers (none/arrow/triangle/triangle-outline/dot/bar/diamond/circle) |
| **Layout** | Align L/C/R, T/M/B · Distribute horizontal/vertical (3+ items) |
| **Z-order** | Bring forward / send backward (1 step) · Bring to front / send to back · Hotkeys `]` `[` `⌘]` `⌘[` |
| **Groups** | Group / Ungroup (`⌘G` / `⌘⇧G`); clicking 1 grouped element selects whole group |
| **Lock** | Lock / unlock; locked elements are selectable (so you can unlock) but not movable / resizable |
| **Flip** | Flip H / V mirror around selection AABB; handles `points` + negates `angle`; hotkeys `⇧H` `⇧V` |
| **Clipboard** | Copy / Cut / Paste (`⌘C` / `⌘X` / `⌘V`), Duplicate `⌘D`, in-memory only (no system clipboard yet) |
| **Movement** | Arrow-key nudge (1 px, `⇧` = 10 px); locked elements skipped |
| **Selection** | `⌘A` Select All on current slide |
| **Transformer** | 8-handle scale on multi-select with `Shift` AR-lock, snap-on-resize for both single (axis-aligned) and multi |
| **Snap quality** | Element-pair guides span only the two rects (not full slide) — much cleaner |
| **Slides** | Slide background color picker · drag-to-reorder thumbs in `SlideRail` |
| **Tools** | Hand tool (grab) · Eraser (click + drag) · Tool-specific cursors |
| **Properties Panel** | Right-side inspector with section per concern; falls back to slide-background editor when nothing is selected |
| **Context menu** | Right-click → cut/copy/paste/duplicate/z-order/flip/group/delete/select-all (`ContextMenu.tsx`) |
| **Export** | PNG of current slide at native 1920×1080 |
| **Persistence** | localStorage `engine:v1` autosave + first-load legacy migration |

### Hotkey reference (currently shipped)

| Key | Action |
|---|---|
| `V` | Select tool |
| `H` | Hand tool |
| `R` `O` `D` | Rect / Ellipse / Diamond |
| `L` `A` | Line / Arrow |
| `P` | Freedraw (Pencil) |
| `T` | Text |
| `E` | Eraser |
| `Space` (hold) | Pan |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |
| `⌘C` / `⌘V` / `⌘X` | Copy / Paste / Cut |
| `⌘D` | Duplicate |
| `⌘A` | Select all |
| `⌘G` / `⌘⇧G` | Group / Ungroup |
| `]` / `[` | Forward / Backward (1 step) |
| `⌘]` / `⌘[` | To Front / To Back |
| `⇧H` / `⇧V` | Flip Horizontal / Vertical |
| `←↑↓→` | Nudge 1 px (`⇧` = 10 px) |
| `⌫` | Delete |

---

## 4. What's left — work plan for the next person

### Phase 3 — Tier 3 advanced (high priority)

**3.1 Arrow binding** ⭐ (most-requested feature)

- Goal: an arrow whose endpoint is anchored to a shape; when the shape moves or resizes, the endpoint follows.
- Hooks already exist in the type system (`@/lib/engine/types.ts:99-100`):
  ```ts
  startBinding: { elementId: ElementId; gap: number; focus: number } | null;
  endBinding: { elementId: ElementId; gap: number; focus: number } | null;
  ```
  But they're never read or written today. Plan:
  1. While drawing an arrow, hit-test the endpoint against shapes; if hit, store `{ elementId, gap: 8, focus: 0.5 }` (focus = 0..1 along the entry edge).
  2. Add a `recomputeArrowBindings(slide)` helper called inside `updateElements` and `flip*`/`scaleMulti`/move whenever a bound shape's bbox changes; the arrow's endpoint coords are derived from the shape's bbox + `focus` + `gap` (clamp to nearest edge).
  3. Visual: render a small green circle on the bound endpoint when selected; when dragging an endpoint over a shape, snap and highlight.
- Touch points: `Transformer.tsx` (endpoint drag), `CanvasEditor.tsx` (move drag for shapes), `lib/engine/store.ts` (`updateElements` post-process).

**3.2 Bound text (text inside container)**

- Type already has `containerId` reference shape (look at `TextElement` in `types.ts`).
- Behavior: double-click on a rect/ellipse/diamond → spawn a text element with `containerId = shape.id`; the text auto-centers and re-layouts when the container resizes; deleting the container deletes the text.
- Renderer needs to clip text to container bounds (or shrink font on overflow).

**3.3 Grid snap (toggle)**

- Add `snapGrid: number | null` to `EngineDoc` (e.g. 8 or 16).
- In `CanvasEditor` move and `Transformer` resize, after `snapBBox`/`snapResize`, also round to grid when grid snap is on.
- UI: toolbar toggle button + visual dot grid in `CanvasRoot` background.

**3.4 Image cropping**

- When an image element is selected and the user clicks "Crop", show 4 inner edges + 4 inner corners as crop handles. Store `crop: { x, y, w, h }` in `ImageElement`.
- Renderer needs to use `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` with the 9-arg overload.

**3.5 Smart guides — equal-spacing helpers**

- We already have edge / center / pair guides. Missing: "this element is X px from the next; you're Y px from the next-next — do you want equal?" — Excalidraw highlights both gaps.
- Implementation: while dragging, look for triplets of elements with similar gaps and emit `Guide`s of a new kind `axis: "gap-x" | "gap-y"`.

**3.6 Library panel**

- A right-rail tab where the user saves a multi-element group as a "library item" (just an array of `EngineElement` clones) and pastes it back later.
- Store entries in `localStorage["mighty-slides:library:v1"]` for now. JSON-serializable.

**3.7 Frames / sections**

- `frame` element type already exists in types.ts but the renderer/UX is minimal. Excalidraw-style: a labeled rectangle that becomes a clipping region; children move with the frame.
- Add `frameId` to BaseElement for parenting; clip rendering when frame is collapsed.

**3.8 Stats panel + Search**

- Low priority; minimal version: header button → modal with `slide.elements.length`, total bytes, and a `⌘F` text search across `TextElement.text` that highlights matches.

### Phase 4 — Polish & Thai support

**4.1 Per-element font family + Thai font picker**

- We have 15 Thai fonts in `lib/fonts.ts` (legacy file, still used by `/editor`).
- Today `TextElement.fontFamily` is a free-form CSS string. Plan: a font picker dropdown in `PropertiesPanel`'s Font section, sourced from `lib/fonts.ts`.
- Make sure `@font-face` for the Thai family is loaded in the editor route layout.

**4.2 AI tool-use mapping**

- Legacy editor exposes tool-use endpoints (`add_rect`, `add_ellipse`, `add_text`, …) — see `app/api/...` and `lib/ai/`.
- Need a thin adapter from legacy tool-call args to engine `factory.create*()` so AI completions land directly on the new doc.

**4.3 Templates port**

- Legacy templates live in `lib/templates/`. Run them through `legacyToEngineDoc` (already exists) to get engine-compatible templates, then ship a "New from template" picker.

**4.4 Export PPTX**

- Map elements → PPTX shapes:
  - rect/ellipse/diamond/line/arrow → freeform shape with the same path data
  - rough strokes → rasterize to PNG (use `exportSlideToPNG` per element bbox) and embed as image
  - text → text frame with our font
- Library to use: `pptxgenjs` (zero-dep, MIT, great DX).
- Path-A flow: PPTX export + "open in Google Slides" instruction (file → import).

**4.5 Google Slides via PPTX import (path A)**

- Pure UX: "Export PPTX" + a one-page docs page explaining the upload flow. No OAuth needed.

### Phase 5 — Google Slides API (optional)

- OAuth2 + `lib/io/googleSlides.ts` mapping our elements to `presentations.create` + `batchUpdate`. Defer until path A is shipped and signed off.

---

## 5. Known minor issues / debt

| Symptom | Where | Suggested fix |
|---|---|---|
| Locked elements skip move drag entirely (good) but their bbox is still included in marquee/multi-select AABB. They will be passed to `flipH/V` etc. — actions in store check `!locked` per element, so it's safe but visually the user can include them. | `CanvasEditor.tsx` selection logic | If desired, exclude locked from marquee additions. |
| Multi-select scaling does not preserve rotated children's visual orientation (we scale the AABB and apply pure axial scale to each `x/y/w/h`). | `Transformer.tsx` multi path | Acceptable for now; full fidelity needs a per-element transform matrix. |
| Single-element resize on rotated bbox does **not** snap (only axis-aligned does). | `Transformer.tsx` single path, the `start.angle === 0` guard | Project moving edge into world axes before calling `snapResize`. |
| `EngineElement.edgeStyle` is set in adapter/factory but not directly read by the renderer; only `cornerRadius` matters. The Edges UI in PropertiesPanel sets both at once. | `lib/engine/rough.ts:buildRect` | Either delete `edgeStyle` from types or have rough.ts honor it. |
| The `frame` element type exists but has no UX (no parenting, no clipping). | `lib/renderer/canvas.ts` and `factory.ts` | See Phase 3.7. |
| History uses full-doc snapshots. Memory is fine for small decks but will grow on 100-slide decks with many edits. | `lib/engine/history.ts` | Switch to op-log + replay when measured to be a problem. |
| No unit tests yet — manual smoke is via `/editor-v2` and `/sandbox`. | repo root | Add Vitest for `bounds`/`hitTest`/`snap`/`store`; Playwright for editor flows. |

---

## 6. Migration & cleanup TODOs (track against Phase 1 checklist)

These remain unchecked in `REWRITE_PLAN.md` because they involve removing legacy code and we kept the legacy editor available during dogfooding:

- [ ] Migrate `SLIDE_W/H` from 1280×720 → 1920×1080 in legacy `/editor` (engine already at 1920×1080).
- [ ] Update `lib/render.ts` thumbnail renderer (legacy) to draw new elements — or delete it once `/editor-v2` is the only route.
- [ ] Replace legacy `Editor.tsx` to use new Canvas; delete `components/ExcalidrawWorkspace.tsx`.
- [ ] **Remove the vendored `excalidraw/` folder** (large, only kept for reference).
- [ ] Update `tsconfig.json` and `biome.json` to remove `excalidraw/` from excludes once deleted.

### 6.1 ExcalidrawWorkspace TS error

`components/ExcalidrawWorkspace.tsx:47` is the only TS error in our scope. It will disappear when the file is deleted; no action needed before that.

---

## 7. Where to start (suggested order)

1. **Read this file**, then `docs/REWRITE_PLAN.md`, then poke around `/editor-v2`.
2. Open `lib/engine/store.ts` — every action is one place.
3. Try a small task to warm up: e.g. **3.3 grid snap** is a 1-day feature touching only `store.ts` (config), `CanvasEditor.tsx`/`Transformer.tsx` (post-snap rounding), and `CanvasRoot.tsx` (dot-grid background).
4. Then pick up **3.1 arrow binding** — biggest user-visible win for diagram-style decks.
5. Once Phase 3 essentials are in, focus on **4.4 PPTX export** (this unblocks Google Slides delivery).

## 8. Contacts / context

- Roadmap source of truth: `docs/REWRITE_PLAN.md`.
- Workflow for sandbox testing: `.windsurf/workflows/sandbox.md`.
- Legacy store (still used by `/editor`): `lib/store.ts`.
- New engine store: `lib/engine/store.ts`.

Good luck — the engine is small, well-typed, and easy to extend. 🛠️
