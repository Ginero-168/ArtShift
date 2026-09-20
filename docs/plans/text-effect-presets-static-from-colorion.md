# Text Effect Presets — static stills from Colorion 90 CSS

Status: **Phases A–D complete (static only)**  
Date: 20 September 2026  
Owner lock: Peerawat 2026-09-20

Source: [text-effects.colorion.co](https://text-effects.colorion.co/) — 90 pure-CSS text effects, MIT.  
Upstream CSS: [ckissi/colorion-text-effects `src/styles/global.css`](https://github.com/ckissi/colorion-text-effects/blob/main/src/styles/global.css)

---

## Hard constraint (locked)

**STATIC ONLY.** ArtShift presets are still-frame looks derived from each effect’s visual language.

ไม่ทำ / never ship in this track:

- CSS `@keyframes` / `animation`
- typewriter caret timing
- karaoke / lyric sweep **motion**
- zoetrope spin
- per-letter stagger clocks
- any animated motion

Still-frame อนุญาต: gradient fills, neon glow stacks, chrome/foil, glyph stroke, offset RGB/duotone layers, grain-like pattern fills, static blur/bloom.

---

## Full 90 names (01–90)

| # | Name | Slug | Family |
|---:|---|---|---|
| 01 | Borealis | `aurora` | gradient_aurora |
| 02 | Glitchcore | `glitch` | glitch_offset |
| 03 | Teletype | `typewriter` | frozen_motion |
| 04 | Neon-Haus | `neon` | neon_glow |
| 05 | Aqua-Fill | `liquid` | liquid_fill |
| 06 | Chromia | `chrome` | chrome_metal |
| 07 | Lens-Drift | `focus` | soft_blur_bloom |
| 08 | Tidal-Type | `wave` | frozen_motion |
| 09 | Bisect | `sliced` | cutout_layers |
| 10 | Cipher | `decoder` | frozen_motion |
| 11 | Redactor | `scanner` | cutout_layers |
| 12 | Emberglow | `ember` | neon_glow |
| 13 | Echo-Verse | `echo` | outline_stroke |
| 14 | Deep-Type | `extrude` | emboss_3d |
| 15 | Wireframe | `contour` | outline_stroke |
| 16 | Prisma | `spectrum` | gradient_aurora |
| 17 | Jitterbug | `jitter` | frozen_motion |
| 18 | Anaglyph-3D | `anaglyph` | glitch_offset |
| 19 | Split-Flap | `flap` | frozen_motion |
| 20 | Phosphor | `crt` | neon_glow |
| 21 | Pop-Riot | `pop` | emboss_3d |
| 22 | Limelight | `spotlight` | gradient_aurora |
| 23 | Rubber-Band | `elastic` | frozen_motion |
| 24 | Still-Water | `mirror` | liquid_fill |
| 25 | Ransom-Note | `ransom` | cutout_layers |
| 26 | Meltdown | `melt` | frozen_motion |
| 27 | Cardio | `heartbeat` | neon_glow |
| 28 | Hi-Liter | `marker` | gradient_aurora |
| 29 | Sundial | `sundial` | emboss_3d |
| 30 | Negativ | `negative` | cutout_layers |
| 31 | Holograph | `hologram` | holographic |
| 32 | Gold-Foil | `foil` | chrome_metal |
| 33 | Pixel-Sort | `pixel` | glitch_offset |
| 34 | Starlight | `starlight` | neon_glow |
| 35 | Blueprint | `blueprint` | outline_stroke |
| 36 | Vapor-Trail | `vapor` | neon_glow |
| 37 | Kinetic-Type | `kinetic` | frozen_motion |
| 38 | Blackout | `blackout` | cutout_layers |
| 39 | Magnetic | `magnetic` | frozen_motion |
| 40 | Luma-Mesh | `mesh` | gradient_aurora |
| 41 | Iridescent | `iridescent` | gradient_aurora |
| 42 | Glass-Type | `glass` | soft_blur_bloom |
| 43 | Datastream | `datastream` | texture_fill |
| 44 | Orbitals | `orbit` | frozen_motion |
| 45 | Prism-Cut | `prismcut` | cutout_layers |
| 46 | Soft-Blur | `softblur` | soft_blur_bloom |
| 47 | Laser-Cut | `laser` | cutout_layers |
| 48 | Microchip | `microchip` | texture_fill |
| 49 | Heatmap | `heatmap` | gradient_aurora |
| 50 | Parallax | `parallax` | emboss_3d |
| 51 | Ink-Trap | `inktrap` | outline_stroke |
| 52 | Topographic | `topo` | texture_fill |
| 53 | Signal-Noise | `noise` | glitch_offset |
| 54 | Portal | `portal` | gradient_aurora |
| 55 | Tilt-Shift | `tiltshift` | soft_blur_bloom |
| 56 | Duotone | `duotone` | glitch_offset |
| 57 | Glyph-Rain | `rain` | frozen_motion |
| 58 | Zoetrope | `zoetrope` | frozen_motion |
| 59 | Dot-Matrix | `dotmatrix` | texture_fill |
| 60 | Pendulum | `pendulum` | frozen_motion |
| 61 | Smoke-Signal | `smoke` | soft_blur_bloom |
| 62 | Eclipse | `eclipse` | cutout_layers |
| 63 | Barcode | `barcode` | texture_fill |
| 64 | Frostbite | `frost` | texture_fill |
| 65 | Moiré | `moire` | texture_fill |
| 66 | Rubber-Stamp | `stamp` | texture_fill |
| 67 | LED-Board | `led` | texture_fill |
| 68 | Light-Leak | `lightleak` | gradient_aurora |
| 69 | Kilovolt | `kilovolt` | neon_glow |
| 70 | Carrara | `carrara` | chrome_metal |
| 71 | Ripple | `ripple` | liquid_fill |
| 72 | Shatter | `shatter` | cutout_layers |
| 73 | Film-Grain | `grain` | texture_fill |
| 74 | Caustics | `caustics` | liquid_fill |
| 75 | Origami | `origami` | frozen_motion |
| 76 | Domino | `domino` | frozen_motion |
| 77 | Zip-Merge | `zip` | frozen_motion |
| 78 | Equalizer | `eq` | frozen_motion |
| 79 | Mercury | `mercury` | chrome_metal |
| 80 | Sonar | `sonar` | gradient_aurora |
| 81 | Hyperspace | `hyperspace` | frozen_motion |
| 82 | Ghostwrite | `ghost` | gradient_aurora |
| 83 | Tickertape | `ticker` | frozen_motion |
| 84 | Kaboom | `kaboom` | glitch_offset |
| 85 | Lyric-Fill | `lyric` | gradient_aurora |
| 86 | Lenti-Card | `lenticular` | holographic |
| 87 | Helium | `helium` | frozen_motion |
| 88 | Liquid-Lens | `lens` | soft_blur_bloom |
| 89 | Whiplash | `smear` | frozen_motion |
| 90 | Keycap | `keycap` | emboss_3d |

GitHub CSS numbered markers cover 84 effects; the remaining 6 exist on the site as `.fx-*` (`mirror`, `negative`, `ticker`, `lens`, `smear`, `keycap`) and are included.

---

## Capability → Appearance mapping

Colorion CSS capability (frequency) maps onto the existing Appearance **stack**, not a parallel system. Text paint roles stay Illustrator-like from #24:

| CSS capability | Appearance expression |
|---|---|
| `background-clip: text` + gradient | Fill `paint: linearGradient / radialGradient / conicGradient` + `clipToGlyphs: true` (text Fill already paints glyphs) |
| solid `color` | Fill solid (glyph fill) dual-writes to `strokeColor` |
| `-webkit-text-stroke` | Stroke item (`paintOrder: fill`) |
| multi `text-shadow` | one Shadow effect + `layers[]` (not XOR with Glow) |
| neon / outer glow | Glow and/or 0-offset shadow layers |
| `filter: blur()` still | `gaussianBlur` effect (static radius) |
| `mix-blend-mode` | item `blendMode` (`difference`, `screen`, `soft-light`, …) |
| `::before/::after` / `data-text` duplicates | extra Fill items with `offsetX/offsetY` |
| text box | Background item (unchanged) |
| `letter-spacing` | recipe `letterSpacingEm` → `TextElement.letterSpacingEm` on apply |
| Text Arc | existing `pathCurvature` — not used by these presets |
| 3D block / long cast / comic depth (Deep-Type, Pop-Riot, Sundial, Keycap) | named `extrude` effect (depth, angle, steps, taper, side color) — not an uneditable shadow stack. Presets leave taper at 0 unless a look benefits. |
| Emboss / dual-color relief (Parallax, Keycap face) | named `emboss` effect (mode, depth, light angle, softness, highlight+shadow colors) |

Engine **schema v10** adds Extrude `taper` on top of v9 named Extrude/Emboss effects. v8 item fields stay. `Appearance.schemaVersion` stays **1**. v7/v9 documents load: missing fields (including taper) normalize to defaults (taper 0). Dual-write still copies the first visible Fill/Stroke/Shadow/Glow onto legacy flat fields. Extrude/Emboss live on `appearance` only.

### Schema v8 item fields

- `AppearancePaint.conicGradient`
- Fill `clipToGlyphs`
- Fill / Stroke / Background `blendMode`, `offsetX`, `offsetY`
- Stroke `paintOrder`
- Shadow/Glow `layers[]`
- `gaussianBlur` remains an effect; painted as a static canvas filter
- `replaceStack` appearance command applies a full recipe undo-safely

### Schema v9 named 3D effects

- Effect `type: "extrude"` — `depth`, `angle` (0° = right, 90° = down), `steps` (0 = smooth), `sideColor`, `sideFromFill`
- Effect `type: "emboss"` — `mode: emboss | deboss | bevel`, `depth`, `angle`, `softness`, `highlightColor`, `shadowColor`
- Renderer expands both into sequential cached-bitmap copies (same compositor as multi-shadow), then paints the face still on top
- Appearance panel: add/remove Extrude and Emboss like Shadow/Glow; sliders live-preview on canvas

`APPEARANCE_MAX_ITEMS` is 24 so offset fills can sit beside a shadow stack.

---

## Renderer (Phase B)

Canvas2D (live editor + PNG/thumbnail path) paints the Appearance stack for text:

| Capability | Canvas | SVG export |
|---|---|---|
| Glyph-clipped linear / radial / conic fills | `fillText` with gradient `fillStyle`; conic falls back to radial if `createConicGradient` is missing | gradient `url(#)` fills; conic approximated as radial |
| Pattern fills (dots / stripes / grid) | offscreen pattern + `destination-in` glyph mask | foreground solid (pattern not reconstructed) |
| Multi-layer text-shadow / glow | sequential `shadow*` passes, then the unshadowed still on top | stacked `feDropShadow` |
| Extrude / Emboss | same compositor: named effects expand to offset copies (`source: extrude \| emboss`) | stacked `feDropShadow` via `canvasShadowPasses` |
| Text stroke | `strokeText` | `<text fill="none" stroke>` |
| Static gaussian blur | `ctx.filter = blur()` at composite | `feGaussianBlur` |
| Per-item blend | `globalCompositeOperation` | `mix-blend-mode` |
| Offset duplicate fills | `translate(offsetX, offsetY)` per fill | `transform="translate"` per `<text>` |
| Letter-spacing | `ctx.letterSpacing` + layout measure | `letter-spacing` attribute |

Offscreen bitmap padding uses `appearanceRenderPad` so neon halos and offset ears are not clipped.

Blend-mode offset fills (duotone `screen`, Negativ `difference`) paint **in front** of the main fill; RGB-split offsets without a blend paint **behind** so only the sticking-out ears show.

---

## Residual CSS-only gaps

`rendererSupport: false` only when the still cannot be claimed as canvas-faithful:

| Preset | Gap |
|---|---|
| Still-Water (`mirror`) | true `-webkit-box-reflect` (recipe uses a faded offset fill as a hint, not a flipped reflection) |
| Liquid-Lens (`lens`) | radial `mask-image` of a magnified copy + `backdrop-filter` puck |

Approximated (support **true**): clip-path shards → offset fills; LED/lenticular CSS masks → pattern or stripe fills; per-letter hue/flap/decoder scramble → family-level still (not glyph-run styling).

Do **not** treat those approximations as motion. No `@keyframes` in recipes, previews, or export.

---

## Deferred (not this track)

| Deferred | Why |
|---|---|
| True motion / `@keyframes` | Product lock — static only |
| Typewriter timing, karaoke sweep motion, zoetrope spin | Timing, not a still |
| True `-webkit-box-reflect` | CSS-only; see residual gaps |
| True CSS `mask` / `clip-path` shards | Approximated; Liquid-Lens remains unsupported |
| Per-letter hue / flap plates / decoder scramble | Needs glyph-run styling, not a stack item |
| Graphic Styles / Moodboard / Affinity PDF | Out of scope |

---

## Phases

- **A (done, #27):** docs + 90 catalog + Appearance model v8 + round-trip tests + minimal picker hook
- **B (done):** canvas/SVG paints the stack (gradients, multi-shadow, stroke, blur, blend, offset fills); `rendererSupport` accurate
- **C (done):** 90 still-frame recipes revisited; keep 90 named entries; letter-spacing writes onto text
- **D (done):** Appearance picker with family groups, search, CSS still previews; apply via `replaceStack` / `updateAppearance`

---

## ภาษาไทย (ล็อกผลิตภัณฑ์)

ชุด Text Effect Presets ของ ArtShift ดึงภาษาภาพจาก 90 เอฟเฟกต์ Colorion แต่ **เป็นภาพนิ่งเท่านั้น** — ห้าม `@keyframes` ห้ามพิมพ์ทีละตัว ห้ามกวาดคาราโอเกะ ห้ามหมุน zoetrope

โมเดล Appearance กองเดิมถูกขยาย (schema เอกสาร v8) ให้รองรับ:

1. ไล่สีบนตัวอักษร (linear / radial / conic, clip ตาม glyph)
2. เงา/โกลว์หลายชั้น ไม่ XOR ทิ้ง
3. เส้นขอบตัวอักษร (text stroke)
4. เบลอนิ่ง
5. blend ต่อชั้น
6. ชั้นสีเลื่อน offset สำหรับ glitch / anaglyph / duotone

ผู้ใช้เลือก Text บนแคนวาส เปิด Appearance แล้วค้นหา/เลือกพรีเซ็ตตามครอบครัว พร้อมภาพตัวอย่างนิ่ง แล้วเห็นลุคบนแคนวาสทันที

สิ่งที่ยังเป็น CSS-only: true `box-reflect` (Still-Water) และ radial mask + backdrop-filter ของ Liquid-Lens
