# Raster Studio — UX Redesign Plan (2026-09-19)

> Goal: feel like a focused photo editor (easy, spacious), not a cramped modal over the design canvas.
> Complements: `docs/plans/raster-studio-smart-object-plan.md` Phase 3 + remove Editor raster mode.

## Pain (current)

1. **Boxed viewport** — canvas CSS `maxWidth: min(92vw, 1200px)` + `maxHeight: calc(100vh - 160px)` makes large images feel trapped in a frame; pan/zoom fights the box.
2. **Cramped chrome** — all tools + options in one top header strip; 8px labels, wrap, hard to scan.
3. **Dual mental model** — strokes mutate live `ImageElement` then Save bakes; Cancel must discard carefully; "Unsaved" feels opaque.
4. **Two raster entry paths** — Editor still has Raster/Vector mode + tools while Studio also exists → confusion.
5. **Weak spatial orientation** — no navigator/minimap, no fit-to-view / 100% / zoom readout, no checkerboard scale tied to zoom.
6. **Tool discoverability** — Photoshop-like shortcuts exist but UI doesn't teach; Heal/Clone/Alt-source easy to miss.

## Design principles

- **One door**: pixel edit only via Raster Studio (Edit Raster / double-click image).
- **Image is the stage**: viewport fills remaining space; chrome docks to edges, not a floating card around the bitmap.
- **Edit → Commit**: Studio session is the working copy; Editor sees one revision on Save.
- **Familiar patterns**: Photoshop/Figma hybrid — left tool rail, top contextual options, bottom status/zoom, Esc/Cancel clear.
- **Playful but smart** (ArtShift tone): subtle, not chaotic; clear affordances, few modes.

## Target IA (information architecture)

```
┌─ Title · Smart Object name · Unsaved? ──── [Cancel] [Save] ─┐
├─ Left tool rail (icons) ─┬─ Viewport (full bleed image space) ┤
│  Pan / Brush / Pencil    │  pan·zoom·fit · checkerboard       │
│  Eraser / Select group   │  marching ants overlay             │
│  Wand / Quick / Heal…    │                                    │
├──────────────────────────┴─ Bottom: zoom % · tool hint · tip ─┤
└─ Optional right: brush/selection options when needed ─────────┘
```

## Patterns to borrow (user-loved)

| Pattern | From | Apply |
|---|---|---|
| Left icon rail | PS / Affinity / Figma | Tools always visible, no wrap |
| Contextual options bar | PS Options / Figma | Only active tool's knobs |
| Fit / 100% / zoom HUD | Every photo editor | Space to pan, Cmd+0 fit, Cmd+1 100% |
| Infinite dark/light pasteboard | Photopea / PS | Image floats on pasteboard, not clipped card |
| Single Save = commit | Smart Object | One Editor undo step |
| Double-click to enter | PS Smart Object | Primary entry; remove Editor raster toggle |

## Status inventory (verified 2026-09-19)

What already shipped vs remaining gaps. Pixel tools already live in Studio; Editor raster mode was leftover chrome + dead `CanvasEditor` branches.

| Area | Already in repo | Gap (this wave / later) |
|---|---|---|
| **Shell** | Fullscreen overlay (`RasterStudioShell`), title, Unsaved, Cancel/Save, Escape/Delete, tool letter keys | Chrome was a stacked header card; tools + options shared one wrap strip |
| **Toolbar** | 12 Studio tools in `RasterStudioToolbar` (horizontal chips) | Need left vertical icon rail; labels wrap and fight scan time |
| **Viewport** | Image-space paint / selection / heal / clone; wheel zoom; Hand + middle-mouse pan; checkerboard | CSS `maxWidth`/`maxHeight` boxed the bitmap; no Fit / 100% / readout; Space was sticky Hand |
| **`lib/raster/studio/*`** | Session store, open payload, `commitRasterRevision`, `placementUnchanged`, bake-on-Save flatten | Encode was `canvas.toDataURL`; preview was on-document canvas only |
| **Bake / commit** | Policy A (`flatten-overlays`): Save writes new `fileId`, clears `rasterMask` / `rasterEdits` / adjustments / blur; placement + Appearance unchanged | Fat `rasterEdits` dataUrls can still sit on **old** documents until the user Saves in Studio; full op side-table (policy C) is not built |
| **Asset side table** | Image binaries already persist as `fileId → dataURL` in IDB (`persist.ts` / `serialize.ts`), not inside EngineDoc | Session overlay PNGs are still on the element until bake; do **not** strip them on load (old projects) |
| **Editor raster mode** | Option bar already shows vector tools only; pixel tools redirect to Studio if somehow selected; entry via double-click, context menu, ObjectContextBar | Raster Studio \| Vector toggle still looked like a second door; dead paint/wand/heal branches in `CanvasEditor`; raster letter keys opened Studio |

**Editor raster mode after this wave:** no Raster/Vector toggle, no pixel tools on the design-canvas chrome, no design-canvas brush/wand/heal/clone gestures. Studio is the only pixel editor.

## Phased delivery

### UX-0 — Plan + status doc (this PR)

- Write this plan under `docs/plans/`
- Status inventory above (also summarized in `ROADMAP.md`)

### UX-1 — Space & chrome (this PR)

- Remove boxed maxWidth/maxHeight; image on infinite pasteboard; pan/zoom unconstrained
- Left vertical tool rail; top = Save/Cancel + contextual options only
- Zoom readout + Fit + 100%; Space hold-to-pan + Hand tool; scroll-wheel zoom toward cursor
- Status line: tool tip ("Alt-click to set clone source")

### UX-2 — Phase 3 pipeline (this PR: encode + policy; see deferred)

- `@jsquash/png` encode for bake, with `toDataURL` fallback
- OffscreenCanvas bake surface when available; optional ImageBitmap blit for preview
- Reinforce bake-on-Save clear policy (already in `buildRasterStudioCommitPatch`)
- Keep Smart Object placement invariant tests

### UX-3 — One door (this PR)

- Remove Raster/Vector toggle from `EditorOptionBar`
- Keep entry: context menu + double-click + ObjectContextBar "Edit Raster"
- No-op main-canvas raster letter / brush-size / pixel-delete hotkeys while Studio is closed
- Remove dead `CanvasEditor` brush/wand/heal/clone/selection gesture paths

### UX-4 — Polish (follow-up)

- Navigator thumbnail
- Better empty/loading states
- Confirm discard if dirty on Cancel
- Optional Adjust tab (brightness/contrast) in Studio only

## Success criteria

- User never needs Editor Raster mode to retouch
- Opening Studio: image feels large; no "picture in a card" trap
- Save keeps placement/Appearance (existing invariant)
- Toolbar scannable in <1s; primary tools ≤ one click
- Quality gates: lint, typecheck, test, build

## Out of scope / deferred (this wave)

- Photopea/Pintura/Filerobot/Konva as core — rejected
- Full raster layer stack
- Non-destructive op history across sessions (policy C / dedicated overlay side table)
- `@jsquash/webp` bake format (PNG first; WebP can share the encode helper later)
- Worker-thread `renderElement` preview (renderer still assumes a 2D context + `HTMLImageElement` cache)
- Confirm-discard on Cancel, navigator, Adjust tab (UX-4)
