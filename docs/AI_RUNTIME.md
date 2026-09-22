# ArtShift AI Runtime

ArtShift exposes one task-level `AiRuntime` seam to the application and one user-facing **AI Assistance** chat. The chat is local-first and automatically chooses deterministic edits, built-in tool commands or a reviewed Design Agent turn; users never select an execution mode. UI and domain code select an ArtShift task/profile/alias; they never send provider URLs, API keys or arbitrary model slugs.

## Boundaries

- `lib/ai-runtime/` owns public contracts, locality policy, routing behavior, result caching and usage normalization.
- `lib/server/ai/modelManifest.ts` owns stable aliases, provider/model mapping, pinned Replicate wrapper versions, price estimates and preflight cost ceilings.
- `lib/server/ai/adapters/` contains one adapter per external provider. Provider-native fields stop at this directory.
- `app/api/ai/execute` validates public task payloads and exposes Vision, Recraft vectorization, prompt enhancement and image generation. The single assistant system prompt and planning tools remain private to `/api/ai/director`; `/api/design-agent` is a compatibility adapter with no independent model or planning logic, and `/api/chat` is a 410 tombstone.
- `app/api/ai/status` exposes readiness, model aliases, usage/budget estimates and cache control without returning secrets.
- `RasterProcessor` remains a separate deep module. Remove BG and Extract Objects start in the browser; an explicit VPS-local RMBG fallback is available when the browser RMBG model is not ready. Extraction geometry comes from alpha components with SAM 2 mask refinement, not from a vision-language detector. Selection and pixel masks remain browser-local and are intentionally absent from the cloud route table.
- `components/AI/AICoPilotBar.tsx` owns the single chat surface. `lib/ai/unifiedSystem.ts` keeps its routing seam small: deterministic plan, local tool, then the ArtShift Orchestrator. Image prompts additionally pass through `lib/ai/visualOrchestrator.ts` and the context-aware orchestration modules, which own capability-alias planning without exposing provider selection to the UI.
- Built-in tool commands are explicit user actions and commit through their existing atomic editor operations; remote Design Agent proposals are always reviewable before Apply.

## Visual Orchestrator Kernel

`planVisualRequest(prompt, context)` is the narrow routing seam for image requests. It derives a user intent and task class, selects a capability alias, records whether visual analysis is required, and returns a route plan for the ArtShift Orchestrator. It never accepts a provider URL, API key, or arbitrary model id.

The current registry deliberately exposes availability:

- `IMAGE_DEFAULT` → `image.generate` through the server-owned `image-gpt-2` alias after the intent gate. A short subject-only request remains in clarification.
- `IMAGE_TEXT`, `IMAGE_VECTOR`, `IMAGE_CREATIVE`, `IMAGE_FAST`, `IMAGE_PRO`, and `IMAGE_EDIT` → explicit unavailable states until their adapters/input contracts are wired. They route to Design Agent instead of silently using the default image route.
- `VISION_DEFAULT` → reserved for a dedicated visual-analysis transport; the plan records it as not wired rather than pretending that a text heuristic performed vision analysis.

`lib/ai/visualQualityGate.ts` runs after the generated data URL is decoded and before the result is returned to the editor. `lib/ai/orchestration/briefQualityGate.ts` then checks the hard brief constraints (prompt safety, one output, dimensions, aspect ratio and reference handoff). The local asset-analysis queue remains the semantic review stage; the UI must not claim pixel-level brief compliance when that review is unavailable.

The unified chat preserves local-first precedence: a deterministic local plan wins first, then an available simple image route may execute, while a complex or unavailable visual capability goes to the reviewable Design Agent path. The direct executor repeats the guard so callers cannot bypass the route plan.

## Locality and fallback

| Task | Policy |
|---|---|
| Assistant chat | One unified surface: local-first; complex turns use cloud only after the explicit user action and account/provider consent |
| Vision describe/propose/OCR | Cloud opt-in; `cloudConsent: true` is required |
| Recraft Vectorize (Cloud) | Cloud opt-in; the explicit Vectorize button sends the raster to Replicate and imports only validated SVG paths |
| P-Image-Upscale | Cloud opt-in; the explicit Upscale settings panel sends the raster to Replicate with a selected 8/16/32 MP target |
| Layer (Qwen Image Layered) | Cloud opt-in; the explicit Layer button sends the raster to Replicate `qwen/qwen-image-layered` and inserts RGBA layers at the Preload staging bounds |
| Moodboard AI | Cloud opt-in on Infinity Canvas; Gemini Flash expands a vibe into exactly 9, 16, or 25 distinct prompts → Replicate `openai/gpt-image-2.5-flare` at `quality: low` (~$0.012/image; 9 ≈ $0.11, 16 ≈ $0.19, 25 ≈ $0.30) into a square upright grid anchored on the shared Preload card. |
| Prompt enhancement | Cloud opt-in with a deterministic local enrichment fallback in AI Image Studio |
| Image generation | Cloud opt-in; the explicit Generate action sends the prompt to Replicate `openai/gpt-image-2` with orchestration-selected `quality: low|medium|high`; the product does not expose quality-tier modes |
| Remove BG / Extract | Local-first; explicit VPS-local RMBG fallback only when the browser RMBG model is not ready. Extract runs no vision-language detector and has no detector fallback |
| Pixel mask | Local-only; no server task exists |

Fallback is off by default. A caller must set `allowFallback: true`; otherwise the runtime tries only the selected route target. This prevents a hidden paid fallback when the primary provider is unavailable.

### Extract pipeline and fallback boundary

`Extract` is a local-only pipeline: RMBG-1.4 computes the foreground alpha and
alpha component analysis produces the extraction geometry. No vision-language
detector or mask-refinement model runs during extraction. Florence-2 stays available
for captions, OCR and phrase grounding in other surfaces, and Grounding DINO is not
part of the Extract path because it only contributed coarse labels while loading
hundreds of megabytes per action.

The only server fallback in this pipeline is background removal. When the user
explicitly enables the VPS fallback and the local RMBG model is `lazy`, `loading`,
or `failed`, the browser calls `/api/local-ai/rmbg`. The VPS runs its cached
`briaai/RMBG-1.4` runtime and returns a PNG with the computed alpha; component
analysis, mask refinement, cropping, and the final document mutation remain in the
browser. A failed VPS request falls back to the local path. There is no server
fallback for Florence-2 or any detector.

The fallback is stage-aware rather than a generic cloud AI route: it does not upload
images for background analysis or silently route paid provider work. The source
document remains unchanged until the browser receives and validates the result.

### Layer (cloud decompose)

`Layer` is a separate Option Bar action next to Extract. It does not replace Extract.
Layer is a paid cloud path: the browser requires authentication, an explicit
consent confirm, and the end-user's own Replicate BYOK credential through
`requireEndUserCloudAi` — never a shared `REPLICATE_API_TOKEN`. The dedicated
route `/api/layer/decompose` runs the `image.decomposeLayers` task against
Replicate `qwen/qwen-image-layered` (alias `qwen-image-layered`). The Layer
panel asks how many layers to split into and sends that count as `num_layers`
(live schema: integer, minimum 2, maximum 8, default 4). Leaving the control at
4 keeps the previous result. The adapter downloads each returned RGBA
PNG from `replicate.delivery`, converts them to data URLs, and the browser places
each layer as an editable image at the Preload card bounds via
`getProcessingPreviewPlacement` (to the right of the source by default, or wherever
the user dragged the Preload card — same insert point as Upscale / Remove BG /
Extract). Layers stay stacked full-frame on that placement, background first. The
source image stays where it was. Processing uses the same FIFO
`enqueueProcessingJob` / `processingPreviewInput` pattern as Extract, with tool id
`"layer"`. Before the user confirms the cloud run, ArtShift preloads the decoded
source (`preloadLayerSource`) when the image Option Bar is shown, when Layer is
hovered, and again when the Layer tool becomes active. Extract itself stays local
and is not part of that warm-up.

### Multi-Angle (cloud camera edit)

`Multi-Angle` is an Option Bar action beside Layer. It does not replace Extract,
Layer, Upscale, or chat image generation. It is a paid cloud path with the same
end-user gate as Layer: authentication, an explicit consent confirm, and the
user's own Replicate BYOK credential through `requireEndUserCloudAi` — never a
shared `REPLICATE_API_TOKEN`. The dedicated route `/api/multi-angle` runs the
`image.multiAngle` task against Replicate `qwen/qwen-edit-multiangle` (alias
`qwen-edit-multiangle`).

The panel turns the object. It is not a preview of the generated pixels and it
does not orbit a camera around a fixed box. Dragging sideways yaws the object
into `rotate_degrees` (±90; positive turns the object to the right, which is
the same view as orbiting the camera left). Dragging up or down tips the object
and snaps `vertical_tilt` (−1 top toward the viewer, 0 level, +1 underside
toward the viewer). The Angle slider repeats the yaw for keyboard access.
`use_wide_angle` is the only other control. `move_forward` stays 0. Lightning
stays on (`go_fast` true, inference steps omitted), the style prompt stays
empty, LoRA weights stay `dx8152/Qwen-Edit-2509-Multiple-angles` with
`lora_scale` 1.25, `true_guidance_scale` stays 1, aspect ratio stays
`match_input_image`, and `output_format` is `png`. The route pins
version `cf245ffa` (`cf245ffaa67a6d7d0edeb597d2fded5ab80cbf72b0dceec185d709ea99667f79`).
`disable_safety_checker` stays false. README fields `use_multiple_angles` and
`multiple_angles_strength` are not sent. Public price is about $0.03 per image.
Run places the returned image at the Preload card via
`getProcessingPreviewPlacement` / `enqueueProcessingJob` (kind `multi-angle`)
and leaves the source image in place.

### Moodboard AI (Flare low, 9 / 16 / 25)

On an **Infinity Canvas** slide, the Moodboard control accepts one short
prompt/keyword/vibe and a batch size of **9, 16, or 25** (default 9).

1. Auth + explicit consent + per-account Replicate BYOK (`requireEndUserCloudAi`)
2. A draggable Preload card (`enqueueProcessingJob`, kind `generate`) appears at
   the same kind of anchor as Upscale / Remove BG / Extract / Layer: to the right
   of the selection when that footprint is clear, otherwise a clear patch, or the
   visible viewport when the board is empty. The card is the size of the whole grid.
3. `POST /api/moodboard/expand` — Gemini Flash via the existing `creative-director`
   alias (`assistant.chat`) expands associative design directions
   (Subject / Setting / Prop / Mood / Color style) into **exactly N distinct**
   image prompts (e.g. Bangkok → tuk-tuk, street food, temples — not N copies)
4. `POST /api/moodboard/generate` × N — each call runs `image.generate` with alias
   `gpt-image-2.5-flare` → Official Replicate `openai/gpt-image-2.5-flare`,
   `quality: "low"`, `aspect_ratio: "1:1"`, `number_of_images: 1`,
   `output_format: "webp"`. ~**$0.012**/image (9 ≈ **$0.11**, 16 ≈ **$0.19**,
   25 ≈ **$0.30**). The Replicate BYOK token is sent; `openai_api_key` is not.
   Gemini is not used for pixels. Chat image routes stay on Sunburst.
5. Successful images are placed as upright EngineElements in an **N×N grid**
   whose origin is `getProcessingPreviewPlacement` (so a dragged Preload card
   wins). Partial failures are shown in the UI. The shared `/api/stock` route
   remains for other surfaces; Moodboard no longer starts a stock fill.

During Remove BG, Extract, Layer, Multi-Angle, and Vectorize, the browser renders a transient duplicate
preview at the source size to the right of the source. The preview owns the loading
indicator and swipe animation but is not an editor element or undo entry. Processing
requests use one FIFO queue, so moving/deselecting the source does not cancel or hide
the active preview; later requests remain visible as queued previews and run in order.

### Vectorizer backends

The Vectorize panel exposes two separate actions/settings buttons:

- `Custom Auto-Trace` opens the original ArtShift settings and remains the
  compatibility path.
- `VTracer WASM` opens its own native settings (geometry, composition,
  clustering, sensitivity, noise, and simplification).

The two panels keep independent settings; switching between them does not
overwrite the other engine's preset or controls.

`Recraft Vectorize (Cloud)` is a separate action with no shared local preset
state. It uses the authenticated user's Replicate BYOK credential through the
`vectorize.recraft` task and the stable `recraft-vectorize` alias. The button
shows a cloud-cost consent dialog; it does not silently fall back to Custom or
VTracer. The server sends only the allowlisted raster input to
`recraft-ai/recraft-vectorize`, rejects non-Replicate output URLs and unsafe
SVG content, downloads the returned SVG, and only then sends it to the browser
adapter. The browser reads the SVG viewport and commits all valid editable
paths in one editor mutation. Recraft's documented limits are PNG/JPG/WEBP,
5 MB, 16 MP, 4096 px maximum dimension and 256 px minimum dimension.

`Custom Auto-Trace` returns native `VectorPathElement[]` directly from the
existing TypeScript Worker. `VTracer WASM` loads the pinned official
VisionCortex core from `public/wasm/vtracer/` in that Worker, returns SVG, and
the ArtShift adapter validates it before the single `addElements` mutation. If
the VTracer Worker/runtime fails, the orchestration layer switches to Custom
instead of running synchronous VTracer on the main thread and reports that
fallback in the UI.

`Image generation` is a cloud-opt-in task. The browser must set `cloudConsent: true`
only after an explicit user action/confirmation; the server rejects missing consent.
The server ignores browser model/provider choices and routes the request through the
authenticated user's Replicate BYOK credential to the fixed official model
`openai/gpt-image-2`. The adapter sends the orchestrator-selected quality, one output,
the requested aspect ratio, `output_format: "webp"`, `background: "opaque"`, and
`moderation: "auto"`. When a selected-image tag is part of the task, the verified
local reference is sent as `input_images` only after consent. Input count, data URL
format and encoded size are bounded before the provider call. GPT Image 2 does not
expose deterministic seed control, so ArtShift accepts the legacy field for
compatibility but never forwards it upstream. The prediction output is fetched
server-side only from an HTTPS `replicate.delivery` host, bounded, validated as an
image, and converted to a data URL before it reaches the browser. No Replicate token,
raw image payload or provider delivery URL is logged or sent to client prose, and
there is no hidden paid fallback route for image generation.

The VTracer binary is built from `wasm/vtracer-browser/` with:

```bash
npm run build:vtracer-wasm
```

`npm run build` and `npm run verify` also run `verify:vtracer-wasm`, which checks
the committed JS/WASM magic, exported function, and SHA-256 before Next.js is
built. The build helper pins `wasm-pack 0.13.1` and stages the new runtime
before swapping it into `public/wasm/vtracer/`.

`VTracer` quality defaults and control semantics are documented in
[vtracer-quality-tuning.md](vtracer-quality-tuning.md).

This is a local algorithmic raster-to-vector runtime, not a neural model and not
an image upload route. VTracer version changes must be benchmarked against the
existing backend because SVG subpaths, holes, limits, and option mappings can
differ.

## Cost, cache and telemetry

- Usage metadata remains available for diagnostics, but the server does not block AI Chat or image generation by monthly or per-command cost while quality-first mode is active.
- Usage records contain provider, actual model/version, task, latency, token counts, cost estimate and normalized error only. Raw prompts and images are not logged.
- Cache keys are SHA-256 digests of normalized requests. Raw image data URLs and prompts are not stored in cache keys.
- The current ledger/result cache are process-memory controls. They reset on server restart and are not a billing source of truth; use provider billing plus durable storage before multi-instance production rollout.

## Adding or changing a provider

1. Add or update an adapter that implements `AiProviderAdapter`.
2. Keep provider request/response types inside that adapter and validate model output as untrusted data.
3. Add stable aliases and pinned models to `modelManifest.ts`; do not add provider model fields to UI components.
4. Declare task locality in `policy.ts`. Keep pixel-mask work local-only; add any future extraction fallback as an explicit server-local stage with consent and bounded resources, never as an implicit paid cloud route.
5. Add an adapter contract fixture for success, malformed output, timeout/abort, 429 and 5xx behavior.
6. Run `npm run verify`; provider integration tests that spend money must remain behind explicit environment flags.
7. Check `/api/ai/status` and the Model Manager before enabling a new alias in UI.

The provider contract research and primary-source links are in [ai-provider-contracts.md](ai-provider-contracts.md).

Use `npm run benchmark:ai` for local runtime overhead. A real provider smoke test is intentionally skipped by default; run it only with `RUN_AI_PROVIDER_INTEGRATION=1 npm test -- tests/aiProvider.integration.test.ts` and an authenticated user/provider test setup. Never add a server-wide Replicate token.
