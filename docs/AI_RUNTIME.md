# ArtShift AI Runtime

ArtShift exposes one task-level `AiRuntime` seam to the application. UI and domain code select an ArtShift task/profile/alias; they never send provider URLs, API keys or arbitrary model slugs.

## Boundaries

- `lib/ai-runtime/` owns public contracts, locality policy, routing behavior, result caching and usage normalization.
- `lib/server/ai/modelManifest.ts` owns stable aliases, provider/model mapping, pinned Replicate wrapper versions, price estimates and preflight cost ceilings.
- `lib/server/ai/adapters/` contains one adapter per external provider. Provider-native fields stop at this directory.
- `app/api/ai/execute` validates public task payloads and exposes only Vision, prompt enhancement and image generation. Assistant tools/system prompts remain private to `app/api/chat`.
- `app/api/ai/status` exposes readiness, model aliases, usage/budget estimates and cache control without returning secrets.
- `RasterProcessor` remains a separate deep module. Remove BG, Extract Objects, selection and pixel masks are browser-local and are intentionally absent from the cloud route table.

## Locality and fallback

| Task | Policy |
|---|---|
| Assistant chat | Cloud required after an explicit user chat action |
| Vision describe/propose/OCR | Cloud opt-in; `cloudConsent: true` is required |
| Prompt enhancement | Cloud opt-in with a deterministic local enrichment fallback in AI Image Studio |
| Image generation | Cloud required after an explicit Generate action |
| Remove BG / Extract / pixel mask | Local-only; no server task exists |

Fallback is off by default. A caller must set `allowFallback: true`; otherwise the runtime tries only the selected route target. This prevents a hidden paid fallback when the primary provider is unavailable.

## Cost, cache and telemetry

- `AI_MONTHLY_BUDGET_USD` blocks new jobs when the in-memory monthly estimate reaches the limit.
- Route targets may define `expectedMaxUsd`; `maxCostUsd` is checked before a provider call and actual normalized usage is checked after it.
- Usage records contain provider, actual model/version, task, latency, token counts, cost estimate and normalized error only. Raw prompts and images are not logged.
- Cache keys are SHA-256 digests of normalized requests. Raw image data URLs and prompts are not stored in cache keys.
- The current ledger/result cache are process-memory controls. They reset on server restart and are not a billing source of truth; use provider billing plus durable storage before multi-instance production rollout.

## Adding or changing a provider

1. Add or update an adapter that implements `AiProviderAdapter`.
2. Keep provider request/response types inside that adapter and validate model output as untrusted data.
3. Add stable aliases and pinned models to `modelManifest.ts`; do not add provider model fields to UI components.
4. Declare task locality in `policy.ts`. Never add local-only raster/image extraction tasks to the cloud table.
5. Add an adapter contract fixture for success, malformed output, timeout/abort, 429 and 5xx behavior.
6. Run `npm run verify`; provider integration tests that spend money must remain behind explicit environment flags.
7. Check `/api/ai/status` and the Model Manager before enabling a new alias in UI.

The provider contract research and primary-source links are in [ai-provider-contracts.md](ai-provider-contracts.md).

Use `npm run benchmark:ai` for local runtime overhead. A real provider smoke test is intentionally skipped by default; run it only with `RUN_AI_PROVIDER_INTEGRATION=1 npm test -- tests/aiProvider.integration.test.ts` and a configured Replicate token.
