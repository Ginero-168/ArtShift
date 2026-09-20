# Appearance Phase 0 — Contract

Status: baseline for `lib/appearance/*` (2026-09-16)  
Updated: 2026-09-19 — Appearance persist **schema v7** (this PR) on top of Phase 1 + MVP UI (#12)

## Reality check

- Phase 1 foundation (`lib/appearance/*`) **landed** in the #12 lineage. MVP UI: Appearance panel + Shadow/Glow + Text Arc.
- Engine `ENGINE_SCHEMA_VERSION` is **7**. Canonical `appearance` is persisted on elements and dual-written to legacy flat fields.
- **v6 = Block bake** (unrelated). Appearance persist is **schema v7**. Do not reuse v6.
- Load prefers `appearance` when present and valid; otherwise synthesizes from legacy fields. Save always writes both.

## Persist (schema v7)

- Stored field: `EngineElement.appearance` (`schemaVersion: 1` inside the stack, distinct from engine v7).
- Dual-write on save and Appearance mutations: `shadow`, `glow`, fill (`backgroundColor` / `fillType` / gradients / `fillPattern`), stroke, root `opacity` / `blendMode`.
- Text Arc remains `pathCurvature` on text (not an Appearance item); it continues to be written as a legacy text field.
- v6 → v7 is idempotent: synthesize `appearance` from legacy when missing; if `appearance` is already present, prefer it and refresh legacy from it. Extra stack items that do not fit in a single legacy fill/stroke are kept on `appearance` (no silent drop).
- Runtime: `updateAppearance` / `changeAppearance` write both sides. Legacy `updateElements` patches that touch those flat fields resync the primary Appearance items so PropertiesPanel/AI are not a competing writer.

## Locked MVP slice (Peerawat 2026-09-19)

In scope:

- Appearance panel in the live Builder Inspector
- Shadow + Glow (both allowed)
- Text Arc for text objects via existing `pathCurvature` (no path envelope warp)
- Image tone sliders (`adjustments` / `filterBlur`) as one Appearance UI group for images; not Appearance stack items and not Brand Graphic Styles

Out of scope:

- Multi fill/stroke stacks as a product feature
- Graphic Styles linked to Brand Kit
- Path warp / envelope
- Group Appearance
- Vector/Affinity PDF export rewrite
- Moodboard

## Stack order

- Stored `items[]` is **back-to-front** (index 0 paints first / behind).
- UI lists items **top-to-bottom as front-to-back** (reverse of storage when rendering the panel).
- Text Arc is **not** an Appearance item. It is listed at the top of the panel for text objects and writes `TextElement.pathCurvature`.

## Shadow + Glow (Canvas2D)

- Canvas2D has one `shadow*` state per draw call.
- Legacy renderer was XOR (`shadow` else `glow`) and silently dropped the other.
- Current renderer composites cached element bitmaps with **sequential passes in stored stack order** so both can be visible. Interior pixels of later passes cover earlier interiors; halos remain.
- Do not XOR-clear the other effect when the user enables Shadow or Glow.

## Coordinates

- Fill / Stroke / Effect use the element's local geometry (bbox before rotation).
- Shadow offsets are in slide pixels after the element's local transform.

## Opacity

- Root `appearance.opacity` applies once at final composite.
- Item `opacity` applies only to that Fill / Stroke / Effect.
- Do not multiply legacy field opacity twice when reading through `readAppearance`.

## Visual bounds

- Shadow / glow expand bounds by `blur + abs(offset)` (see `bounds.ts`).
- Stroke center alignment expands by `width / 2`.

## Multi-selection

- Mixed values surface as `mixed: true` on snapshot fields (later UI).
- `updateAppearance` is all-or-none across ids. Operations that need per-element item ids should be functions of the target element (`shadowPatchOperation`, etc.).

## Export policy

- Canvas2D is the fidelity target for this slice.
- SVG / PPTX adapters may drop unsupported effects and must report capability gaps (Phase 6).
