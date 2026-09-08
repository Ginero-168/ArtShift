# ArtShift AI Runtime

ArtShift exposes one task-level `AiRuntime` seam to the application and one user-facing **AI Assistance** chat. The chat is local-first and automatically chooses deterministic edits, built-in tool commands or a reviewed Design Agent turn; users never select an execution mode. UI and domain code select an ArtShift task/profile/alias; they never send provider URLs, API keys or arbitrary model slugs.

## Boundaries

- `lib/ai-runtime/` owns public contracts, locality policy, routing behavior, result caching and usage normalization.
- `lib/server/ai/modelManifest.ts` owns stable aliases, provider/model mapping, pinned Replicate wrapper versions, price estimates and preflight cost ceilings.
- `lib/server/ai/adapters/` contains one adapter per external provider. Provider-native fields stop at this directory.
- `app/api/ai/execute` validates public task payloads and exposes Vision, Recraft vectorization, prompt enhancement and image generation. The single assistant system prompt and planning tools remain private to `app/api/ai/director`; `/api/design-agent` is a compatibility adapter and `/api/chat` is a 410 tombstone.
- `app/api/ai/status` exposes readiness, model aliases, usage/budget estimates and cache control without returning secrets.
- `RasterProcessor` remains a separate deep module. Remove BG and Extract Objects start in the browser; an explicit VPS-local RMBG fallback is available when the browser RMBG model is not ready. Extraction geometry comes from alpha components with SAM 2 mask refinement, not from a vision-language detector. Selection and pixel masks remain browser-local and are intentionally absent from the cloud route table.
- `components/AI/AICoPilotBar.tsx` owns the single chat surface. `lib/ai/unifiedSystem.ts` keeps its routing seam small: deterministic plan, local tool, then Design Agent. Image prompts additionally pass through `lib/ai/visualOrchestrator.ts` and the context-aware orchestration modules, which own capability-alias planning without exposing provider selection to the UI.
- Built-in tool commands are explicit user actions and commit through their existing atomic editor operations; remote Design Agent proposals are always reviewable before Apply.

## Visual Orchestrator Kernel

`planVisualRequest(prompt, context)` is the narrow planning seam for image requests. It derives a user intent and task class, selects a capability alias, records whether visual analysis is required, and returns a route plan. It never accepts a provider URL, API key, or arbitrary model id.

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

During Remove BG, Extract, and Vectorize, the browser renders a transient duplicate
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
