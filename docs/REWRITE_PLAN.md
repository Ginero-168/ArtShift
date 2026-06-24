# Excalidraw-Style Canvas Rewrite — Roadmap

> Source-of-truth roadmap for rewriting the canvas engine from scratch.
> Replaces `@excalidraw/excalidraw` + `react-konva` with our own Canvas2D engine.
> Scope agreed: Tier 1 + Tier 2 + Tier 3. Google Slides export = path A (PPTX) for v1, path B (Slides API) deferred to Phase 5.

---

## Workspace constraints

- Fixed slide size **1920×1080 px** (logical). Currently codebase uses 1280×720; will migrate.
- Bounded canvas (NOT infinite like Excalidraw). Pan limited to viewport-around-slide.
- Multi-slide deck workflow stays (already exists in store).
- Theme: light/dark.

## Engine choice

- Pure **Canvas2D** (drop both Konva and Excalidraw).
- Manual scene graph + dirty-rect partial redraw.
- HTML overlay layer for textarea (text edit), transformer handles, marquee.
- DPR-aware (retina sharpness).

---

## Phases

### Phase 1 — Foundation & Tier 1 MVP (week 1-2)

Goal: working canvas drop-in replacement for Excalidraw + Konva on the editor page.

- [ ] Install deps: `roughjs`, `perfect-freehand`, remove `@excalidraw/excalidraw`, `konva`, `react-konva`, `use-image`
- [ ] `lib/engine/types.ts` — Element discriminated union (rect, ellipse, diamond, line, arrow, freedraw, text, image)
- [ ] `lib/engine/rough.ts` — seeded roughjs wrapper (deterministic per-element seed)
- [ ] `lib/engine/freehand.ts` — perfect-freehand wrapper (pressure stub)
- [ ] `lib/engine/hitTest.ts` — point-in-element + bbox + transformed coords
- [ ] `lib/engine/bounds.ts` — multi-element bbox, transform math
- [ ] `lib/engine/history.ts` — undo/redo (replace store version)
- [ ] `lib/renderer/canvas.ts` — Canvas2D scene renderer (rect/ellipse/diamond first)
- [ ] `lib/renderer/sceneCache.ts` — element-level memoization
- [ ] `components/Canvas/CanvasRoot.tsx` — viewport, pan/zoom-in-bounds
- [ ] `components/Canvas/Overlay.tsx` — selection rect, transformer handles, marquee
- [ ] `components/Canvas/TextEditor.tsx` — DOM textarea overlay for inline text
- [ ] Tools: select, rect, ellipse, diamond, line, arrow, freedraw, text, image-paste
- [ ] Transform: move, resize (8 handles), rotate (with 15° snap)
- [ ] Color, opacity, stroke width
- [ ] Multi-select via Shift+click and marquee
- [ ] Migrate `SLIDE_W/H` from 1280×720 → 1920×1080
- [ ] Update `lib/render.ts` thumbnail renderer to draw new elements
- [ ] Replace `Editor.tsx` to use new Canvas (delete `ExcalidrawWorkspace.tsx`)
- [ ] Remove vendored `excalidraw/` folder
- [ ] Update `tsconfig.json` and `biome.json` excludes

### Phase 2 — Tier 2 standard editor (week 3-4) ✅ COMPLETE

- [x] Stroke style: solid / dashed / dotted
- [x] Fill style: hachure / cross-hatch / solid / zigzag (roughjs supports)
- [x] Edge style: sharp / round (rect corner radius)
- [x] Sloppiness levels (roughjs `roughness` param)
- [x] Arrow heads: arrow / triangle / dot / bar / diamond / circle
- [x] Layer order: bring front / back / forward / backward
- [x] Align: left / center / right / top / middle / bottom
- [x] Distribute: horizontal / vertical
- [x] Group / ungroup
- [x] Lock / unlock
- [x] Flip H / V
- [x] Duplicate (Cmd-D)
- [x] Eraser tool
- [x] Copy / paste / cut (extend existing clipboard)
- [x] Full keyboard shortcut set (matching Excalidraw + slide editor extras)
- [x] Right-side properties panel
- [x] Context menu (right-click)

### Phase 3 — Tier 3 advanced (week 5-6)

- [ ] **Arrow binding**: arrow endpoints attach to shapes; auto-route on shape move
- [ ] Bound text: text inside container element
- [ ] Smart guides: object snap on align/edge/center
- [ ] Grid snap (toggle)
- [ ] Image cropping (handles inside image)
- [ ] Library panel: save/load element groups
- [ ] Frames / sections: group container with title
- [ ] Stats panel
- [ ] Search (Cmd-F across slide)

### Phase 4 — Polish & Thai support (week 6-7)

- [ ] Thai font picker (reuse `lib/fonts.ts` — 15 Thai fonts in our family)
- [ ] Per-element font family (drop Excalidraw's font system entirely)
- [ ] AI tool-use mapping to new element types (`add_rect`, `add_ellipse`, ...)
- [ ] Templates ported to new types
- [ ] Export PNG/PDF still works
- [ ] Export PPTX with rough-stroke fidelity (path data → PPTX freeform shapes)
- [ ] **Google Slides via PPTX import** (path A) — instructions in UI

### Phase 5 — Google Slides API direct (optional, week 7+)

- [ ] Google Cloud project setup, OAuth client ID
- [ ] `lib/io/googleSlides.ts` — Slides API mapping (presentations.create + batchUpdate)
- [ ] OAuth flow component
- [ ] Element-type → Slides API page-element mapping (rect/ellipse/text/image work; rough strokes get rasterized as image)

---

## Out of scope (deferred indefinitely)

- Live collaboration (Firebase, WebSocket)
- Mermaid → diagram
- Math equations (LaTeX)
- Embed (YouTube, iframe)
- Laser pointer
- Localization beyond Thai/English
- Cloud workspace / sync

---

## Progress log

| Date | Phase | Done |
|---|---|---|
| 2026-05-06 | Plan | Roadmap committed; Tier 1+2+3 + Slides path A confirmed |
| 2026-05-06 | P1 D1 | Deps installed; engine scaffold + types created |
| 2026-05-06 | P1 D2-3 | bounds/hitTest/history + Canvas2D renderer + CanvasRoot viewport (DPR, fit, zoom-cursor, space-pan) |
| 2026-05-06 | P1 D4 | engine store (zustand), factory, CanvasEditor (select/move + rect/ellipse/diamond/line/arrow/freedraw drag), /sandbox route, hotkeys V/R/O/D/L/A/P + ⌘Z/⌘⇧Z + Del |
| 2026-05-06 | P1 D5 | Marquee selection, Transformer (8 resize handles + rotate, shift=AR/15° snap), inline Text tool (contenteditable overlay), CanvasRoot exposes view + worldToScreen |
| 2026-05-06 | P1 D6 | Image paste/drop (cache + factory), snap-to-edges with orange guides, PropertiesPanel (color/stroke/fill style/roughness/opacity/font/layer/delete) |
| 2026-05-06 | P1 D7 | serialize/deserialize (with image side-table), legacy→engine adapter (1280→1920 1.5×, deg→rad, triangle→diamond), sandbox: Import-legacy button + window.__engine debug, /sandbox workflow |
| 2026-05-06 | P1 D8 | /editor-v2 full editor (SlideRail thumbnails + CanvasEditor + title), localStorage persist (engine:v1) with auto-debounce save and legacy auto-migration on first load |
| 2026-05-06 | P2 D1 | Fixed Tier 1 blockers: textarea-based TextOverlay typing/focus, line/arrow endpoint transformer handles; added arrowhead controls + multi-select align controls |
| 2026-05-06 | P2 D1+ | Added distribute horizontal/vertical controls, lock/unlock controls, and locked-element semantics (selectable for unlock, not movable/resizable) |
| 2026-05-06 | P2 D1++ | Added: hand tool with grab cursor; eraser tool (click + drag-erase); group/ungroup with Ctrl+G; copy/paste with Ctrl+C/V; duplicate with Ctrl+D; arrow-key nudge (1px / 10px Shift); PNG export of current slide; slide background color picker; multi-element AABB scale handles; tool-specific cursors (text/crosshair/cell/grab); tighter snap guides spanning only moving + target rects |
| 2026-05-06 | P2 D1+++ | Added: select-all (Ctrl+A); cut (Ctrl+X); z-order one-step + shortcuts (`]`/`[` forward/back, `⌘]`/`⌘[` to-front/back) + `bringForward`/`sendBackward` actions; SlideRail drag-to-reorder with drop indicator + `reorderSlides` action; snap-on-resize for both single (axis-aligned) and multi-select scale via new `snapResize` (only moving edges as candidates) wired through Transformer→CanvasEditor guides |
| 2026-05-06 | **P2 ✅** | **Phase 2 complete.** Added: flip H/V (mirror around selection AABB, points + angle handled per type) with `⇧H`/`⇧V` hotkeys + Properties UI; Edge style sharp/round toggle for rect (cornerRadius 0↔16); right-click context menu (`ContextMenu.tsx`) with cut/copy/paste/duplicate/z-order/flip/group/delete/select-all wired to current selection; `HANDOVER.md` written |
