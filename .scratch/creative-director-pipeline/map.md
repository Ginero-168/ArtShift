# Map: Creative Director & AI Studio Pipeline

Status: completed
Label: wayfinder:map

## Destination

Produce a complete Architecture Specification and Architecture Decision Record (ADR) for ArtShift's **Creative Director & AI Studio Pipeline** (enabling client-owned multi-turn design sessions, compound specialist execution graphs, interactive Canvas ghost previews, and dedicated specialist-to-model routing), accompanied by prioritized, actionable implementation tickets.

## Notes

- **Domain context**: Consult [CONTEXT.md](file:///root/ArtShift/CONTEXT.md) for canonical vocabulary (Artwork, Workspace, Layer, Object, Visual Intent, Task Class, Canonical Artifact, Capability Alias).
- **Core principles**: Local-first architecture; `lib/engine/store.ts` is the single transaction and undo/redo boundary; server routes remain strictly stateless.
- **Skills to consult**: `domain-modeling`, `grilling`, `prototype`, `research`.
- **Standing preferences**:
  - State & Memory: Client-owned stateful session in Zustand + Canonical Artifact snapshots.
  - Chaining: Tiered execution based on Task Class (`simple` runs single specialist directly; `complex` proposes multi-specialist execution graph requiring user approval).
  - Variations: Batch runner outputs render as non-destructive Canvas Ghost Overlays directly on the Artwork.
  - Routing: Dedicated Specialist-to-Model mapping using Capability Aliases with BYOK fallback.

## Decisions so far

- [Client Session State & Canonical Artifact Snapshots](issues/01-client-session-state-schema.md): Client-owned Zustand session state storing lightweight object summaries (<5KB), linked to store undo/redo historyIndex, with candidate variation staging and stateless API context building.
- [Tiered Task Execution Graph & Multi-Specialist Chaining](issues/02-tiered-task-execution-graph.md): Strictly sequential linear pipeline orchestrated directly by the client browser (Local-first data bus) with upfront Plan approval and Exception Gating pausing on quality threshold drops.
- [Interactive Canvas Ghost Preview for Batch Variations](issues/03-interactive-ghost-preview-renderer.md): Non-destructive 2D Canvas Ghost Overlay rendering candidate batch variations with aspect-ratio-preserving bounds, violet dashed borders, corner anchors, and pill tags.
- [Dedicated Specialist-to-Model Capability Routing](issues/04-specialist-capability-model-routing.md): 3-tier capability alias routing matrix mapping each specialist to specialized models (Claude, Gemini, GPT Image 2, Local VTracer) with BYOK precedence and zero-cost local fallbacks.
- [Architecture Spec & ADR Consolidation](issues/05-adr-and-spec-consolidation.md): Formally published ADR 0001 (docs/adr/0001-creative-director-multi-turn-pipeline.md), complete Architecture Specification (docs/architecture/creative-director-pipeline.md), and 5 prioritized implementation build tickets (BUILD-01 to BUILD-05).

## Not yet specified

- **Multi-specialist partial progress streaming**: Real-time telemetry on the Artwork canvas indicating which specialist in the compound execution graph is currently computing.
- **Brand Kit prompt template injection**: How publisher-specific tone of voice, preferred typography pairings, and compliance rules from `lib/brand/` dynamically augment the Creative Director's specialist prompts.
- **Multi-slide presentation orchestration**: Extending the Creative Director from single Artwork composition to multi-slide deck generation (`/present` and PPTX export).

## Out of scope

- Server-side database session storage (Redis/Postgres) for conversation state — client-owned local-first Zustand session is mandatory.
- Unsupervised autonomous execution of Complex Tasks without human approval — HITL approval of `PlanProposal` is non-negotiable.
- Self-hosting custom LLMs on the VPS infrastructure — cloud adapters and BYOK (Anthropic/OpenAI/Google) are used exclusively.
