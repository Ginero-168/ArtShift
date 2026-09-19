# Remove Block/Free (hex) layout — impact inventory

**Status:** inventory only. This document does not change runtime behavior.

**This PR does not remove Block/Free code.** `hexLayout`, `LayerMode`, UI B/F toggles, store APIs, migrations, and tests stay exactly as they are on `main`. Later PRs (described below, not started here) will do the actual work.

---

## 1. Purpose

Inventory the Block/Free **layout mode** system (hex grid, `LayerMode`, placements, workspace strictness, reflow) **before any removal work**.

This is a blast-radius map so later PRs can migrate saved documents, then peel UI, then delete the engine — without accidentally deleting product features that only share the word “block.”

---

## 2. Baseline

| Item | Value |
|------|--------|
| Repo | https://github.com/Ginero-168/ArtShift |
| Branch this doc lives on | `cursor/remove-block-free-layout-0583` |
| **`main` HEAD SHA** | `048d9fd5219006653269f738e26fc890adbaa33b` |
| **Safety tag** | `pre-remove-bf-048d9fd` |
| Tag message | `Safety tag before Block/Free removal work` |
| Engine schema at baseline | `ENGINE_SCHEMA_VERSION = 5` (`lib/engine/types.ts`) |
| Moodboard | **Out of scope.** Do not touch `cursor/moodboard-mvp-01b4` / PR #9. |

Verify the tag still points at the baseline:

```bash
git rev-parse pre-remove-bf-048d9fd^{}
# expected: 048d9fd5219006653269f738e26fc890adbaa33b
```

---

## 3. What “Block/Free” means here

Two different product ideas share the word **Block**. Only the first is a removal target.

| Concept | Meaning | Fate |
|---------|---------|------|
| **Block / Free layout mode** | Per-object / per-layer placement: hex-grid occupancy (`"block"`) vs freeform pixels (`"free"`). UI badges **B** / **F**. | **Remove** (later PRs) |
| **Block library recipes** | Catalog of insertable kinds (`heading`, frames, shapes, badges) in `BlockLibrary` / `BUILDER_BLOCKS`. | **Keep** |
| **Frames / groups / moodboard** | Frame masks (including a hexagon *shape*), selection groups, Moodboard Pinterest work. | **Keep** |

Today the two “block” ideas are coupled: `createBuilderBlock()` sizes recipes with `hexLayout` spans (`colSpan` / `rowSpan`). Removal must **decouple sizing**, not delete the catalog.

---

## 4. Full blast radius

### 4.1 Core engine files

| File | Role |
|------|------|
| `lib/engine/hexLayout.ts` | Canonical hex grid (~288 cells, adaptive columns × rows). Placement ↔ pixel rect, overlap, `reflowBlockItems`. |
| `lib/engine/layers.ts` | Layer containers, `convertLayerMode`, `setObjectLayoutMode`, `reflowBlockObjects`, `commitBlockObject`, `setBlockPlacement`, `remapBlockLayersToArtwork`, schema v1–v5 migrations. |
| `lib/engine/types.ts` | `LayerMode`, `BlockPlacement`, `BentoBlock`, `EngineLayer.mode` / `placements`, doc `workspaceStrictness*`. |
| `lib/engine/store.ts` | Zustand hub: `commitBlockLayout`, `updateBlockPlacement`, `setLayerMode`, `toggleObjectLayoutMode`, `setObjectLayoutMode`, `setWorkspaceStrictness`, `showHexGrid`, `layerFilter`, `growBlockTextPlacements`. |
| `lib/engine/resizeArtwork.ts` | Every artwork resize remaps block placements then reflows. |
| `lib/engine/serialize.ts` | `fromJSON` always runs `normalizeDocumentLayers`. Persists placements, `layoutMode`, legacy `bento`, strictness. |
| `lib/engine/editorController.ts` | Forwards `commitBlockLayout` to the store. |

**Direct `hexLayout` import graph**

```
hexLayout.ts
  ← lib/engine/layers.ts          (primary consumer)
  ← lib/engine/store.ts           (blockRectForPlacement, getHexGridDimensions)
  ← lib/builder/blocks.ts         (createBuilderBlock default size)
  ← components/Builder/BuilderInspector.tsx
  ← components/Canvas/CanvasRoot.tsx
  ← tests/hexLayout.test.ts
  ← tests/layout.test.ts
  ← tests/strictness.test.ts
  ← tests/engineStore.test.ts
```

### 4.2 Types and persisted APIs

From `lib/engine/types.ts` at baseline:

```ts
export type LayerMode = "block" | "free";

export type BlockPlacement = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  minColSpan?: number;
  minRowSpan?: number;
  kind?: string;
};

/** @deprecated Legacy name retained only while schema-v1 documents migrate. */
export type BentoBlock = BlockPlacement;
```

| Location | Fields |
|----------|--------|
| `BaseElement` | `layoutMode?: LayerMode`; deprecated `bento?: BentoBlock` |
| `EngineLayer` | `mode: LayerMode`; `placements: Record<ElementId, BlockPlacement>` (empty on Free layers) |
| `EngineDoc` | `workspaceStrictness`; `strictnessLevel?: 1 \| 2 \| 3`; `strictnessValues?: { 2: number; 3: number }`; `schemaVersion` |

**Store / layer-model methods (do not delete in this PR)**

| API | File |
|-----|------|
| `createEngineLayer(mode, options?)` | `layers.ts` |
| `normalizeDocumentLayers` / `normalizeSlideLayers` | `layers.ts` |
| `isObjectBlock` | `layers.ts` |
| `toggleObjectLayoutMode` / `setObjectLayoutMode` | `layers.ts` + `store.ts` |
| `convertLayerMode` | `layers.ts` (store `setLayerMode`) |
| `reflowBlockObjects` / `commitBlockObject` / `setBlockPlacement` | `layers.ts` |
| `remapBlockLayersToArtwork` | `layers.ts` → `resizeArtwork.ts` |
| `addObjectToLayer` / `moveObjectsToLayer` | `layers.ts` (block path writes placements + reflow) |
| `commitBlockLayout` / `updateBlockPlacement` | `store.ts` |
| `addLayer` / `setLayerMode` | `store.ts` — **no TSX callers**; tests use `setLayerMode` |
| `setWorkspaceStrictness` / `setStrictnessValue` | `store.ts` |
| `setShowHexGrid` / `setLayerFilter` | `store.ts` |

`hexLayout.ts` public surface: `HEX_COLUMNS` (24), `HEX_ROWS` (12), `HEX_TARGET_CELLS`, `REFERENCE_HEX_GRID`, `getHexGridDimensions`, `getHexMetrics`, `getHexCell`, `getAllHexCells`, `normalizeBlockPlacement`, `remapBlockPlacement`, `cellsForPlacement`, `blockRectForPlacement`, `blockPlacementForRect`, `placementOverlapCells`, `placementsFit`, `reflowBlockItems`.

### 4.3 UI surfaces

| Surface | What the user sees | File |
|---------|--------------------|------|
| Layer panel B / F badge | Per-object toggle via `toggleObjectLayoutMode` | `components/Builder/LayerPanel.tsx` |
| Inspector | `BLOCK` / `FREE` chip; workspace strictness 1–3; **Hex placement** Col/Row/W/H; text presets `blockManaged` | `components/Builder/BuilderInspector.tsx` |
| Canvas hex overlay | Occupied / selected hex cells when `showHexGrid` | `components/Canvas/CanvasRoot.tsx` |
| Editor toolbar | Hex grid toggle; **All / Block / Free** viewport filter | `app/projects/[projectId]/editor/page.tsx` |
| Canvas editor | Filters elements by `layerFilter` + `isObjectBlock`; move-end `commitBlockLayout` | `components/Canvas/CanvasEditor.tsx` |
| Transformer | Transform commit → `commitBlockLayout` if layer mode is block | `components/Canvas/Transformer.tsx` |
| Resize artwork | `setSlideDimensions` / variants → remap + reflow | `components/Builder/ResizeArtworkAction.tsx` (via store) |
| Template browser | Copy mentions “Free layer” for append | `components/Builder/TemplateBrowser.tsx` |
| CSS | `.modeBadgeButton[data-mode]`, `.objectLayerCard[data-mode=free]`, unused `.gridLayerMode` / `.activeLayerBanner` | `components/Builder/Builder.module.css` |

### 4.4 Tests that encode Block/Free behavior

| File | What it locks in |
|------|------------------|
| `tests/hexLayout.test.ts` | Grid dimensions, rect ↔ placement, remap, overlap, `reflowBlockItems` |
| `tests/layout.test.ts` | `convertLayerMode`, collective reflow, schema v1 `bento` → layers, v2 adaptive grid |
| `tests/objectLayers.test.ts` | 1:1 object/layer, `toggleObjectLayoutMode`, mode preserved on reorder |
| `tests/collectiveBlockLayout.test.ts` | `reflowBlockObjects` across separate block object-layers |
| `tests/strictness.test.ts` | Strictness levels, `placementOverlapCells` / `placementsFit`, serialize |
| `tests/engineStore.test.ts` | `setLayerMode`, hex toggle, layer filter, resize remap, default “Block layer 1” naming |
| `tests/mediaLayout.test.ts` | Builder blocks + block-layer reflow preserve media aspect |
| `tests/frameMask.test.ts` | Frames via `createBuilderBlock` (hex-derived size only) |
| `tests/builderLibrary.test.ts` / `tests/iconBlock.test.ts` | Recipe geometry from hex spans |

Keep (not layout-mode tests): `tests/blockLibraryDefaultTab.test.ts`, `tests/smartLayout.test.ts` (pixel Smart Arrange), `tests/autoLayout603010.test.ts` (AI 60/30/10, no hex).

### 4.5 Data migrations already in the load path

`normalizeDocumentLayers` (`layers.ts`) + `fromJSON` (`serialize.ts`):

| Trigger | Behavior |
|---------|----------|
| `schemaVersion < 2` | Expand legacy `element.bento` col spans (12-col → 24-col) |
| `schemaVersion < 3` | `remapBlockPlacement(REFERENCE_HEX_GRID → targetGrid)` |
| `schemaVersion < 4` | Media geometry + optional reflow |
| Missing `slide.layers` | `migrateObjectOwnedPlacement` groups by `layoutMode` / `bento` |
| After normalize | `stripLegacyPlacement` removes `bento` from elements; live source of truth is `EngineLayer.placements[id]` |

Current schema is **v5**. A later removal PR should introduce **v6** (or next version) that bakes Block → Free geometry. **Not implemented here.**

### 4.6 Cross-cutting consumers

| Area | Depends on hex / LayerMode? | How |
|------|----------------------------|-----|
| **AI `applyAiPlan`** | **Yes (gate)** | `insert_text` / `insert_shape` require `layer.mode === "free"`. After removal, this gate becomes “any unlocked layer.” |
| **Design agent context** | **Label only** | `lib/designAgent/client.ts` sends `layer.mode` in the prompt payload. |
| **Co-pilot / 60-30-10 / turn orchestrator** | **No hex** | Absolute pixel zones; patches go through `applyElementPatches`, which *does* grow block text / constrain media if the target is still a block layer. |
| **Smart Arrange** (`smartLayout.ts`) | **No hex** | Pixel patches from semantics. Tests use `createEngineLayer("free")` / `insertCompositionBlock`. |
| **Resize / artwork variants** | **Yes** | `resizeArtworkSlide` always `remapBlockLayersToArtwork` + `reflowBlockObjects`. |
| **Paste / duplicate** | **Indirect** | Preserves `layoutMode`. Paste `addObjectToLayer` writes a placement + reflow if the target layer is block. |
| **Library drop** | **Yes (sizing)** | `createBuilderBlock` / `usePasteDrop` derive the initial box from hex recipe spans; the element then inherits the **active layer** mode. |
| **Composition blocks** | **Minimal** | Fractional rects; image slots set `layoutMode = "free"` only (`compositionBlocks.ts`). |
| **Templates** | **Mode label** | `applyTemplateToSlide` creates a `"free"` layer; objects are absolute. |
| **Campaign generator** / **legacy adapter** | **Free-only** | Always `createEngineLayer("free", …)`. |
| **Transform / drag** | **Yes** | Block layers snap back via `commitBlockLayout`. |
| **Text** | **Yes** | `growBlockTextPlacements`; `textPresetPatch(..., blockManaged)` skips auto height. |
| **Media** | **Yes** | Block-layer media patches constrained to `blockRectForPlacement`. |
| **PPTX export** | **Validation** | `pptxPayload.ts` requires `layer.mode` to be `"block"` or `"free"`. |
| **vectorPath clone** | **Copy field** | Copies `element.layoutMode`. |
| **Variant content sync** | **No placement sync** | Geometry/placements stay per-variant. |

---

## 5. Data migration plan sketch (later — not this PR)

### 5.1 Dual representation today

| Mode | Source of truth | Cached on the element |
|------|-----------------|------------------------|
| **Free** | `x, y, width, height, angle, …` | Same |
| **Block** | `EngineLayer.placements[id]` (`col, row, colSpan, rowSpan, min*`) | `x,y,width,height` written by `reflowBlockObjects` / `blockRectForPlacement` |
| **Legacy disk** | `element.bento` | Migrated on load to layer placements + `layoutMode` |

Per-element `layoutMode` currently **duplicates** layer `mode` in the 1-object-per-layer UI model.

`convertLayerMode(..., "free")` already drops placements and leaves the last reflowed pixel box on the element. That is the closest in-repo preview of “bake Block → Free.”

### 5.2 Proposed schema v6 (sketch only)

1. **On load (one-time):** For every object on a block layer (or `layoutMode === "block"`), compute the final box with `blockRectForPlacement(placement, slide.width, slide.height)` and existing media/text fit rules. Write `x, y, width, height`.
2. **Flatten modes:** Set every `EngineLayer.mode` to `"free"`. Clear `placements`. Keep layers as visibility / lock / z-order containers.
3. **Strip after a migration window:** `layoutMode`, `bento`, `workspaceStrictness*`.
4. **Builder recipes:** Replace hex span math in `createBuilderBlock` with fixed pixel or % of artwork rects. Keep `builderKind` / catalog labels.
5. **Re-save** at the new `schemaVersion`. Older v1–v5 loaders stay until the window closes.

**Risks to test later:** documents that relied on collision reflow or strictness overlap will keep *last baked* geometry, not live reflow. Need golden fixtures of real block documents before and after migrate.

---

## 6. Proposed phased PRs (describe only — none started)

### P0 — Migrate runtime (must ship first)

- Add schema migration: bake Block placements → Free pixel geometry on load.
- Stop calling `reflowBlockObjects` from hot paths once placements are gone (`addObjectToLayer`, `applyElementPatches`, strictness changes, resize).
- Decouple `createBuilderBlock` from `hexLayout` (pixel defaults).
- `resizeArtworkSlide`: scale elements only; drop `remapBlockLayersToArtwork`.
- Relax AI insert gate (`applyAiPlan`) from “Free layer required” to “unlocked layer.”
- Keep `EngineLayer` for z-order / visibility; ignore or drop persisted `mode` + `placements`.

### P1 — Remove UI

- Layer panel B/F, inspector strictness + hex placement + BLOCK/FREE chip.
- Editor hex grid toggle + All/Block/Free filter; `showHexGrid` / `layerFilter` state.
- Store methods become unused: `updateBlockPlacement`, `commitBlockLayout`, `toggleObjectLayoutMode`, `setObjectLayoutMode`, `setLayerMode`, strictness setters.
- Simplify `CanvasEditor` / `Transformer` (no post-move `commitBlockLayout`).
- CSS cleanup for mode badges / hex overlay.

### P2 — Remove engine

- Delete `lib/engine/hexLayout.ts` and all imports.
- Strip block branches from `layers.ts` (`convertLayerMode`, `reflowBlockObjects`, `commitBlockObject`, `setBlockPlacement`, `remapBlockLayersToArtwork`, `bento` / adaptive-grid migration once v6+ is universal).
- Remove types: `LayerMode`, `BlockPlacement`, `BentoBlock`, strictness fields.
- Delete / rewrite tests listed in §4.4.
- Update `pptxPayload` layer validation if `mode` is gone.

**Do not merge P1/P2 before P0 is in the wild long enough that saved docs have been rewritten.**

---

## 7. Explicit non-goals (what stays)

Do **not** remove or “migrate away” these as part of Block/Free layout removal:

| Keep | Why |
|------|-----|
| `components/Builder/BlockLibrary.tsx` | Recipe catalog UI |
| `lib/builder/blocks.ts` `BUILDER_BLOCKS` / `BuilderBlockKind` / `createBuilderBlock` | Recipe catalog (only replace hex *sizing*) |
| `lib/builder/compositionBlocks.ts` | Multi-slot composition recipes |
| `components/Builder/BlockIcon.tsx` | Icons for library kinds |
| Frames (`frameMask.ts`, `frameCircle`, `frameHexagon` *shape*, …) | Mask geometry, not the hex *grid* |
| Groups (`selectionGroups.ts`, layer hierarchy) | Tree / selection, no `layoutMode` |
| Moodboard / Pinterest (`cursor/moodboard-mvp-01b4`, PR #9) | Separate product surface |
| Smart Arrange, 60/30/10, Co-pilot | Pixel layout; keep, just stop feeding them block reflow |
| Layers as visibility / lock / z-order | Organizational layers stay |
| This inventory PR / safety tag | Rollback baseline |

---

## 8. Rollback to the safety tag

The annotated tag `pre-remove-bf-048d9fd` is on `origin` and points at `main` at the moment this inventory started.

**Inspect**

```bash
git fetch origin tag pre-remove-bf-048d9fd
git rev-parse pre-remove-bf-048d9fd^{}
# 048d9fd5219006653269f738e26fc890adbaa33b
```

**If a later removal branch is wrong and has not been merged**

```bash
git checkout cursor/remove-block-free-layout-0583   # or the removal branch
git reset --hard pre-remove-bf-048d9fd
# or abandon the branch and start again from the tag
```

**If a later removal PR was merged to `main` and must be undone**

```bash
# Preferred: revert the merge commit(s) on a new branch, PR into main.
# Emergency only (coordinate; do not force-push main from an agent):
#   git checkout main
#   git reset --hard pre-remove-bf-048d9fd
```

This inventory PR itself is documentation-only. Reverting it does not restore engine behavior (nothing engine-related changed).

---

## 9. Checklist before coding removal

- [x] Note exact `main` HEAD SHA (`048d9fd5219006653269f738e26fc890adbaa33b`).
- [x] Push annotated tag `pre-remove-bf-048d9fd` on that SHA.
- [x] Open inventory-only draft PR (this document). **No Block/Free code removed.**
- [ ] Confirm nobody is mid-flight on Moodboard PR #9 with shared layer files (do not merge moodboard into a removal branch).
- [ ] Export / snapshot a handful of real projects that still use Block mode (placements + strictness > 1).
- [ ] Write failing-or-golden tests for “v5 block doc → v6 free geometry” *before* deleting `hexLayout`.
- [ ] Decide pixel defaults for each `BUILDER_BLOCKS` kind to replace `colSpan` / `rowSpan`.
- [ ] Plan AI insert: drop the Free-layer requirement in the same PR that flattens modes (P0).
- [ ] Plan PPTX validator + design-agent `layer.mode` field in P0 or P2.
- [ ] Do **not** delete `hexLayout.ts`, `LayerMode`, UI B/F, or migrate runtime until P0 is an explicit, reviewed PR.
- [ ] Do **not** merge any of this work to `main` until humans approve; this PR stays draft until then.

---

## 10. Executive summary of blast radius

Block/Free is not a single file. It is a **dual geometry model**: hex `BlockPlacement` on the layer plus cached pixels on the element, wired through `layers.ts` + `store.ts` + resize/paste/text/media, surfaced as B/F badges, hex overlay, and All/Block/Free filter.

**Highest coupling:** `hexLayout.ts` ↔ `layers.ts` ↔ `store.ts` ↔ resize ↔ canvas commit. **Highest user-visible risk:** saved documents that only “look right” because reflow/strictness is still live. **Lowest coupling / keep:** Block *library* recipes, frames, groups, moodboard, Smart Arrange pixel math.

Safe order: **tag (done) → inventory (this PR) → P0 bake-to-Free → P1 UI → P2 delete engine.**
