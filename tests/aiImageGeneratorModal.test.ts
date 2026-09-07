import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AIImageGeneratorModal.tsx", "utf8");

describe("AI image studio orchestration seam", () => {
  it("routes generation through the context-aware copilot instead of direct Canvas mutation", () => {
    expect(source).toContain("executeCoPilotInstruction");
    expect(source).not.toContain("generateAIImage");
    expect(source).not.toContain("addElement(");
    expect(source).not.toContain("enqueueAssetAnalysis(");
  });
});
