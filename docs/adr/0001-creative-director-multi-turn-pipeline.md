# ADR 0001: Creative Director Multi-Turn Pipeline & Local-First Orchestration

Status: Accepted  
Date: 2026-09-08  
Deciders: ArtShift Engineering Team  
Consulted: `domain-modeling`, `wayfinder`

## Context

ArtShift provides AI-assisted creative operations for promotional book artwork and commercial layouts. While simple single-turn image generation (`image-gpt-2`) was functional, complex user requests (e.g. *"Design a complete sci-fi promotional banner with dark nebula background, Thai headline, isolated book mockup, and publisher brand colors"*) require coordinating multiple specialists:
- Image generation (`image_generator`)
- Subject segmentation & isolation (`image_editor` / RMBG)
- Localized typography & copywriting (`copywriter`)
- Vector badges & geometric accents (`vectorizer`)
- Placement & layout hierarchy (`layout_designer`)
- Brand rule enforcement (`brand_stylist`)

Previous iterations lacked multi-turn memory of previous Artwork states, could only execute single specialists per turn, lacked non-destructive Canvas preview for multi-image batch variations, and tied model selection to hardcoded provider endpoints.

## Decision

We adopt a **Local-First, Client-Orchestrated Creative Director Architecture**:

1. **Client-Owned Stateful Session (Zustand)**:
   - The client browser maintains `CreativeDirectorSessionState` ([sessionState.ts](file:///root/ArtShift/lib/ai/orchestration/sessionState.ts)).
   - Storing lightweight object summaries (< 5KB per turn) and linking each turn to the `historyIndex` of `lib/engine/store.ts`.
   - Server endpoints (`/api/ai/director`, `/api/ai/execute`) remain strictly **stateless**, receiving only sliding-window turn context and snapshot summaries.

2. **Linear Sequential Execution Pipeline with Exception Gating**:
   - For `complex` Task Classes, the Creative Director proposes a `SequentialExecutionPlan` ([executionGraph.ts](file:///root/ArtShift/lib/ai/orchestration/executionGraph.ts)) consisting of up to 8 strictly sequential steps.
   - The user approves the plan upfront once.
   - The client acts as the data bus, executing each step, feeding artifact references forward (`dependsOnStepId`), and unifying Cloud AI with local browser tools (Local RMBG, VTracer WASM).
   - If any step drops below its `qualityThreshold` (e.g. 0.7) or errors, execution transitions to `paused_on_gate` for user intervention rather than cascading defects.

3. **Non-Destructive Canvas Ghost Overlays**:
   - Multi-variation batches (1–5 images) are rendered as transparent Ghost Overlays ([ghostOverlay.ts](file:///root/ArtShift/lib/renderer/ghostOverlay.ts)) directly on the Artwork with violet dashed borders, corner anchor handles, and pill tags.
   - Document store (`doc.slides`) elements are never mutated until the user explicitly clicks **Commit**.

4. **Dedicated Specialist-to-Model Capability Routing**:
   - Each specialist maps to a stable `CapabilityAlias`:
     - `image_generator` -> `IMAGE_DEFAULT` (Replicate `openai/gpt-image-2` / BYOK OpenAI)
     - `image_editor` -> `IMAGE_EDIT` (Replicate img2img / Local RMBG)
     - `vectorizer` -> `IMAGE_VECTOR` (`local-vtracer` WASM / Replicate `recraft-vectorize`)
     - `copywriter` -> `TEXT_COPYWRITER` (Google Gemini 2.0 Flash for Thai nuance / Claude 3.7)
     - `layout_designer` -> `LAYOUT_DESIGNER` (Claude 3.7 Sonnet / `alignElements()` engine)
     - `brand_stylist` -> `BRAND_STYLIST` (Publisher Brand Kit + Claude)
   - Tiered resolution: User BYOK Key -> Managed Server Adapter -> Zero-cost Local/Rule Fallback.

## Consequences

### Positive
- **No Database Footprint**: Zero server-side session DB or Redis required; users retain full ownership of their conversation and Artwork data.
- **Flawless Undo/Redo**: Every AI turn maps to a native canvas history checkpoint.
- **Rapid Latency & Zero Waste**: In-browser ghost previews avoid committing faulty assets to canvas.
- **Resilience**: A failure in step 3 (e.g. Copywriter) pauses without losing step 1's generated image.

### Negative / Trade-offs
- The client browser memory must be guarded: long sessions (>50 turns) must prune or archive older snapshots to prevent client RAM bloat.
- Large linear pipelines (5+ steps) require sustained user attention if gates pause.
