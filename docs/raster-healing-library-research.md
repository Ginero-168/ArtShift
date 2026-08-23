# Raster Retouching Research for ArtShift

> Research date: 22 August 2026
>
> Scope: libraries, browser editors, and APIs that can add Photoshop-like raster retouching to ArtShift, with emphasis on Healing Brush, Spot Healing, blemish removal, clone stamping, and masked inpainting.
>
> Source policy: primary sources only — official documentation, official repositories, and first-party API references. This document does not modify application source code.

## Executive recommendation

ArtShift should use a hybrid design with two explicit execution modes:

1. **Eco / local-first:** keep the original raster and non-destructive brush/mask operations in ArtShift, then run a small-region inpainting job in a Web Worker using **OpenCV.js `cv.inpaint`**. Add a separate deterministic **Clone** mode for cases where preserving the subject's exact texture matters more than automatic reconstruction.
2. **Fast / API:** send only the selected crop plus mask to a server-side adapter. Prefer **Adobe Firefly Services Fill Masked Areas** when controlled cloud inpainting is the goal; use **Cloudinary Generative Remove/Restore** or **OpenAI GPT Image** when generative variation is acceptable.
3. **Full Photoshop-like fallback:** use **Photopea** or a licensed editor such as **Pintura** as an optional advanced editor, not as the core ArtShift canvas engine. Photopea already exposes Spot Healing Brush, Healing Brush, and Clone Tool, but it is a hosted editor/iframe boundary rather than a native ArtShift object.

The strongest first implementation is therefore **OpenCV.js in a Worker for Eco + an API adapter for Fast**. `libvips`/WASM and `image-js` are useful supporting tools for decode, resize, filters, masks, and export, but the official capabilities reviewed here do not make either one a ready-made Healing Brush engine.

## What “Photoshop-like retouching” actually contains

These are different operations and should not be represented as one generic “AI edit”:

| Operation | Expected behavior | Best technical family |
|---|---|---|
| Spot Healing / blemish removal | Paint a small defect; reconstruct from nearby pixels while blending texture | Local inpainting |
| Healing Brush | Sample a source region, then adapt its tone/texture to the destination | Clone sampling + tone/gradient blending |
| Clone Stamp | Copy a source region with a user-controlled offset and brush opacity | Deterministic pixel copy/composite |
| Object removal | Remove a larger object and synthesize the background | Inpainting or generative fill |
| Seamless clone | Blend a source patch into a destination using gradients/Poisson blending | `seamlessClone` or an equivalent native/WASM implementation |

This distinction matters for ArtShift: a generative API can produce a visually pleasing result but is not a deterministic replacement for a Healing Brush. A local inpainting result should be reversible and stored as an operation/mask, not overwrite the original image immediately.

## Comparison matrix

| Option | Relevant capability | Eco/local feasibility | Worker/WASM and performance | License / commercial risk | ArtShift fit |
|---|---|---|---|---|---|
| **OpenCV.js** | `cv.inpaint` is exposed in the official JavaScript method whitelist. Native OpenCV also documents `seamlessClone`, but it is not in the current official JS whitelist. | Strong. Runs in the browser after bundling or serving the WASM build. | Official build supports WASM, optional threads, and optional SIMD. Threads/SIMD require browser/hosting compatibility checks. Use a Worker and small ROI jobs. | OpenCV 4.5+ is Apache 2.0 according to the official license notice. | **Best Eco foundation.** Use `inpaint` first; implement Clone separately; do not assume `seamlessClone` is available without a custom build. |
| **libvips + `wasm-vips`** | Fast, low-memory, demand-driven image pipelines; convolution, compositing, embedding, resize, and format processing. No documented inpaint/healing operation in the reviewed official operation lists. | Possible, but the browser binding is a separate third-party WASM project and is not the simplest path for interactive retouching. | `wasm-vips` requires SIMD and exception handling; browser use requires `SharedArrayBuffer` plus COOP/COEP headers and same-directory WASM assets. The project describes itself as early development. | libvips is LGPL-2.1-or-later; the `wasm-vips` repository is MIT. Track both layers and their transitive dependencies. | **Supporting pipeline only.** Good for large image processing/export, not the first Healing Brush engine. |
| **image-js** | JavaScript image/mask operations, convolution, morphology, median filtering, drawing, and `paintMaskOnImage`; no documented `inpaint`, healing, or clone-stamp primitive in the official API index. | Good for small utility operations and browser use; no ready-made retouch engine. | JavaScript implementation is easy to isolate in a Worker, but the reviewed docs do not describe a specialized WASM or tiled retouch runtime. | MIT. | **Utility layer, not healing core.** Useful for mask preparation, previews, and tests. |
| **Photopea API/editor** | Official tool IDs include Spot Healing Brush, Healing Brush, Patch Tool, Content-Aware Move, and Clone Tool. | Not a local/offline library. It is loaded from Photopea, although files can be passed with data URIs and the editor can be embedded in an iframe. | Mature editor UX is supplied by the hosted boundary; ArtShift must exchange files/scripts and handle save/export messages. | API documentation says usage is free; white-label/distributor options exist. It is not an ArtShift-owned renderer and the API page warns about critical bugs and responsibility for edited documents. | **Best immediate manual Photoshop-like option**, but isolate it as an optional modal/editor bridge and import the result as a raster/PSD handoff. |
| **miniPaint** | Browser editor; official README lists Clone and Content Fill tools and says nothing is sent to a server. | Stronger local/self-hosting story than Photopea. Can be embedded, but it is a separate editor rather than a React-native ArtShift component. | HTML5/browser implementation; performance and state integration would need profiling for ArtShift-sized images. | MIT. | **Useful reference or optional embedded editor.** It has Clone, not a documented Healing Brush, so it does not fully solve blemish retouching. |
| **Pintura + Retouch plugin** | Paid JavaScript SDK with React/Next integrations. Retouch is designed to connect third-party AI services for generative AI, inpainting, clean-up defects, and retouching, with non-destructive image-space shapes. | Browser-integrated, but the retouch algorithm/service is not presented as a built-in offline Healing Brush. | Designed as an editor SDK; the integration still needs an AI service for the retouch operation and must be tested with ArtShift's canvas/state model. | Commercial, all rights reserved; test builds add a watermark. | **Good paid UI component** if ArtShift wants an editor surface and accepts licensing plus an external AI adapter. |
| **Adobe Firefly Services / Photoshop API** | Official Fill Masked Areas guide documents cloud image inpainting: input image + mask, output image with masked holes filled. Adobe UXP also documents `HEALINGBRUSH` and `CLONESTAMP` tool types for Photoshop-hosted plugins. | Cloud API is not Eco/offline. UXP is local to a Photoshop desktop host, not a Next.js browser runtime. | Cloud job is asynchronous and storage/credential based; UXP can use Photoshop's native engine but requires Photoshop. | Photoshop API access is Enterprise-oriented according to Adobe's FAQ; Firefly Services requires credentials. | **Strong Fast candidate for controlled inpainting.** UXP is a separate desktop-plugin path, not a web-library integration. |
| **Cloudinary Generative Remove/Restore** | `e_gen_remove` removes unwanted regions/objects and fills realistic pixels; `e_gen_restore` addresses compression artifacts, noise, and blur. | Cloud-only media pipeline. | URL/API transformation is easy to queue, but results can be pending and large inputs may be downscaled/upscaled. | Paid transformation counts/add-ons apply; Cloudinary documents special counts for generative effects. | **Good Fast service for object cleanup and restoration**, not deterministic pixel-level Healing Brush. |
| **OpenAI GPT Image 2** | Official image editing endpoint accepts an image, mask, and prompt. The docs explicitly say masking is prompt-based and may not follow the exact mask shape with complete precision. | Cloud-only and paid API; not a local algorithm. | Server-side request/response; high-fidelity image inputs can increase input-token cost. | API key, organization verification may be required for GPT Image models, and usage is billed. | **Good Fast generative fallback**, but not suitable when the user expects exact Photoshop-style brush fidelity. |

## Detailed findings

### 1. OpenCV.js: best local base for blemish removal

OpenCV's official inpainting API restores a selected region from its neighborhood. The documented inputs are an image, a single-channel non-zero mask, an inpaint radius, and either the Navier–Stokes or Telea method. The documentation specifically names dust, scratches, and unwanted objects as use cases: [OpenCV Inpainting](https://docs.opencv.org/4.13.0/d7/d8b/group__photo__inpaint.html).

The current OpenCV JavaScript configuration explicitly whitelists `photo.inpaint`: [official `opencv_js.config.py`](https://github.com/opencv/opencv/blob/4.x/platforms/js/opencv_js.config.py#L1028-L1048). This is important because OpenCV.js exposes a selected subset of native OpenCV, not every C++ function.

Native OpenCV documents `seamlessClone` for blending a source image/mask into a destination using Poisson-style gradient blending: [OpenCV Seamless Cloning](https://docs.opencv.org/4.13.0/df/da0/group__photo__clone.html). However, `seamlessClone` is not listed beside `inpaint` in the current official JavaScript whitelist. Treat browser access as unavailable unless ArtShift owns and tests a custom OpenCV.js build. This avoids designing around an API that may compile in native OpenCV but be `undefined` in the browser bundle.

OpenCV's official JavaScript setup documents an Emscripten/WASM build, a separate `.wasm` option for production, optional threads, and optional SIMD: [Build OpenCV.js](https://github.com/opencv/opencv/blob/4.x/doc/js_tutorials/js_setup/js_setup/js_setup.markdown). The same guide notes that thread builds require browser WebAssembly threads support and that SIMD is experimental in the documented setup. For ArtShift, the safe default is a single-thread Worker first, then capability-based loading of optimized builds after profiling.

**Suggested local mapping:**

- `Spot Heal`: make a soft brush mask and run `cv.inpaint` on a padded local ROI at commit time.
- `Clone`: copy pixels from an offset source region with a feathered brush; this can be implemented independently of OpenCV.js and remains deterministic.
- `Healing Brush`: start with Clone plus local tone/gradient matching; use `cv.inpaint` as the small-defect fallback rather than claiming it is a full Adobe Healing Brush.
- `Seamless Clone`: defer until a custom build or another verified implementation is available.

### 2. libvips and `wasm-vips`: excellent processing pipeline, wrong first primitive

The official libvips repository describes a demand-driven, horizontally threaded image-processing library with low memory use and roughly 300 operations across convolution, morphology, resampling, color, and related areas: [libvips repository](https://github.com/libvips/libvips). Its license is LGPL-2.1-or-later.

The `wasm-vips` project compiles libvips for the browser and Node.js and describes a streaming pipeline model that avoids keeping entire images in memory. It also documents an important browser constraint: `SharedArrayBuffer` plus `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`: [wasm-vips repository](https://github.com/kleisauke/wasm-vips#browser). The repository calls the project early development and requires WASM SIMD and exception handling.

The reviewed official libvips operation documentation covers useful building blocks such as `composite`, `conv`, and `embed`, but does not document an inpaint/healing operation: [pyvips image operation list](https://libvips.github.io/pyvips/vimage.html). That makes it a good candidate for decode, resize, color transforms, filtering, tiling, and export — not a drop-in Spot Healing Brush.

**Risks for ArtShift:** COOP/COEP headers can affect third-party resources and iframe integrations; WASM assets need their own loading and caching path; pixel operations still need a Worker and explicit memory lifecycle; and the LGPL/core plus MIT wrapper licensing must be tracked separately.

### 3. image-js: useful JavaScript primitives, no documented healing engine

The official project describes image-js as image processing and manipulation in JavaScript and uses the MIT license: [image-js repository](https://github.com/image-js/image-js). Its API includes masks, convolution, morphology, median filtering, drawing, and `paintMaskOnImage`: [image-js API index](https://api.image-js.org/), [paintMaskOnImage](https://api.image-js.org/functions/index.paintMaskOnImage.html), and [medianFilter](https://api.image-js.org/functions/index.medianFilter.html).

The official API index reviewed for this report does not expose a function named `inpaint`, `heal`, `cloneStamp`, or `seamlessClone`. That is an absence in the documented API, not a claim that the primitives cannot be composed manually. ArtShift could use image-js for mask cleanup, brush preview helpers, pixel assertions, or simple filters, but implementing a high-quality Healing Brush on top would still be ArtShift-owned algorithm work.

### 4. Browser editors with actual retouch tools

#### Photopea

Photopea is the closest browser-native experience to the requested Photoshop workflow. Its official environment documentation lists tool IDs for Spot Healing Brush, Healing Brush, Patch Tool, Content-Aware Move, and Clone Tool: [Photopea environment/tool IDs](https://www.photopea.com/api/environment#tool-ids).

Its API accepts a JSON configuration after the URL hash, can be loaded in an iframe, supports data URIs, can load resources such as brushes, and can send exported data to a server: [Photopea API](https://www.photopea.com/api/). The API documentation says usage is free, but also states that the editor is in early stages and disclaims responsibility for edited/generated documents. It is therefore best treated as an optional external editor boundary, not as a replacement for ArtShift's own document model.

**Integration shape:** export the selected raster plus metadata to Photopea, let the user retouch, then receive PNG/PSD/other output through the documented save channel. The result becomes a derived raster version in ArtShift; live synchronization of ArtShift objects, masks, and history should not be assumed.

#### miniPaint

miniPaint is an open-source browser editor. Its official README says that editing happens directly in the browser and that nothing is sent to a server; its feature list includes Clone and Content Fill: [miniPaint repository](https://github.com/viliusle/miniPaint). The repository is MIT licensed and documents iframe embedding.

It is attractive for a local/self-hosted prototype, but the official feature list does not document a Healing Brush or Spot Healing Brush. It is therefore a Clone-capable embedded editor, not a complete answer to blemish removal. The separate editor state and UI would also need an explicit import/export boundary in ArtShift.

#### Pintura

Pintura provides framework adapters including React and Next.js. Its official Retouch plugin is specifically designed to connect third-party AI services for generative AI, inpainting, clean-up defects, and retouching, and stores image-space shapes non-destructively: [Pintura Retouch plugin](https://pqina.nl/pintura/docs/v8/api/plugins/retouch/), [Pintura installation](https://pqina.nl/pintura/docs/v8/installation/).

This is a commercial SDK. The official installation page describes a test build with a watermark, and the product site is not open source. It can shorten UI development if ArtShift is willing to buy a license and accept a third-party retouch-service integration, but it does not remove the need to choose or operate the actual inpainting/AI backend.

For completeness, Toast UI Image Editor is a well-known MIT canvas component, but its official feature list covers crop, drawing, shapes, masks, and filters — not Clone, Healing Brush, or inpainting: [Toast UI Image Editor repository](https://github.com/nhn/tui.image-editor). It should not be selected for this particular feature merely because it is a convenient React image editor.

### 5. Paid API and desktop-host options

#### Adobe Firefly Services / Photoshop API

Adobe's official Fill Masked Areas guide documents image inpainting: the API accepts an image and mask and returns the masked holes filled with generated content. The guide uses supported cloud storage URLs, credentials, and an asynchronous job/status flow: [Adobe Inpainting with Fill Mask](https://developer.adobe.com/firefly-services/docs/photoshop/guides/using-fill-mask/).

Adobe also exposes a more exact desktop-host path through Photoshop UXP. The official `PathItem.strokePath` reference says that `ToolType.CLONESTAMP` and `ToolType.HEALINGBRUSH` can be used and require a `sourceOrigin`: [Adobe UXP `PathItem.strokePath`](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/pathitem), [Adobe UXP tool constants](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/modules/constants#tooltype).

This distinction is important:

- **Firefly/Photoshop cloud API:** suitable for Fast inpainting, but not documented as a pixel-perfect interactive Healing Brush.
- **Photoshop UXP:** closest to native Adobe Healing Brush behavior, but requires Photoshop as the host and is not a browser-only Next.js integration.
- **Photoshop Actions API:** useful for recorded, repeatable workflows, but Adobe's FAQ says not all Photoshop features are available and access is Enterprise-oriented; do not assume a recorded brush interaction will be a supported server operation. See [Adobe Photoshop API FAQ](https://developer.adobe.com/photoshop/api/faq/index.html) and [Photoshop Actions](https://developer.adobe.com/firefly-services/docs/photoshop/guides/photoshop-actions/).

#### Cloudinary

Cloudinary documents `e_gen_remove` as generative removal of unwanted image parts with realistic replacement pixels, using prompts or regions. It also documents `e_gen_restore` for degraded images, compression artifacts, noise, and blur: [Cloudinary Generative AI Transformations](https://cloudinary.com/documentation/generative_ai_transformations), [Transformation Reference — `gen_remove`/`gen_restore`](https://cloudinary.com/documentation/transformation_reference#gen_remove).

The official transformation reference warns that generative results are not guaranteed to be accurate and that large inputs can be downscaled and upscaled. It also documents special transformation counts for generative operations: [Cloudinary Transformation Counts](https://cloudinary.com/documentation/transformation_counts).

Cloudinary is a good Fast adapter for object removal, background cleanup, and restoration at scale. It is not a deterministic brush engine and should not replace the Eco local path for small blemishes where the user expects exact control.

#### OpenAI GPT Image

OpenAI's official image-generation guide documents editing existing images with the Image API and Responses API, including an image plus mask workflow: [OpenAI Image Generation guide](https://developers.openai.com/api/docs/guides/image-generation#edit-an-image-using-a-mask).

The guide explicitly states that masking is prompt-based and that the model may not follow the exact mask shape with complete precision. It also states that edit requests include image input costs and that `gpt-image-2` processes image inputs at high fidelity: [OpenAI mask requirements and fidelity](https://developers.openai.com/api/docs/guides/image-generation#mask-requirements).

This is a strong Fast generative fallback for “remove this blemish/object and make the surrounding area look natural,” but it is not a Photoshop Healing Brush. It can change pixels outside the user's intended stroke and should return a new version with a clear “AI-generated retouch” label and undo path.

## Recommended ArtShift architecture

### Eco / local mode

1. Keep the original image immutable.
2. Store brush strokes as compact, non-destructive operations: mode, points, radius, hardness, opacity, source offset where relevant, and target image revision.
3. Render a lightweight preview while the pointer moves. Do not run full-resolution inpainting for every pointer event.
4. On pointer-up, crop a padded ROI, transfer the pixel buffer to a dedicated Worker, and run OpenCV.js `cv.inpaint` only on that ROI.
5. For large images, use a preview pyramid for interaction and a full-resolution commit job. Keep the last good render visible while the commit is running.
6. Store the resulting tile/operation separately so undo, reload, export, and API fallback do not destroy the source raster.
7. Add explicit tools: **Spot Heal**, **Clone**, and later **AI Retouch**. Do not hide different algorithms behind one ambiguous “Erase” button.

### Fast / API mode

1. Keep API keys and provider calls on a Next.js server route, never in the browser bundle.
2. Send the smallest possible crop and mask, not the entire document, unless the provider requires the full image.
3. Create a provider-neutral job contract: `provider`, `operation`, `inputRevision`, `mask`, `status`, `resultAsset`, `error`, and `provenance`.
4. Preserve the original and create a derived raster revision for every API result.
5. Make asynchronous completion, retry, cancellation, quota, cost estimate, and provider failure visible in the UI.
6. Require explicit user confirmation before uploading a private photo; record retention/deletion policy for remote assets.

### Optional advanced-editor bridge

Use Photopea or Pintura only when the user needs a broad manual editor surface immediately. Treat the boundary as import/export:

```text
ArtShift raster + crop
        ↓
optional Photopea / Pintura editor
        ↓
PNG/PSD/derived raster + provenance
        ↓
ArtShift image revision
```

Do not try to synchronize every Photopea/Pintura layer and history item into the ArtShift object graph in the first version. That would create a second document model and reintroduce the exact stability/performance risks ArtShift is trying to avoid.

## Integration and performance risks

### Browser/WASM

- WASM startup and bundle size can cause the UI to appear frozen if the module is loaded on the main path. Lazy-load it only when a raster retouch tool is first opened.
- `cv.Mat`/WASM allocations must be explicitly released after each job. A long retouch session is a memory-leak stress test.
- Use Workers, `ArrayBuffer` transfer, `ImageBitmap`, or `OffscreenCanvas` where supported; never copy a full multi-megapixel image on every pointer move.
- `wasm-vips`'s COOP/COEP requirement can conflict with third-party iframes, remote fonts, image hosts, or other cross-origin resources. Adopt those headers only after an application-wide compatibility audit.
- Threaded WASM and SIMD need capability detection plus a single-thread fallback. They must not be assumed from the desktop machine's CPU.

### Image correctness

- Normalize EXIF orientation before generating masks and map the result back to the ArtShift image coordinate system.
- Preserve alpha and premultiplication rules. Inpainting on RGB and then compositing into RGBA can create halos if the transparent edge is treated as black.
- Track color profile and bit depth. OpenCV's documented `inpaint` input constraints are narrower than a full Photoshop pipeline.
- Test portrait skin, hair, text, thin lines, repeated patterns, transparent backgrounds, high zoom, and images larger than the viewport.
- Make “no suitable source pixels” and “ROI too close to image edge” explicit failure states rather than silently producing a flat patch.

### State, undo, and persistence

- Do not append a full base64 image to history for every stroke.
- Store strokes plus an operation revision, then checkpoint derived tiles or a flattened cache at controlled intervals.
- Keep the original image asset immutable so a failed API request or worker crash cannot replace it with a blank/partial result.
- Render the same operation graph in preview and export; otherwise the user will see one retouch in the editor and another in the final PNG/PDF.

### Remote services

- Remote results are asynchronous, non-deterministic, and potentially billable.
- Provider limits, model versions, region restrictions, storage URLs, and retention rules can change independently of ArtShift releases.
- A provider result should include provenance and the exact prompt/mask/provider/model metadata so the user can reproduce or reject it later.
- Never make the Fast path the only path for sensitive images or offline work.

## Decision

| Decision | Recommendation |
|---|---|
| First local algorithm | **OpenCV.js `cv.inpaint` in a Worker**, limited to padded ROI commits |
| First deterministic manual tool | **Clone** with source offset and feathered brush; later add tone matching for Healing Brush behavior |
| First cloud inpainting adapter | **Adobe Firefly Services Fill Masked Areas**, subject to account/contract and storage requirements |
| Fast generative fallback | Cloudinary `e_gen_remove` for object cleanup; OpenAI GPT Image for prompt-driven edits when mask exactness is acceptable |
| Full manual editor option | Photopea bridge for immediate Spot Healing/Healing/Clone; import/export only |
| Supporting image pipeline | libvips/WASM or image-js only after a measured need for decode/resize/filter/mask utilities |
| Avoid as first step | Building around OpenCV.js `seamlessClone`, because the current official JS whitelist does not expose it |

## Suggested implementation phases

1. **Retouch contract and fixtures:** define operation types, ROI coordinate mapping, provenance, undo semantics, and representative portrait/texture fixtures.
2. **Eco Spot Heal:** add the Worker boundary and OpenCV.js `inpaint` on small ROIs; benchmark pointer preview, commit time, memory, and export parity.
3. **Eco Clone:** add source-point selection, feathered stamping, edge handling, and deterministic tests.
4. **Fast provider adapter:** add one server-side provider behind a neutral job interface; start with masked crops and explicit consent.
5. **AI Retouch UX:** expose provider, estimated cost/latency, result provenance, accept/reject, retry, and revert.
6. **Optional editor bridge:** evaluate Photopea or Pintura only after the native ArtShift retouch path has stable import/export and recovery behavior.

## Primary sources

- [OpenCV.js usage and build documentation](https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html)
- [OpenCV.js build setup and WASM/thread/SIMD options](https://github.com/opencv/opencv/blob/4.x/doc/js_tutorials/js_setup/js_setup/js_setup.markdown)
- [OpenCV.js JavaScript method whitelist](https://github.com/opencv/opencv/blob/4.x/platforms/js/opencv_js.config.py)
- [OpenCV inpainting API](https://docs.opencv.org/4.13.0/d7/d8b/group__photo__inpaint.html)
- [OpenCV seamless cloning API](https://docs.opencv.org/4.13.0/df/da0/group__photo__clone.html)
- [OpenCV license change notice](https://github.com/opencv/opencv/blob/4.x/doc/LICENSE_CHANGE_NOTICE.txt)
- [libvips official repository](https://github.com/libvips/libvips)
- [wasm-vips browser requirements and repository](https://github.com/kleisauke/wasm-vips)
- [pyvips/libvips image operation documentation](https://libvips.github.io/pyvips/vimage.html)
- [image-js official repository](https://github.com/image-js/image-js)
- [image-js API index](https://api.image-js.org/)
- [Photopea API](https://www.photopea.com/api/)
- [Photopea tool IDs](https://www.photopea.com/api/environment#tool-ids)
- [miniPaint official repository](https://github.com/viliusle/miniPaint)
- [Pintura Retouch plugin](https://pqina.nl/pintura/docs/v8/api/plugins/retouch/)
- [Pintura installation and framework integrations](https://pqina.nl/pintura/docs/v8/installation/)
- [Toast UI Image Editor official repository](https://github.com/nhn/tui.image-editor)
- [Adobe Fill Masked Areas / inpainting](https://developer.adobe.com/firefly-services/docs/photoshop/guides/using-fill-mask/)
- [Adobe Photoshop UXP `PathItem.strokePath`](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/pathitem)
- [Adobe Photoshop UXP tool constants](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/modules/constants#tooltype)
- [Adobe Photoshop API FAQ](https://developer.adobe.com/photoshop/api/faq/index.html)
- [Cloudinary Generative AI Transformations](https://cloudinary.com/documentation/generative_ai_transformations)
- [Cloudinary Transformation Reference](https://cloudinary.com/documentation/transformation_reference)
- [Cloudinary Transformation Counts](https://cloudinary.com/documentation/transformation_counts)
- [OpenAI Image Generation and Editing guide](https://developers.openai.com/api/docs/guides/image-generation)
