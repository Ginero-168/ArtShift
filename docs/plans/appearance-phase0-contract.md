# Appearance Phase 0 — Contract

Status: baseline for `lib/appearance/*` (2026-09-16)  
Updated: 2026-09-19 — lock Appearance panel MVP slice

## Reality check

- Phase 1 foundation (`lib/appearance/*`) **exists**. Reads/writes legacy flat fields; does not persist a canonical `appearance` object.
- Engine `ENGINE_SCHEMA_VERSION` is **6** (Block/hex bake to Free pixels). That bump is unrelated to Appearance.
- If Appearance is ever persisted as a canonical field, that migration is **schema v7**. Do not reuse v6.

## Locked MVP slice (Peerawat 2026-09-19)

In scope:

- Appearance panel in the live Builder Inspector
- Shadow + Glow (both allowed)
- Text Arc for text objects via existing `pathCurvature` (no path envelope warp)

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
