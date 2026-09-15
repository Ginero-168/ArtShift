# Appearance Phase 0 — Contract

Status: baseline for `lib/appearance/*` (2026-09-16)

## Stack order

- Stored `items[]` is **back-to-front** (index 0 paints first / behind).
- UI lists items **top-to-bottom as front-to-back** (reverse of storage when rendering the panel).

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

- Mixed values surface as `mixed: true` on snapshot fields (Phase 3+ UI).
- Phase 1 operations always target one element at a time.

## Export policy

- Canvas2D is the fidelity target for MVP.
- SVG / PPTX adapters may drop unsupported effects and must report capability gaps (Phase 6).
