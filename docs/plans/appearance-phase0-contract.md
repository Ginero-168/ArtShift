# Appearance Phase 0 — Contract

Status: baseline for `lib/appearance/*` (2026-09-16)  
Updated: 2026-09-20 — Extrude / Emboss are first-class Appearance effects (engine schema v9). Text Effect Presets (static Colorion) still write the same stack. Multi-layer Fill/Stroke remains a product feature. Image tones remain a UI group from #20, not Appearance items.

## Reality check

- Phase 1 foundation (`lib/appearance/*`) **landed** in the #12 lineage. MVP UI: Appearance panel + Shadow/Glow + Text Arc.
- Engine `ENGINE_SCHEMA_VERSION` is **9**. Canonical `appearance` landed in schema v7 and is dual-written to legacy flat fields. v8 adds item-level gradient/conic, clip-to-glyphs, multi-shadow `layers`, item blend, offset paint layers, and static blur. v9 adds named `extrude` and `emboss` effects (not dual-written to legacy shadow/glow).
- **v6 = Block bake** (unrelated). Appearance persist started as **schema v7**. Do not reuse v6.
- Load prefers `appearance` when present and valid; otherwise synthesizes from legacy fields. Save always writes both.
- Extra Fill/Stroke items live on `appearance.items` (legacy dual-write still stores only the first visible fill and stroke). Canvas2D paints the full stack.

## Persist (schema v7 → v8)

- Stored field: `EngineElement.appearance` (`schemaVersion: 1` inside the stack, distinct from engine v7/v8/v9).
- Dual-write on save and Appearance mutations: `shadow`, `glow`, fill (`backgroundColor` / `fillType` / gradients / `fillPattern`), stroke, root `opacity` / `blendMode`. Extra shadow `layers[]`, item blend, and offsets stay on `appearance` only.
- Text Arc remains `pathCurvature` on text (not an Appearance item); it continues to be written as a legacy text field.
- v6 → v7 is idempotent: synthesize `appearance` from legacy when missing; if `appearance` is already present, prefer it and refresh legacy from it. Extra stack items that do not fit in a single legacy fill/stroke are kept on `appearance` (no silent drop).
- v7 → v8 is additive: missing item fields normalize to defaults. Text Effect Presets write a full stack recipe through `replaceStack` (`applyTextEffectPreset` / `updateAppearance`).
- v8 → v9 is additive: missing `extrude` / `emboss` items means the look is not applied. Extra stack items that do not fit in a single legacy fill/stroke/shadow stay on `appearance` (no silent drop).
- Runtime: `updateAppearance` / `changeAppearance` write both sides. Legacy `updateElements` patches that touch those flat fields resync the primary Appearance items so PropertiesPanel/AI are not a competing writer.

## Locked slice (Peerawat 2026-09-20)

In scope:

- Appearance panel in the live Builder Inspector
- **Multiple Fill and Stroke layers** (add / remove / reorder); Canvas paints in stored stack order
- **Text paint roles (Illustrator-like):** Fill = glyph fill (สีพื้นของตัวอักษร), Stroke = glyph outline (สีขอบ), Background = optional behind-text backdrop (separate stack item — not the Fill row renamed)
- **Text Effect Presets (static Colorion 90)** — still frames only; canvas/SVG paint the stack; Appearance picker groups, searches, and previews; see `docs/plans/text-effect-presets-static-from-colorion.md`
- Shadow + Glow (both allowed; multi-layer `layers[]` on a single Shadow/Glow item)
- **Extrude (depth / 3D block)** and **Emboss / Deboss / Bevel** as named effect items — add/remove from Appearance like Shadow/Glow; presets that imply 3D write these items so they stay editable
- Optional static gaussian blur, per-item blend, offset duplicate paint layers
- Text Arc for text objects via existing `pathCurvature` (no path envelope warp)
- Image tone sliders (`adjustments` / `filterBlur`) as one Appearance UI group for images; not Appearance stack items and not Brand Graphic Styles

Out of scope:

- Graphic Styles linked to Brand Kit
- Path warp / envelope
- Group Appearance
- Vector/Affinity PDF export rewrite
- Moodboard

## Multi Fill / Stroke

- An object may have several Fill items and several Stroke items in `appearance.items`.
- Stored order is **back-to-front** (index 0 paints first). The panel lists **front-to-back** (top paints last).
- Add Fill / Add Stroke inserts the new layer in front of existing paint and behind the first effect (Illustrator-like).
- Each Fill has its own paint (solid, and gradients/patterns already in the model) and opacity. Each Stroke has color, weight, dash style, and opacity.
- `canvasPaintPasses` emits visible fills/strokes in stored order. When more than one fill or stroke is visible, or a fill paints in front of a stroke, the Canvas renderer composites those passes instead of the single legacy fill+stroke draw.
- Dual-write still copies the **first visible** fill and stroke onto legacy flat fields so older readers (SVG/PPTX, FillSection) keep a primary style. Extra layers are not dropped from `appearance`.
- New shapes/text keep today’s factory defaults (typically one fill and/or one stroke after hydrate).
- **Text dual-write:** first visible Fill → `strokeColor` (legacy glyph color, so SVG `<text fill>` stays correct). First visible Background → `backgroundColor`. Glyph Stroke (outline) lives on `appearance.items`; `strokeWidth` is dual-written for the outline weight. Do not treat Fill as the text box.
- Older text stacks that stored the box as Fill and the glyph color as Stroke are remapped on read/hydrate (`paintSemantics: "object"`). Transparent boxes are dropped rather than kept as a Fill named Background.

## Stack order

- Stored `items[]` is **back-to-front** (index 0 paints first / behind).
- UI lists items **top-to-bottom as front-to-back** (reverse of storage when rendering the panel).
- Text Arc is **not** an Appearance item. It is listed at the top of the panel for text objects and writes `TextElement.pathCurvature`.

## Shadow + Glow (Canvas2D)

- Canvas2D has one `shadow*` state per draw call.
- Legacy renderer was XOR (`shadow` else `glow`) and silently dropped the other.
- Current renderer composites cached element bitmaps with **sequential passes in stored stack order** so both can be visible. Interior pixels of later passes cover earlier interiors; halos remain.
- Do not XOR-clear the other effect when the user enables Shadow or Glow.

## Extrude / Emboss (Canvas2D)

- `extrude` and `emboss` are `kind: "effect"` items. They are **not** dual-written to legacy `shadow` / `glow`.
- The canvas compositor expands them into sequential offset copies of the cached still (same path as multi-layer shadow), then paints the unshadowed face on top. Face color is the Fill; side color is `sideColor` or a darkened Fill when `sideFromFill` is true.
- **Extrude controls:** depth (px), angle (0° = right, 90° = down), steps (0 = smooth 1px copies), side color.
- **Emboss controls:** mode (emboss / deboss / bevel), depth, light angle (shadow falls this way; highlight opposite), softness, highlight + shadow colors.
- Text is the primary target. Path / freedraw / shapes reuse the same compositor when cheap. Images do not get these add-buttons.
- Colorion 3D stills (Deep-Type, Pop-Riot, Sundial, Parallax, Keycap) compile into these named items instead of an uneditable shadow stack.

## Coordinates

- Fill / Stroke / Effect use the element's local geometry (bbox before rotation).
- Shadow offsets are in slide pixels after the element's local transform.

## Opacity

- Root `appearance.opacity` applies once at final composite.
- Item `opacity` applies only to that Fill / Stroke / Effect.
- Do not multiply legacy field opacity twice when reading through `readAppearance`.

## Visual bounds

- Shadow / glow expand bounds by `blur + abs(offset)` (see `bounds.ts`).
- Extrude expands by the depth vector; emboss expands by `depth + softness` in both light directions.
- Stroke center alignment expands by `width / 2`.

## Multi-selection

- Mixed values surface as `mixed: true` on snapshot fields (later UI).
- `updateAppearance` is all-or-none across ids. Operations that need per-element item ids should be functions of the target element (`shadowPatchOperation`, etc.).

## Export policy

- Canvas2D is the fidelity target for this slice.
- SVG / PPTX adapters may drop unsupported effects and must report capability gaps (Phase 6).
