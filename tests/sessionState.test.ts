import { describe, expect, it } from "vitest";
import {
  createInitialSessionState,
  summarizeArtworkObjects,
  useDirectorSession,
} from "@/lib/ai/orchestration/sessionState";

describe("Creative Director Session State & Snapshot Prototype", () => {
  it("initializes an empty session state correctly", () => {
    const session = createInitialSessionState("slide-1", "test-session-123");
    expect(session.sessionId).toBe("test-session-123");
    expect(session.activeSlideId).toBe("slide-1");
    expect(session.turns).toEqual([]);
    expect(session.snapshots).toEqual({});
    expect(session.currentSnapshotId).toBeUndefined();
    expect(session.activeGhostVariationId).toBeUndefined();
  });

  it("summarizes artwork objects into a lightweight payload without binary bloat", () => {
    const rawElements = [
      {
        id: "img-1",
        type: "image",
        layerId: "layer-bg",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        label: "Background",
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        locked: true,
      },
      {
        id: "text-1",
        type: "text",
        layerId: "layer-content",
        x: 200,
        y: 350,
        width: 600,
        height: 120,
        text: "หนังสือพัฒนาตนเองฉบับพรีเมียม เล่มใหม่ล่าสุดประจำปี",
      },
    ];

    const summaries = summarizeArtworkObjects(rawElements);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toEqual({
      id: "img-1",
      type: "image",
      layerId: "layer-bg",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      label: "Background",
      textSnippet: undefined,
      isLocked: true,
    });
    // Ensure heavy src base64 was stripped
    expect((summaries[0] as Record<string, unknown>).src).toBeUndefined();

    expect(summaries[1]).toEqual({
      id: "text-1",
      type: "text",
      layerId: "layer-content",
      x: 200,
      y: 350,
      width: 600,
      height: 120,
      label: undefined,
      textSnippet: "หนังสือพัฒนาตนเองฉบับพรีเมียม เล่มใหม่ล่าสุดประจำปี",
      isLocked: false,
    });
  });

  it("manages session turns, snapshots, and variations via useDirectorSession", () => {
    const {
      appendUserTurn,
      appendAssistantTurn,
      captureSnapshot,
      setGhostPreview,
      acceptVariation,
      rejectVariation,
      buildDirectorTurnContext,
      clearSession,
    } = useDirectorSession.getState();

    clearSession();

    // 1. User turn
    const userTurn = appendUserTurn("Create coffee cup illustration", "simple");
    expect(userTurn.role).toBe("user");
    expect(userTurn.content).toBe("Create coffee cup illustration");
    expect(useDirectorSession.getState().turns).toHaveLength(1);

    // 2. Snapshot
    const snap = captureSnapshot(
      "slide-abc",
      1,
      1920,
      1080,
      [{ id: "obj-1", type: "shape", layerId: "l1", x: 10, y: 10, width: 100, height: 100 }],
      ["obj-1"],
    );
    expect(snap.historyIndex).toBe(1);
    expect(useDirectorSession.getState().currentSnapshotId).toBe(snap.id);

    // 3. Assistant turn with candidate variations
    const assistantTurn = appendAssistantTurn(
      { kind: "answer", text: "Here is your plan" },
      "Plan ready",
      [
        {
          id: "var-1",
          url: "https://example.com/v1.png",
          brief: "Variation 1",
          dimensions: { width: 512, height: 512 },
          status: "staged",
        },
        {
          id: "var-2",
          url: "https://example.com/v2.png",
          brief: "Variation 2",
          dimensions: { width: 512, height: 512 },
          status: "staged",
        },
      ],
    );
    expect(useDirectorSession.getState().turns).toHaveLength(2);

    // 4. Ghost preview toggling
    setGhostPreview("var-1");
    expect(useDirectorSession.getState().activeGhostVariationId).toBe("var-1");

    // 5. Accept variation
    acceptVariation(assistantTurn.id, "var-1");
    let updatedTurns = useDirectorSession.getState().turns;
    let turn2 = updatedTurns[1];
    expect(turn2.acceptedVariationId).toBe("var-1");
    expect(turn2.stagedVariations?.[0].status).toBe("accepted");
    expect(turn2.stagedVariations?.[1].status).toBe("rejected");
    expect(useDirectorSession.getState().activeGhostVariationId).toBeUndefined();

    // 5b. Explicit reject variation
    rejectVariation(assistantTurn.id, "var-2");
    updatedTurns = useDirectorSession.getState().turns;
    turn2 = updatedTurns[1];
    expect(turn2.stagedVariations?.[1].status).toBe("rejected");

    // 6. Context building
    const ctx = buildDirectorTurnContext(5);
    expect(ctx.conversationHistory).toHaveLength(2);
    expect(ctx.canonicalSummary.objectCount).toBe(1);
    expect(ctx.canonicalSummary.width).toBe(1920);

    // 7. Clear session
    clearSession();
    expect(useDirectorSession.getState().turns).toHaveLength(0);
    expect(useDirectorSession.getState().currentSnapshotId).toBeUndefined();
  });
});
