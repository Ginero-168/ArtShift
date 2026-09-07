import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AIImageGeneratorModal.tsx", "utf8");

describe("AI image studio orchestration seam", () => {
  it("routes generation through the context-aware copilot instead of direct Canvas mutation", () => {
    expect(source).toContain("executeCoPilotInstruction");
    expect(source).toContain("window.confirm");
    expect(source).toContain("gpt-oss-120b Creative Director");
    expect(source).not.toContain("generateAIImage");
    expect(source).not.toContain("addElement(");
    expect(source).not.toContain("enqueueAssetAnalysis(");
  });
});
