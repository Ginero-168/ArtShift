# Remove Block/Free (hex) layout — impact inventory

**Status:** P0–P2 complete on this branch. Hex Block/Free is no longer a product feature. Schema v6 bakes old Block files to Free pixels. Hex math remains only as `lib/engine/legacyBlockMigrate.ts` (load-only). This PR stays draft — do **not** merge to `main`.

**No wholesale engine deletion in this PR.** Rollback baseline remains tag `pre-remove-bf-048d9fd`.

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

**P0 rollback:** reset this branch to the safety tag (or revert the P0 commits). That restores live Block/hex occupancy. Do not force-push `main`.

```bash
git fetch origin tag pre-remove-bf-048d9fd
git checkout cursor/remove-block-free-layout-0583
git reset --hard pre-remove-bf-048d9fd
```

---

## 9. Checklist before coding removal

- [x] Note exact `main` HEAD SHA (`048d9fd5219006653269f738e26fc890adbaa33b`).
- [x] Push annotated tag `pre-remove-bf-048d9fd` on that SHA.
- [x] Open inventory-only draft PR (this document), then implement P0 on the same branch.
- [x] Schema v6: bake Block placements → Free pixels; strip `placements` / `layoutMode` / layer `mode`.
- [x] Runtime no longer writes Block cells (add/paste/resize/AI/library/composition).
- [x] P1: leftover store APIs, F badge, hex overlay, All/Block/Free filter, and B/F CSS removed.
- [x] Tests: v5 Block fixtures bake to Free; hex-collision / hex unit tests deleted.
- [x] Library recipes use explicit 1920×1080 pixel defaults (`defaultWidth` / `defaultHeight`).
- [x] P2: `hexLayout.ts` renamed to load-only `legacyBlockMigrate.ts`; `LayerMode` / `BlockPlacement` / `BentoBlock` product types deleted.
- [ ] Confirm nobody is mid-flight on Moodboard PR #9 with shared layer files (do not merge moodboard into a removal branch).
- [ ] Export / snapshot a handful of real projects that still use Block mode (placements + strictness > 1).
- [x] Do **not** merge any of this work to `main` until humans approve; this PR stays draft until then.

---

## 10. Executive summary of blast radius

Block/Free is not a single file. It is a **dual geometry model**: hex `BlockPlacement` on the layer plus cached pixels on the element, wired through `layers.ts` + `store.ts` + resize/paste/text/media, surfaced as B/F badges, hex overlay, and All/Block/Free filter.

**Highest coupling:** `hexLayout.ts` ↔ `layers.ts` ↔ `store.ts` ↔ resize ↔ canvas commit. **Highest user-visible risk:** saved documents that only “look right” because reflow/strictness is still live. **Lowest coupling / keep:** Block *library* recipes, frames, groups, moodboard, Smart Arrange pixel math.

Safe order: **tag (done) → inventory (done) → P0 bake-to-Free (done) → P1 UI strip (done) → P2 delete engine (done).**

### P0–P2 shipped on this branch

- `ENGINE_SCHEMA_VERSION = 6`
- `flattenBlockLayoutToFree` at the end of `normalizeDocumentLayers` / `fromJSON` / `loadDoc`
- Store no longer exposes `commitBlockLayout`, `updateBlockPlacement`, `setLayerMode`, layout-mode toggles, `showHexGrid`, `layerFilter`, or strictness setters
- Canvas / Transformer / Layer panel have no Block/Free chrome (no hex overlay, no F badge)
- Resize scales pixels only
- AI insert accepts any unlocked layer
- Library recipes still exist; `createBuilderBlock` sizes from explicit 1920×1080 pixels and inserts as Free
- Hex math lives only in `lib/engine/legacyBlockMigrate.ts` for v1–v5 load; `reflowBlockObjects` is private to that migrate path

### Residual notes (intentionally kept)

- **Block library recipes** (heading, CTA, frames, shapes, badges) and `builderKind`
- **Frames, groups, moodboard, Smart Arrange** — separate features
- **Organizational layers** (visibility / lock / z / objectIds)
- **`legacyBlockMigrate.ts`** — load-only bake of old Block files; not a product engine
- **Deprecated `workspaceStrictness*` fields** on `EngineDoc` — read on load so old files open; not a product API
- **Safety tag `pre-remove-bf-048d9fd`** remains the rollback point
- Moodboard PR #9 is untouched; this PR must not merge to `main` from the agent
