# ArtShift AI Architecture — 120B-First Creative Director

สถานะเอกสาร: candidate implementation, ยังไม่ deploy Production
วันที่: 2026-09-07 UTC

## Product identity

ArtShift คือ AI Design Director ที่ Thinks, Sees, Designs, Creates และ Reviews ผ่าน capability layers ที่แยกจากกัน ไม่ใช่ UI ที่เรียก Image API โดยตรง

```text
USER
  │
  ▼
Local Safety + Intent + Context Guardrails
  │
  ├── Selected/reference image ──► Local Vision Analysis
  │
  ├── Design brief ──────────────► Local Knowledge Vector Retrieval
  │
  ▼
gpt-oss-120b Creative Director (Reasoning: high)
Understand → Reason → Plan → Decide
  │
  ├── optional bounded Image Search ──► final 120B plan
  │
  ▼
Validated Specialist + Capability + Model plan
  │
  ▼
Image Generator / Image Editor ──► GPT Image 2
  │
  ▼
Technical + Brief + Local Vision Quality Gates
  │
  ▼
gpt-oss-120b Review of local Vision evidence
  │
  ├── fail ──► diagnosed repair instruction ──► bounded retry
  └── pass ──► preload ──► atomic Canvas commit
```

## Layer 1 — Thinking AI

### Implemented

- Baseline brain: `openai/gpt-oss-120b` through Replicate.
- `assistant.chat` and `prompt.enhance` route both `economy` and `quality` profiles to the same 120B Creative Director target. There is no automatic 20B downgrade.
- Replicate Harmony protocol declares `Reasoning: high` and defaults to a 4,096-token output budget.
- Creative Director can return only a validated `answer`, `clarification`, or `image-task` contract.
- It cannot mutate Canvas, choose an unregistered provider, set the task cost budget, expand retry limits, or call Image Model directly.
- `allowFallback: false`; provider crossing is never automatic.

### Source of truth

- `lib/server/ai/modelManifest.ts`
- `lib/server/ai/adapters/replicateChatProtocol.ts`
- `lib/ai/orchestration/creativeDirector.ts`
- `app/api/ai/director/route.ts`

## Layer 2 — Seeing AI

### Implemented

- Input/reference image analysis occurs before creative planning.
- The Creative Director receives only bounded summaries: caption, detected objects, OCR text, dimensions, appearance notes and limitations.
- Generated results are analyzed locally again before 120B review.
- Raw image bytes, Base64, provider delivery URLs, credentials and local image paths are rejected from director requests and task traces.

### Current models/tools

- Local-first: Florence-2 captioning, Grounding DINO detection, OCR and related browser vision tools already wired in the image analysis path.
- Cloud vision adapters exist separately for GPT/Gemini routes, but they are not silently substituted into the 120B-first image flow.

## Knowledge / Skill Retrieval

### Implemented

- Local design knowledge includes poster, branding/logo, Instagram post, product image, character, brochure and UI design guidance.
- Retrieval uses a local hashed feature embedding and cosine vector search, including Thai character features.
- Top relevant skills are placed in the untrusted context envelope before 120B planning.
- 120B may cite only skill IDs returned by retrieval; invented IDs fail validation.

### Source of truth

- `lib/ai/knowledge/designKnowledge.ts`

This is a compact local vector index, not a neural embedding service. It is intentionally dependency-free and privacy-preserving. A neural embedding/RAG backend can replace it later behind the same retrieval contract.

## Search layer

### Implemented

- `images`: bounded server-side search through Unsplash or Pexels when the corresponding server credential is configured.
- 120B decides whether image-reference search is needed and supplies narrow queries.
- At most two queries × three results are accepted, followed by exactly one 120B finalization pass.
- Only normalized HTTPS metadata is returned to the brain; credentials and raw images are never included.

### Explicitly unavailable

- `web` search
- arbitrary `website-content` retrieval

If the brain requests an unavailable source, execution stops before Image Model. The app does not pretend that search occurred.

### Source of truth

- `lib/server/ai/contextImageSearch.ts`

## Layer 3 — Creating / Transforming AI

Runtime routing is defined by `lib/ai/orchestration/creatingModelCatalog.ts`.

| Alias | Runtime status | Real capability |
|---|---|---|
| `image-gpt-2` | Available | Generate, edit |
| `local-vtracer` | Available | Local vectorize |
| `recraft-vectorize` | Available | Cloud vectorize |
| `p-image-upscale` | Available | Cloud upscale |
| `nano-banana-pro` | Unavailable | Adapter not integrated |
| `flux-2-max` | Unavailable | Adapter/price/license not validated |
| `flux-1.1-pro` | Unavailable | Adapter/price/license not validated |
| `ideogram` | Unavailable | Adapter not integrated |
| `recraft-v3` | Unavailable | Generation adapter not integrated; vectorize is separate |

An explicit request for an unknown, unavailable or capability-mismatched model fails clearly. It is never silently replaced. `detectRequestedCreatingModel()` catches explicit GPT Image, Flux, Nano Banana, Ideogram and Recraft generation preferences before any paid call.

## Layer 4 — Specialist Agent

### Implemented in the 120B path

- `image_generator`: text-to-image when no selected reference is attached.
- `image_editor`: reference-aware generation/editing when analyzed selected images are attached.
- The server validates that selected-image context and chosen specialist/capability agree.

### Existing deterministic specialists outside this new contract

- local image/background/vector/layout/copy operations remain available through their established guarded paths.
- They are not renamed as autonomous sub-agents unless the 120B contract and live wiring actually delegate to them.

## Review and iteration

1. Technical gate checks decodable output, dimensions and usable payload.
2. Brief gate checks aspect ratio/reference count and hard request constraints.
3. Local Vision checks required subjects, mandatory text and reference evidence.
4. 120B reviews only the local Vision summary against its observable `reviewCriteria`.
5. Failure must return a repair instruction; a bounded retry regenerates with a materially changed prompt.
6. Passing output is preloaded before one atomic Canvas commit. Originals are preserved.
7. Provider outcome-unknown never triggers an automatic duplicate request.

## Consent and cost boundary

- A user confirmation covers sending the brief/analysis summary to 120B, optional external image search, Image Model execution and 120B review.
- Browser cancellation propagates through the Next.js request signal into 120B execution, review and bounded search fetches; image search also has an 8-second server timeout.
- No paid live inference is used by automated tests.
- Retry count, quality policy and maximum cost remain server/application-owned; the LLM cannot enlarge them.

## Current gap list

1. Real-model Thai/tool-routing A/B evaluation has not been run because paid inference requires explicit authorization.
2. Web and website-content search providers are not integrated.
3. Nano Banana, Flux, Ideogram and Recraft V3 generation are catalogued but intentionally unavailable.
4. General chat currently uses the existing Design Agent contract; image creation/editing uses the new dedicated Creative Director contract. Both resolve to 120B, but the contracts are not yet one shared endpoint.
5. A multi-output autonomous Image Sub-Agent has not been claimed as complete; current operational specialists execute one bounded task at a time.

## Verification contract

Candidate completion requires:

- manifest tests prove no 20B default route;
- protocol tests prove high reasoning and output budget;
- Creative Director schema rejects unavailable models/capabilities;
- Knowledge retrieval and bounded Search tests pass;
- selected-image summaries reach planning without raw image data;
- generated output cannot commit before local + 120B review passes;
- targeted tests, full unit suite, typecheck, lint, production build and browser E2E pass;
- candidate server is verified without changing Production;
- Production deployment remains an explicit confirmation step.
