import { describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => ({ execute: executeMock }),
}));

import { prepareDesignTurn } from "@/lib/designAgent/server";

describe("remote Design Agent approval boundary", () => {
  it("forces model proposals through review even when the model says approval is unnecessary", async () => {
    executeMock.mockResolvedValueOnce({
      output: {
        text: "",
        stopReason: "tool_use",
        assistantMessage: { role: "assistant", content: "" },
        toolCalls: [
          {
            type: "tool_call",
            id: "call-1",
            name: "propose_design_plan",
            input: {
              summary: "Update selected title",
              estimatedRemoteCostUsd: 0,
              requiresApproval: false,
              commands: [
                {
                  id: "command-1",
                  kind: "update",
                  target: {
                    docId: "doc-1",
                    artworkId: "art-1",
                    objectId: "title-1",
                    baseRevision: 100,
                  },
                  patch: { text: "New title" },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await prepareDesignTurn(
      [{ role: "user", content: "เปลี่ยนข้อความของ Object ที่เลือก" }],
      {
        docId: "doc-1",
        baseRevision: 100,
        artworkId: "art-1",
        artworkWidth: 1920,
        artworkHeight: 1080,
        hasSelection: true,
        selectedObjectIds: ["title-1"],
        snapshot: {},
      },
      { replicateToken: "test-only-token", cloudConsent: true },
    );

    expect(result.type).toBe("proposal");
    if (result.type === "proposal") expect(result.proposal.requiresApproval).toBe(true);
  });

  it("does not call the runtime without explicit remote consent", async () => {
    executeMock.mockReset();
    const result = await prepareDesignTurn(
      [{ role: "user", content: "ช่วยออกแบบโปสเตอร์" }],
      {
        docId: "doc-1",
        baseRevision: 100,
        artworkId: "art-1",
        artworkWidth: 1920,
        artworkHeight: 1080,
        hasSelection: false,
        selectedObjectIds: [],
        snapshot: {},
      },
      { replicateToken: "configured" },
    );

    expect(result).toMatchObject({ type: "text" });
    expect(executeMock).not.toHaveBeenCalled();
  });
});
