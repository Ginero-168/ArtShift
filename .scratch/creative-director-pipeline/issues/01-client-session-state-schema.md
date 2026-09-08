# Client Session State & Canonical Artifact Snapshots

Type: prototype
Status: resolved
Blocked by: none

## Question

How should the client-owned `CreativeDirectorSessionState` be structured in Zustand (`lib/engine/store.ts` or a paired AI slice) to store multi-turn conversation history, Canonical Artifact snapshots, and undo/redo checkpoints without memory bloating, while allowing the client to send lightweight context to the stateless `/api/ai/director` endpoint on every turn?

## Answer

Structured as a client-owned Zustand slice ([sessionState.ts](file:///root/ArtShift/lib/ai/orchestration/sessionState.ts)) featuring:
1. **Lightweight Object Summaries**: `summarizeArtworkObjects()` strips heavy image base64/binary payloads, retaining only bounding boxes, layer ids, text snippets, and locks. Average turn payload is < 5KB.
2. **Canonical Artifact Snapshots**: Each snapshot records `historyIndex` linking directly to `lib/engine/store.ts`'s undo/redo timeline, allowing instant rollback to any prior design state.
3. **Variation Candidate Staging**: Holds candidate variations (1–5) in `CandidateVariation` state with `status: "staged" | "ghost_preview" | "accepted" | "rejected"` to decouple ghost preview rendering from document mutations.
4. **Stateless API Context Builder**: `buildDirectorTurnContext(maxTurns)` exports the sliding conversation window + current snapshot summary without requiring any server-side database.
Verified with unit tests in [tests/sessionState.test.ts](file:///root/ArtShift/tests/sessionState.test.ts).

