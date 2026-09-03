import { describe, expect, it } from "vitest";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import { summarizePlanForReview } from "@/lib/designAgent/planReview";

const plan: PlanProposal = {
  protocolVersion: 1,
  planId: "plan-1",
  executionToken: "execution-1",
  baseRevision: 10,
  summary: "Update a hero section",
  estimatedRemoteCostUsd: 0.0123,
  requiresApproval: true,
  commands: [
    {
      id: "update-1",
      kind: "update",
      target: { docId: "doc-1", artworkId: "art-1", objectId: "obj-1", baseRevision: 10 },
      patch: { text: "New headline", fontSize: 48 },
    },
    {
      id: "insert-1",
      kind: "insert_text",
      target: { docId: "doc-1", artworkId: "art-1", layerId: "layer-1", baseRevision: 10 },
      payload: { text: "Call to action", x: 20, y: 30, width: 200, height: 40 },
    },
  ],
};

describe("plan review summary", () => {
  it("summarizes affected targets and safe change descriptions without raw ids", () => {
    const summary = summarizePlanForReview(plan);

    expect(summary).toMatchObject({
      commandCount: 2,
      estimatedRemoteCostUsd: 0.0123,
      requiresApproval: true,
    });
    expect(summary.targets).toEqual(["Object", "Layer"]);
    expect(summary.changes).toEqual([
      "Update object (text, fontSize)",
      "Insert text “Call to action”",
    ]);
    expect(summary.targets.join(" ")).not.toContain("obj-1");
    expect(summary.targets.join(" ")).not.toContain("layer-1");
  });
});
