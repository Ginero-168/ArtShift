# Architecture Spec & ADR Consolidation

Type: task
Status: resolved
Blocked by: none

## Question

Once the state schema (01), execution graph (02), ghost preview (03), and capability routing (04) are resolved, how should the formal Architecture Specification and Architecture Decision Record (ADR) be written in `docs/adr/` and `docs/architecture/` adhering to the domain language in `CONTEXT.md`, and what are the prioritized implementation tickets required to execute the roadmap?

## Answer

Consolidated and committed to the repository:
1. **Architecture Decision Record (ADR 0001)**: [docs/adr/0001-creative-director-multi-turn-pipeline.md](file:///root/ArtShift/docs/adr/0001-creative-director-multi-turn-pipeline.md)
   - Documents the decision to use a Local-First, Client-Orchestrated Creative Director with client-owned Zustand session state, linear execution graphs, non-destructive canvas ghost overlays, and specialist capability routing.
2. **Architecture Specification**: [docs/architecture/creative-director-pipeline.md](file:///root/ArtShift/docs/architecture/creative-director-pipeline.md)
   - Detailed component breakdown, data flow diagrams (Mermaid), subsystem contracts, and quality gate boundaries.
3. **Prioritized Build Tickets**:
   - **BUILD-01 (P0)**: Store Slice Integration ([sessionState.ts](file:///root/ArtShift/lib/ai/orchestration/sessionState.ts))
   - **BUILD-02 (P0)**: Canvas Ghost Overlay Hook ([ghostOverlay.ts](file:///root/ArtShift/lib/renderer/ghostOverlay.ts))
   - **BUILD-03 (P1)**: Client Step Runner Loop ([executionGraph.ts](file:///root/ArtShift/lib/ai/orchestration/executionGraph.ts))
   - **BUILD-04 (P1)**: Director System Prompt for Complex Plans
   - **BUILD-05 (P2)**: UI Staging Tray & Interactive Hover Previews

