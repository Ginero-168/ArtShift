import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareOrchestratorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/orchestration/creativeDirectorClient", () => ({
  prepareRemoteOrchestratorTurn: prepareOrchestratorMock,
}));

import { prepareRemoteDesignTurn } from "@/lib/designAgent/client";

const context = {
  docId: "doc-1",
  baseRevision: 3,
  artworkId: "slide-1",
  artworkWidth: 1920,
  artworkHeight: 1080,
  hasSelection: false,
  selectedObjectIds: [],
  snapshot: { objects: [{ id: "title" }] },
};

describe("legacy Design Agent client adapter", () => {
  beforeEach(() => prepareOrchestratorMock.mockReset());

  it("delegates the legacy client API to the single Orchestrator transport", async () => {
    prepareOrchestratorMock.mockResolvedValue({ kind: "answer", text: "รับทราบครับ" });

    const result = await prepareRemoteDesignTurn(
      [
        { role: "user", content: "ออกแบบโปสเตอร์" },
        { role: "assistant", content: "ต้องการโทนแบบไหนครับ" },
        { role: "user", content: "ใช้โทนเข้ม" },
      ],
      context,
      { cloudConsent: true },
    );

    expect(result).toEqual({ type: "text", text: "รับทราบครับ" });
    expect(prepareOrchestratorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "ใช้โทนเข้ม",
        conversationHistory: expect.any(Array),
        designContext: context,
        canvasSummary: {
          objectCount: 1,
          selectedCount: 0,
          width: 1920,
          height: 1080,
        },
        referenceAnalyses: [],
      }),
      { cloudConsent: true },
    );
  });

  it("does not call a transport when the legacy turn has no user prompt", async () => {
    const result = await prepareRemoteDesignTurn([], context, { cloudConsent: true });

    expect(result).toMatchObject({ type: "question", id: "missing-prompt" });
    expect(prepareOrchestratorMock).not.toHaveBeenCalled();
  });
});
