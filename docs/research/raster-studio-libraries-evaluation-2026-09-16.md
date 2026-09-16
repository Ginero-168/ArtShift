# Raster Studio libraries & technologies for ArtShift

> Research date: **16 September 2026**  
> Scope: libraries and patterns for a Photoshop **Smart Object–style Raster Studio** (open image → edit → save revision back) beside ArtShift’s existing Next.js / React / Canvas2D design editor.  
> Source policy: primary sources only (official docs, npm, GitHub, MDN). Complements [Raster Retouching Research](../raster-healing-library-research.md); this note focuses on **studio extraction**, not heal/clone algorithms alone.

## Executive recommendation

**Prefer hybrid: build-own studio shell + keep ArtShift’s raster engine; buy/embed only for narrow UI gaps.**

| Rank | Strategy | Verdict |
|---|---|---|
| **1** | **Build-own Raster Studio** (full-screen route or modal) that moves today’s in-canvas raster tools onto an image-scoped surface, reusing Zustand document seams, `rasterMask` / `rasterEdits`, OpenCV workers, and `perfect-freehand` | **Recommended default** |
| **2** | **Optional embed escape hatch** — Photopea iframe (free API) or Pintura (commercial) for crop / adjust / annotate / advanced PSD-like work users cannot get in v1 studio | **Optional phase-2** |
| **3** | **Buy a full editor SDK** (CE.SDK / PE.SDK / Polotno / Pintura-as-core) as the studio | **Not recommended** — replaces what ArtShift already owns and fights Smart Object revision semantics |
| **4** | **Adopt a second canvas engine** (Fabric / Konva / Filerobot’s Konva stack) as the studio renderer | **High risk** — dual engines, dual state, React 19 peer weight |

ArtShift already ships the hard parts of a local raster studio: Canvas2D design editor, Zustand engine, non-destructive `rasterMask` / `rasterEdits`, OpenCV.js workers for heal / GrabCut, selection workers, and `perfect-freehand` (`package.json`, `lib/raster/*`, `lib/engine/freehand.ts`, `ROADMAP.md`). The missing product is an **open → edit → commit revision** boundary, not a new retouch algorithm stack.

---

## Decision criteria (use these to re-score later)

Score any candidate against:

1. **Smart Object contract** — Can ArtShift open one image element, edit in isolation, and write back a revision (asset URL + optional op history) without replacing the design canvas?
2. **Overlap with existing stack** — Does it duplicate Canvas2D + Zustand + OpenCV + freehand, or fill a real gap (crop UX, color tools, layers UI, encode)?
3. **React 19 / Next 15 fit** — Official React adapter, peer deps, SSR/`'use client'` story.
4. **License & cost** — MIT/Apache vs commercial seat/MAU/OEM; OEM risk if ArtShift is a product that embeds the editor for end users.
5. **Maintenance** — Recent npm releases, React version support, open issues on framework compatibility.
6. **State ownership** — Can ArtShift keep document truth in Zustand, or must the SDK own history/layers?
7. **Worker / memory story** — Large bitmaps, transferable buffers, cancellation (ArtShift already has `RasterJob` budgets).
8. **Isolation cost** — Modal vs route vs popup; COOP/COEP impact on `SharedArrayBuffer` / wasm-vips / Auth popups.

**Adopt if** it improves (1)+(2) without failing (3)–(6).  
**Reject if** it requires replacing the design canvas or freezes ArtShift on an abandoned React peer range.

---

## What ArtShift already has (baseline)

| Capability | Evidence in repo |
|---|---|
| Design canvas (Canvas2D) + Zustand | Product description / engine; `zustand` in dependencies |
| Non-destructive mask strokes & retouch patches | `lib/raster/types.ts` (`rasterMask`, `rasterEdits`) |
| Heal / clone with OpenCV inpaint + clone fallback | `lib/raster/retouch.ts`, `@techstark/opencv-js` |
| Selection, magic wand, workers, budgets | `lib/raster/*`, `ROADMAP.md` Raster Core / Retouch v1 |
| Pressure-aware freehand outlines | `perfect-freehand` + `lib/engine/freehand.ts` |
| Prior heal-library research | `docs/raster-healing-library-research.md` |

Studio work should **extract and concentrate** these tools, not re-platform them.

---

## 1. Full image editors / SDKs

### 1.1 Filerobot Image Editor (`react-filerobot-image-editor`)

| | |
|---|---|
| **What it is** | Embeddable image editor: resize, crop, flip, finetune, annotate, watermark, filters, undo/redo ([GitHub README](https://github.com/scaleflex/filerobot-image-editor)). |
| **License** | MIT ([npm](https://www.npmjs.com/package/react-filerobot-image-editor), GitHub). |
| **Maintenance** | Active: React package updated through 2026; v5 beta requires **React ≥19**, `react-konva` ≥19, `styled-components` ≥5.3.5 ([npm peer deps](https://www.npmjs.com/package/react-filerobot-image-editor)). Stable v4 line last tagged around late 2024 on GitHub releases. |
| **React fit** | Official React component; Konva-based. Fits React 19 peers on the beta line ArtShift already uses. |
| **Solves** | Fast crop / filter / annotate UI without building chrome. |
| **ArtShift already has** | Heal/clone, selection, mask, freehand, design layout — Filerobot does **not** replace those. README features emphasize transform/annotate/filter, not Photoshop heal/clone/magic wand. |
| **Risks** | Introduces **Konva + styled-components** beside Canvas2D; export is a flattened image (Smart Object becomes bake-on-save unless you invent a parallel history); UI/theme coupling; experimental “export design state” is not ArtShift’s document model. |
| **Fit score** | Useful **optional** annotate/crop modal; poor as core Raster Studio. |

### 1.2 Pintura (PQINA)

| | |
|---|---|
| **What it is** | Commercial JS image editor SDK with React / Next examples ([React install docs](https://pqina.nl/pintura/docs/v8/installation/react/), [install page](https://pqina.nl/pintura/install/)). |
| **License** | Commercial; perpetual use of versions released during subscription; updates/support/private npm expire with subscription ([license](https://pqina.nl/pintura/license/), [pricing](https://pqina.nl/pintura/pricing/)). Public figures: Personal ~€169/yr, Developer ~€749/seat/yr; OEM license required if customers build products with Pintura inside ([pricing](https://pqina.nl/pintura/pricing/)). Test npm package watermarks output ([@pqina/pintura](https://www.npmjs.com/package/@pqina/pintura)). |
| **Maintenance** | Actively published (npm test package versions through 2026). |
| **React fit** | First-class `@pqina/react-pintura`; Next.js example projects documented. |
| **Solves** | Polished crop, finetune, annotate, redact, resize UI; **Retouch plugin** is a non-destructive shape layer in image space that **expects a third-party AI/inpaint callback** — not an offline Healing Brush ([Retouch plugin docs](https://pqina.nl/pintura/docs/v8/api/plugins/retouch/)). |
| **ArtShift already has** | Local OpenCV heal/clone + masks. Pintura Retouch would either wrap ArtShift’s worker as the `inpaint` callback or push cloud AI. |
| **Risks** | OEM/commercial cost for a design product; dual UI systems; bake-on-process vs ArtShift op lists; Retouch still needs ArtShift’s algorithms or paid APIs. |
| **Fit score** | Strong **buy UI shell** if budget allows and studio is “adjust + crop + AI retouch”; weak as replacement for owned raster core. |

### 1.3 Toast UI Image Editor (`tui-image-editor`)

| | |
|---|---|
| **What it is** | Full-featured canvas image editor (Fabric-based) with React wrapper ([nhn/tui.image-editor](https://github.com/nhn/tui.image-editor)). |
| **License** | MIT. |
| **Maintenance** | **Stale for product use:** `tui-image-editor` last npm publish **2022-04**; `@toast-ui/react-image-editor` last **2022-04**, peers React 17 ([npm](https://www.npmjs.com/package/@toast-ui/react-image-editor)). Open issue on React 18 compatibility remains unresolved into 2025 ([#794](https://github.com/nhn/tui.image-editor/issues/794)). |
| **React fit** | Poor for ArtShift’s React 19. |
| **Risks** | Abandoned peer range, Fabric 4 era, no Smart Object integration path worth the debt. |
| **Fit score** | **Reject.** |

### 1.4 PhotoEditor SDK / CreativeEditor SDK (IMG.LY)

| | |
|---|---|
| **What it is** | Commercial embeddable editors. Legacy **PE.SDK** (`photoeditorsdk` npm) and current **CE.SDK** (`@cesdk/cesdk-js`) with React/Next kits ([PE React guide](https://img.ly/docs/pesdk/web/guides/react-js/), [CE Next.js](https://img.ly/docs/cesdk/nextjs/starterkits/design-editor-8unj9u/), [CE npm](https://www.npmjs.com/package/@cesdk/cesdk-js)). |
| **License** | Commercial subscription; license key removes watermarks; CE.SDK priced by MAU / product hostname ([CE licensing](https://img.ly/docs/cesdk/react/licensing-8aa063/), [Photo product FAQ quoting ~$600–2,000/mo typical](https://img.ly/products/photo-sdk/)). |
| **Maintenance** | Active (CE.SDK npm updated 2026). |
| **React fit** | Good (`'use client'` wrappers documented). |
| **Solves** | Entire white-label photo/design/video editor. |
| **ArtShift already has** | Design canvas + slide/layout product. CE.SDK is a **competing design engine**, not a Smart Object studio plug-in. |
| **Risks** | Cost, remote license validation, dual document models, product identity dilution. |
| **Fit score** | **Reject as ArtShift core**; only reconsider if pivoting to “white-label CE.SDK with ArtShift chrome.” |

### 1.5 Polotno

| | |
|---|---|
| **What it is** | Opinionated React canvas editor SDK for design tools / templates ([overview](https://polotno.com/docs/overview)). |
| **License** | Commercial; 60-day trial; self-serve listed ~$899/mo or $9,990/yr; closed source by default ([license](https://polotno.com/legal/license), [pricing](https://polotno.com/sdk/pricing)). License forbids using SDK to build a competing editor/SDK ([license](https://polotno.com/legal/license)). |
| **React fit** | React-first (4.x targets React 19). |
| **Solves** | Full design editor — same category as ArtShift’s main canvas. |
| **Risks** | Direct category conflict + license clause against competing products; expensive for a raster-only studio. |
| **Fit score** | **Reject** for Raster Studio. |

### 1.6 Craft.js

| | |
|---|---|
| **What it is** | React framework for **drag-and-drop page editors** ([craft.js.org](https://craft.js.org/docs/overview), [@craftjs/core](https://www.npmjs.com/package/@craftjs/core)). |
| **License** | MIT. |
| **Maintenance** | npm updated into 2025; still useful for page builders. |
| **React fit** | Excellent — but wrong problem domain. |
| **Solves** | DOM/React component trees, serialization of page nodes. |
| **Does not solve** | Pixel layers, heal/clone, ImageData pipelines. |
| **Fit score** | **Reject** for Raster Studio (keep watching only if ArtShift builds a separate DOM template builder). |

### 1.7 Fabric.js

| | |
|---|---|
| **What it is** | Canvas object model popular for image editors; MIT; active (`fabric` npm v7.x in 2026) ([fabric.js GitHub](https://github.com/fabricjs/fabric.js/), [npm](https://www.npmjs.com/package/fabric)). |
| **React fit** | Manual `useEffect` canvas lifecycle (docs show React pattern); no official React binding comparable to `react-konva`. |
| **Solves** | Object selection, transforms, filters, SVG I/O if building an editor from scratch. |
| **ArtShift already has** | Custom Canvas2D + element model. |
| **Risks** | Second scene graph; Toast UI’s Fabric dependency history shows how editors freeze on Fabric majors; migration cost if used only for studio. |
| **Fit score** | **Do not adopt as studio core.** Possibly study APIs; do not dual-render. |

### 1.8 Konva / react-konva (+ editors built on them)

| | |
|---|---|
| **What it is** | Scene graph over Canvas; multi-`Layer` (each layer own canvas); filters; MIT; `konva` ~10.x, official React binding ([konva npm](https://www.npmjs.com/package/konva), [overview](https://konvajs.org/docs/overview.html), [react-konva](https://github.com/konvajs/react-konva/)). |
| **React fit** | Best-in-class among canvas libs. |
| **Solves** | Interactive overlays, annotation layers, filter caching demos. |
| **ArtShift already has** | Canvas2D renderer tuned to document elements. |
| **Risks** | Dual engine; Filerobot already pulls Konva if you embed FIE — cost is paid either way. |
| **Fit score** | **Avoid as ArtShift design renderer.** Accept only as transitive dependency of an optional embed (Filerobot), not as a second owned engine. |

### 1.9 Photopea (hosted) & miniPaint (self-host)

| | Photopea | miniPaint |
|---|---|---|
| **What** | Hosted Photoshop-like editor with embed API | MIT browser paint app with layers, clone, content fill ([miniPaint](https://github.com/viliusle/miniPaint)) |
| **License / cost** | API usage free; white-label via distributor ([Photopea API](https://www.photopea.com/api/)) | MIT |
| **Integration** | Hash JSON config, iframe, `files` (URLs/data URIs), optional `server` POST save, `script` | iframe / same-origin `Layers` / `FileSave`; `?image=` URL ([wiki Examples](https://github.com/viliusle/miniPaint/wiki/Examples), [issue #402](https://github.com/viliusle/miniPaint/issues/402)) |
| **Solves** | True Photoshop-parity escape hatch (heal/clone tools exist in Photopea product surface — see prior ArtShift research) | Local layers/clone without SaaS |
| **Risks** | Hosted dependency, CORS, early-stage disclaimer / no liability ([API prices section](https://www.photopea.com/api/)); branding | No first-class postMessage save contract; brittle global API; not React-native |
| **Fit score** | **Best advanced escape hatch** | **Reference / last-resort embed**, not primary studio |

---

## 2. Brush / drawing engines

### 2.1 perfect-freehand — **already adopted**

- MIT; `getStroke` pressure-sensitive outlines ([GitHub](https://github.com/steveruizok/perfect-freehand), [npm](https://www.npmjs.com/package/perfect-freehand)).
- ArtShift wraps it in `lib/engine/freehand.ts`.
- **Studio action:** keep; ensure Raster Studio imports the same helper so brush feel matches the design canvas.

### 2.2 Paper.js

- Vector scene graph on Canvas; MIT ([paperjs.org/about](https://paperjs.org/about/), [GitHub](https://github.com/paperjs/paper.js/)).
- Strong for Bézier/path math; weak as pixel retouch engine.
- Maintenance signal mixed (releases exist; low recent activity on some trackers).
- **Fit:** optional path utilities only; **do not** base Raster Studio on Paper.js.

### 2.3 Rough.js — already in ArtShift deps

- Sketchy vector strokes; not a pixel brush engine.
- Irrelevant to Smart Object raster studio except decorative overlays.

**Brush recommendation:** stay on perfect-freehand + Canvas2D soft brush / hardness already modeled in `RasterMaskStroke`; do not add Paper.js for brushes.

---

## 3. Image processing

| Candidate | License | Role | vs ArtShift | Risk |
|---|---|---|---|---|
| **OpenCV.js** (`@techstark/opencv-js`) | Apache 2.0 (OpenCV 4.5+) | `inpaint`, GrabCut; Worker | **Already core** | Bundle size; JS whitelist gaps (e.g. `seamlessClone` — see prior research) |
| **GPU.js** | MIT ([npm](https://www.npmjs.com/package/gpu.js)) | GPGPU kernels via WebGL | Custom filters / convolutions | Learning cost; not a filter catalog; project activity historically uneven |
| **glfx.js** | MIT ([evanw/glfx.js](https://github.com/evanw/glfx.js/), [docs](https://evanw.github.io/glfx.js/docs/)) | Ready WebGL photo filters | Fast finetune preview | Effectively unmaintained (npm `glfx` last 2016); CORS/tainted canvas caveats in upstream README |
| **wasm-vips** | MIT wrapper / LGPL libvips | Decode, resize, composite, export | Pipeline for large images | COOP/COEP + `SharedArrayBuffer`; early browser story (prior research) |
| **@jsquash/\*** | Apache-2.0 (e.g. [@jsquash/png](https://www.npmjs.com/package/@jsquash/png)) | Worker-friendly encode/decode (Squoosh-derived) ([jSquash](https://github.com/jamsinclair/jSquash/)) | Better revision export than canvas `toDataURL` alone | Bundler WASM asset config; per-codec licenses in codec dirs |
| **Canvas2D filters / ImageData** | Platform | Preview adjustments | Zero deps | Main-thread cost; use Workers/`OffscreenCanvas` ([MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)) |

**Processing recommendation:** keep OpenCV for retouch; add **@jsquash** when revision export quality/size matters; consider **wasm-vips** only after COOP/COEP strategy is deliberate; treat glfx as inspiration, not a dependency; GPU.js only for a measured hot path.

---

## 4. Layer / compositing approaches (browser)

For a Smart Object studio, “layers” usually means **raster layers + blend modes + masks**, not ArtShift slide elements.

| Approach | How | Pros | Cons for ArtShift |
|---|---|---|---|
| **A. Op-list + flatten on preview** (current direction) | Store `rasterMask` / `rasterEdits` / future adjustment ops; composite in Worker or preview canvas | Matches non-destructive model; undo-friendly; Zustand-serializable | Need disciplined bake policy on “Save revision” |
| **B. Multi-canvas stack** | One canvas per layer; draw bottom→top | Simple mental model; Konva Layers do this ([Konva overview](https://konvajs.org/docs/overview.html)) | Memory × N; sync with design canvas harder |
| **C. Single buffer + `globalCompositeOperation`** | Blend with Canvas compositing modes ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)) | Native multiply/screen/overlay etc.; no lib | Limited vs Photoshop (no layer effects engine); order of ops matters |
| **D. WebGL framebuffer ping-pong** | Custom shaders or glfx-like | Real-time adjustments | Second graphics stack; debug cost |
| **E. Embed editor layers** (miniPaint / Photopea / CE.SDK) | Foreign layer model | Instant UX | Bad Smart Object sync; opaque history |

**Recommendation:** stay on **A + C** inside an owned studio. On Save revision:

1. Flatten preview to PNG/WebP (optionally via @jsquash).
2. Write asset revision + bump image element `src` / revision id.
3. Optionally keep studio op history in a side channel for “Edit again”; clear or migrate in-canvas `rasterMask`/`rasterEdits` per product rules.

Do **not** introduce Konva Layers as the source of truth.

---

## 5. Window / modal patterns

| Pattern | Mechanism | Pros | Cons |
|---|---|---|---|
| **In-app full-screen modal / drawer** | React portal over builder | Same JS heap can transfer `ImageBitmap`; simplest undo bridge | Heavy main document still mounted |
| **Same-origin Next.js route** (`/studio/[elementId]`) | App Router + shared Zustand persist or session store | Clean focus; deep-linkable; code-split OpenCV | Need load/save protocol for element + revision |
| **`window.open` popup** | Separate browsing context | True multi-monitor “Photoshop feel” | State sync required; COOP can sever `window.opener` ([MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy), [web.dev COOP/COEP](https://web.dev/articles/coop-coep)) |
| **BroadcastChannel** | Same-origin pub/sub ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API), [Chrome blog](https://developer.chrome.com/blog/broadcastchannel)) | Easy “revision saved” fan-out to builder tabs | No authority; design your protocol; not cross-origin |
| **SharedWorker** | Shared coordinator ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)) | Locks, shared decode cache, one OpenCV warm instance across windows | Extra complexity; Safari/support nuances historically; overkill for v1 |
| **iframe embed (Photopea/miniPaint)** | `postMessage` / hash API / server save | Escape hatch | CORS, trust, opaque pixels |

**Recommendation for ArtShift v1:**

1. **Primary:** same-origin **route or full-viewport studio panel** with explicit `openStudio(elementId)` / `commitRevision({ blob, meta })`.
2. **Sync:** in-process callbacks first; add **BroadcastChannel** when supporting multi-tab or optional popup.
3. **Defer SharedWorker** until profiling shows duplicated WASM/decode cost across windows.
4. **Defer COOP/COEP isolation** until wasm-vips or threads require it — it conflicts with some OAuth/popup flows.

---

## Comparison matrix (studio-shaped)

| Candidate | License | Maintained? | React 19 | Smart Object fit | Overlap / gap | Adopt? |
|---|---|---|---|---|---|---|
| Build-own studio (extract tools) | N/A (own code) | You | Native | Best | Uses existing stack | **Yes — core** |
| perfect-freehand | MIT | Yes | Agnostic | Brush only | Already in repo | **Keep** |
| OpenCV.js | Apache 2.0 | Yes (via package) | Worker | Retouch | Already in repo | **Keep** |
| @jsquash/* | Apache-2.0 | Yes | Workers | Export | Gap: codecs | **Phase 1–2** |
| Pintura | Commercial | Yes | Excellent | Modal editor | UI gap; Retouch needs your AI | **Optional buy** |
| Filerobot | MIT | Yes (v5 beta) | Peers ≥19 | Modal crop/annotate | Konva dual-engine | **Optional MIT UI** |
| Photopea | Free API / paid white-label | Hosted | iframe | Escape hatch | Hosted risk | **Optional** |
| miniPaint | MIT | Community | iframe | Escape hatch | Brittle API | Low priority |
| Toast UI | MIT | **Stale** | No | Weak | Dead end | **No** |
| CE.SDK / PE.SDK | Commercial | Yes | Yes | Replaces product | Competing engine | **No** |
| Polotno | Commercial | Yes | Yes | Competing editor | License conflict risk | **No** |
| Craft.js | MIT | OK | Yes | Wrong domain | Page builder | **No** |
| Fabric.js | MIT | Yes | Manual | Duplicate canvas | Dual engine | **No** |
| Konva | MIT | Yes | Excellent | Overlay only | Dual engine | **No** (transitive OK) |
| glfx.js | MIT | Stale | N/A | Filters | Inspiration | **No dep** |
| GPU.js | MIT | Moderate | N/A | Custom GPU | Niche | Measure first |
| wasm-vips | MIT/LGPL | Early browser | N/A | Pipeline | COOP/COEP | Later |
| BroadcastChannel | Platform | — | — | Multi-window sync | Protocol work | **Yes when needed** |
| SharedWorker | Platform | — | — | Shared WASM | Complexity | Later |

---

## Ranked strategies

### 1) Hybrid — build-own studio + selective embed (recommended)

**Build:**

- Raster Studio surface (route or full-screen) owned by ArtShift.
- Move heal / clone / wand / brush / selection UX out of the design canvas into studio; design canvas keeps transform/layout + “Edit image” entry.
- Commit path: flatten → store revision → update image element (Smart Object).
- Keep non-destructive ops inside studio session; decide bake-vs-preserve on commit.
- Reuse `perfect-freehand`, OpenCV adapter, raster workers, Zustand transactions.

**Buy/embed only if:**

- Product needs polished crop/finetune chrome faster than design time → **Pintura** (budget) or **Filerobot** (MIT, accept Konva).
- Power users need PSD-grade tools → **Photopea** iframe escape hatch with revision POST/blob return.

**Decision rule:** If a library cannot accept “input ImageBitmap + return revision blob” without owning the slide document, it is an embed, not a platform.

### 2) Buy/embed-first studio (not recommended as default)

Ship Pintura or CE.SDK as the studio. Faster chrome, but:

- Commercial/OEM cost,
- Dual history models,
- Weak reuse of existing OpenCV/selection investment,
- CE.SDK/Polotno especially threaten the main ArtShift canvas narrative.

Use only if the business goal shifts to “white-label third-party editor” rather than “ArtShift Smart Objects.”

### 3) Pure build-everything including crop/filter chrome

Maximum control, slowest UI polish. Acceptable if design resources can own studio chrome; still prefer this over CE.SDK/Polotno.

---

## Suggested ArtShift architecture (Smart Object)

```text
Design canvas (Canvas2D + Zustand)
    │  Edit image
    ▼
Raster Studio (same-origin route or fullscreen)
    │  tools: selection, brush/mask, heal/clone (existing workers)
    │  optional: Pintura/Filerobot/Photopea panel for crop/adjust
    ▼
commitRevision(blob | opList)
    │
    ▼
Asset store revision  →  imageElement.src / revisionId update
    │
    ▼
Design canvas re-renders linked Smart Object
```

Optional later: `BroadcastChannel('artshift-raster-studio')` for popup/multi-tab commit events.

---

## Phased plan

**Phase 0 — Contract**

- Define `RasterStudioSession`: `elementId`, `sourceRevision`, `workingOps`, `commit()`.
- Rules for what happens to in-canvas `rasterMask`/`rasterEdits` when opening studio (migrate in vs bake first).

**Phase 1 — Extract**

- Fullscreen studio UI; move existing raster tools; no new engine.
- Save revision back to element.

**Phase 2 — Pipeline**

- @jsquash encode for commits; OffscreenCanvas previews; optional adjustment ops (brightness/contrast) via ImageData or small WASM.

**Phase 3 — Escape hatches**

- Photopea or Pintura behind “Advanced edit”; always return a blob into the same `commitRevision`.

**Explicit non-goals**

- Replacing design canvas with Polotno/CE.SDK/Fabric.
- Adopting Toast UI.
- Making Konva the ArtShift document renderer.

---

## Primary sources

### Editors / SDKs
- [Filerobot Image Editor GitHub](https://github.com/scaleflex/filerobot-image-editor)
- [react-filerobot-image-editor npm](https://www.npmjs.com/package/react-filerobot-image-editor)
- [Pintura React install](https://pqina.nl/pintura/docs/v8/installation/react/)
- [Pintura pricing](https://pqina.nl/pintura/pricing/) · [license](https://pqina.nl/pintura/license/) · [Retouch plugin](https://pqina.nl/pintura/docs/v8/api/plugins/retouch/)
- [tui.image-editor GitHub](https://github.com/nhn/tui.image-editor) · [React 18 issue #794](https://github.com/nhn/tui.image-editor/issues/794)
- [PhotoEditor SDK React](https://img.ly/docs/pesdk/web/guides/react-js/) · [CE.SDK licensing](https://img.ly/docs/cesdk/react/licensing-8aa063/) · [@cesdk/cesdk-js](https://www.npmjs.com/package/@cesdk/cesdk-js)
- [Polotno overview](https://polotno.com/docs/overview) · [license](https://polotno.com/legal/license) · [pricing](https://polotno.com/sdk/pricing)
- [Craft.js overview](https://craft.js.org/docs/overview) · [@craftjs/core](https://www.npmjs.com/package/@craftjs/core)
- [Fabric.js](https://github.com/fabricjs/fabric.js/) · [fabric npm](https://www.npmjs.com/package/fabric)
- [Konva overview](https://konvajs.org/docs/overview.html) · [konva npm](https://www.npmjs.com/package/konva) · [react-konva](https://github.com/konvajs/react-konva/)
- [Photopea API](https://www.photopea.com/api/)
- [miniPaint](https://github.com/viliusle/miniPaint) · [Examples wiki](https://github.com/viliusle/miniPaint/wiki/Examples)

### Brush / processing / platform
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
- [Paper.js about](https://paperjs.org/about/)
- [GPU.js npm](https://www.npmjs.com/package/gpu.js)
- [glfx.js](https://evanw.github.io/glfx.js/docs/)
- [jSquash / @jsquash/png](https://www.npmjs.com/package/@jsquash/png)
- [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
- [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [MDN SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- [MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)
- [web.dev COOP/COEP](https://web.dev/articles/coop-coep)

### ArtShift internal baseline
- `package.json` (React 19, Next 15, `perfect-freehand`, `@techstark/opencv-js`)
- `lib/raster/types.ts`, `lib/raster/retouch.ts`, `lib/engine/freehand.ts`
- `ROADMAP.md` (Raster Core / Retouch v1)
- [docs/raster-healing-library-research.md](../raster-healing-library-research.md)

---

## Bottom line

ArtShift does not need a new canvas SDK to get Smart Object behavior. It needs a **dedicated studio boundary** around tools it already owns, plus a **revision commit** API. Prefer **build-own hybrid**; add Pintura/Filerobot/Photopea only as optional chrome or power-user escapes; reject Polotno, CE.SDK-as-core, Craft.js, Toast UI, and a second Fabric/Konva document engine.
