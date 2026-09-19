# Raster Studio — UX Redesign Plan (2026-09-19)

> Goal: feel like a focused photo editor (easy, spacious), not a cramped modal over the design canvas.
> Complements: `docs/plans/raster-studio-smart-object-plan.md` Phase 3 + remove Editor raster mode.
>
> **North-star reference: Affinity Photo** — clean left Tools panel, contextual options bar, spacious pasteboard, calm professional density. ArtShift stays “smart playful,” not chaotic. Photopea is **not** the visual target (busy chrome, stacked panels, noisy density).

## Pain (current)

1. **Boxed viewport** — canvas CSS `maxWidth: min(92vw, 1200px)` + `maxHeight: calc(100vh - 160px)` makes large images feel trapped in a frame; pan/zoom fights the box.
2. **Cramped chrome** — all tools + options in one top header strip; 8px labels, wrap, hard to scan.
3. **Dual mental model** — strokes mutate live `ImageElement` then Save bakes; Cancel must discard carefully; "Unsaved" feels opaque.
4. **Two raster entry paths** — Editor still has Raster/Vector mode + tools while Studio also exists → confusion.
5. **Weak spatial orientation** — no navigator/minimap, no fit-to-view / Actual Size / zoom readout, no checkerboard scale tied to zoom.
6. **Tool discoverability** — Photoshop-like shortcuts exist but UI doesn't teach; Heal/Clone/Alt-source easy to miss.

## Design principles

- **Affinity Photo as north star**: icon-first left rail, one contextual options bar, mid-gray pasteboard, quiet status. Restraint over novelty.
- **One door**: pixel edit only via Raster Studio (Edit Raster / double-click image).
- **Image is the stage**: viewport fills remaining space; chrome docks to edges, not a floating card around the bitmap.
- **Edit → Commit**: Studio session is the working copy; Editor sees one revision on Save. Placement + Appearance stay on the Smart Object.
- **Calm density**: few surfaces, grouped tools, no stacked floating palettes. “Smart playful” = clear affordances and one accent, not Photopea-style clutter.

## Target IA (Affinity-like)

```
┌─ Raster Studio · name · Unsaved ────────────── [Cancel] [Save] ─┐
├─ Context: only the active tool’s knobs ── zoom % · Fit · Actual ─┤
├─ Left tool rail ─┬─ Pasteboard (full-bleed, image floats) ───────┤
│  View / Paint    │  pan · zoom · checkerboard                    │
│  Select / Wand   │                                               │
│  Retouch         │                                               │
└──────────────────┴─ Status: tool hint (quiet) ───────────────────┘
```

## Patterns to borrow

| Pattern | From | Apply |
|---|---|---|
| Left Tools panel, icon-first, grouped | **Affinity Photo** (primary) | View / Paint / Select / Wand / Retouch separators; no wrap; quiet selected state |
| Contextual toolbar | **Affinity Photo** context bar | Only the active tool’s knobs; readable type; not every slider at once |
| Zoom / Fit / Actual Size | **Affinity Photo** View | Readout + Fit + Actual Size; Space pan; Cmd+0 / Cmd+1 |
| Mid-gray pasteboard | **Affinity Photo** | Image sits on an open board — not a boxed card, not a clipped thumbnail |
| Single Save = commit | Smart Object (PS-like contract) | One Editor undo step; placement/Appearance unchanged |
| Double-click to enter | PS Smart Object / Affinity embedded docs | Primary entry; no Editor raster toggle |

**Do not borrow from Photopea as chrome:** rainbow icon walls, stacked floating panels, cramped multi-row tool strips, heavy frames around the bitmap.

## Status inventory (verified 2026-09-19)

What already shipped vs remaining gaps. Pixel tools already live in Studio; Editor raster mode was leftover chrome + dead `CanvasEditor` branches.

| Area | Already in repo | Gap (this wave / later) |
|---|---|---|
| **Shell** | Two-row Affinity chrome: title + Unsaved + Cancel/Save; contextual options bar; zoom % / Fit / Actual Size; quiet status | Confirm-discard on Cancel (UX-4) |
| **Toolbar** | Left icon rail, grouped View / Paint / Select / Wand / Retouch; quiet selected + inset accent | Navigator thumbnail (UX-4) |
| **Viewport** | Full-bleed mid-gray pasteboard; image floats with soft shadow (not a boxed card); wheel zoom; Hand + Space-hold pan; checkerboard | Empty/loading polish (UX-4) |
| **`lib/raster/studio/*`** | Session store, open payload, `commitRasterRevision`, `placementUnchanged`, bake-on-Save flatten; `@jsquash/png` encode + OffscreenCanvas bake with `toDataURL` fallback | Worker-thread `renderElement` preview; `@jsquash/webp` |
| **Bake / commit** | Policy A (`flatten-overlays`): Save writes new `fileId`, clears `rasterMask` / `rasterEdits` / adjustments / blur; placement + Appearance unchanged | Fat `rasterEdits` dataUrls can still sit on **old** documents until the user Saves in Studio; full op side-table (policy C) is not built |
| **Asset side table** | Image binaries already persist as `fileId → dataURL` in IDB (`persist.ts` / `serialize.ts`), not inside EngineDoc | Session overlay PNGs are still on the element until bake; do **not** strip them on load (old projects) |
| **Editor raster mode** | Toggle, pixel tools, and canvas paint/wand/heal/clone paths removed. Entry is double-click / context menu / ObjectContextBar **Edit Raster**. Letter keys no-op while Studio is closed. | — |

**Editor raster mode after this wave:** no Raster/Vector toggle, no pixel tools on the design-canvas chrome, no design-canvas brush/wand/heal/clone gestures. Studio is the only pixel editor.

## Phased delivery

### UX-0 — Plan + status doc (this PR)

- Write this plan under `docs/plans/`
- Status inventory above (also summarized in `ROADMAP.md`)
- Name Affinity Photo as the north-star reference

### UX-1 — Space & chrome (this PR, Affinity-biased)

- Remove boxed maxWidth/maxHeight; image on a spacious mid-gray pasteboard; pan/zoom unconstrained
- Left vertical icon rail with Affinity-like tool groups; quiet selected state
- Title row + contextual options bar (active tool only) + zoom / Fit / Actual Size
- Space hold-to-pan + Hand tool; scroll-wheel zoom toward cursor
- Quiet status line for tool hints (“Alt-click to set clone source”)

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

- Navigator thumbnail (Affinity-style, optional)
- Better empty/loading states
- Optional Adjust tab (brightness/contrast) in Studio only
- Selection anti-alias (types do not store it yet)
- Full clone-stamp blit preview (path + source marker landed; sampled-pixels overlay still simplified)

## Tool quality wave (this PR)

Affinity-like *tool feel*, not new chrome. Audit was of Studio viewport + `mask.ts` / renderer stamps / `retouch.ts` / selection overlay.

| Landed | Deferred |
|---|---|
| Brush/Pencil/Eraser circle cursor (size + hardness ring) | Custom cursors for marquee/lasso |
| Live hardness-aware stroke preview on drag; commit on pointer-up | Worker `renderElement` preview |
| Stamp interpolation shared with renderer; selection mask still clips paint | — |
| Dual-tone marching ants; Shift/Alt/Shift+Alt hint in options; Feather apply | Anti-alias option (no type yet) |
| Wand Contiguous vs global; “Selecting…” on large images | Wand sample-merged visual |
| Clone source marker + offset crosshair; softer stamp edges | Sampled clone blit under cursor |
| Heal OpenCV inpaint + quiet clone-fallback status | Stronger heal-only fallback (non-clone) |
| Cmd/Ctrl+Z uses engine history (unique stroke labels); canvas Delete/copy suppressed while Studio is open | Dedicated Studio history stack |
| Confirm-discard on Cancel restores Open snapshot | — |

## Success criteria

- User never needs Editor Raster mode to retouch
- Opening Studio: image feels large on an open pasteboard; no "picture in a card" trap
- Chrome reads as Affinity-calm (grouped rail, one context bar) — not Photopea-busy
- Save keeps placement/Appearance (existing invariant)
- Toolbar scannable in <1s; primary tools ≤ one click
- Quality gates: lint, typecheck, test, build

## Out of scope / deferred (this wave)

- Photopea/Pintura/Filerobot/Konva as core — rejected
- Full raster layer stack
- Non-destructive op history across sessions (policy C / dedicated overlay side table)
- `@jsquash/webp` bake format (PNG first; WebP can share the encode helper later)
- Worker-thread `renderElement` preview
- Navigator, Adjust tab (UX-4)
- Selection anti-alias; full clone sampled-blit preview
