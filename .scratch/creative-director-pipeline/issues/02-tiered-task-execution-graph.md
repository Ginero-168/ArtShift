# Tiered Task Execution Graph & Multi-Specialist Chaining

Type: grilling
Status: resolved
Blocked by: none

## Question

How should the Creative Director build, serialize, and validate the multi-specialist `PlanProposal` execution graph for `complex` Task Classes (e.g. background generation -> subject isolation -> typography placement -> brand styling), including step dependencies, approval boundaries, and payload passing between specialists?

## Answer

Settled as a client-orchestrated linear execution pipeline ([executionGraph.ts](file:///root/ArtShift/lib/ai/orchestration/executionGraph.ts)):
1. **Linear Pipeline Topology**: Multi-specialist tasks are decomposed into a strictly sequential chain (up to 8 steps), where any step may depend only on outputs of preceding steps (`dependsOnStepId`), eliminating merge conflicts and race conditions on Artwork layers.
2. **Client-as-Orchestrator Data Bus**: The client browser executes the step loop, managing state in Zustand, feeding artifact data forward, and unifying Cloud AI endpoints with Local Browser capabilities (Local RMBG, VTracer WASM) without server-side state.
3. **Upfront Approval with Exception Gating**: The user reviews and approves the full `SequentialExecutionPlan` once upfront. During execution, each step is validated against its `qualityThreshold`. If a step falls below threshold or errors, the pipeline transitions to `paused_on_gate` for user intervention rather than silently cascading defects.
Verified with unit tests in [tests/executionGraph.test.ts](file:///root/ArtShift/tests/executionGraph.test.ts).

