import { describe, expect, it } from "vitest";
import { runBriefQualityGate } from "@/lib/ai/orchestration/briefQualityGate";

describe("brief quality gate", () => {
  it("passes a single usable output whose dimensions and references match the brief", () => {
    const result = runBriefQualityGate({
      prompt: "สร้างภาพ product photo แบบสตูดิโอ",
      outputWidth: 1024,
      outputHeight: 1024,
      outputCount: 1,
      requestedAspectRatio: "1:1",
      referenceCount: 1,
      submittedReferenceCount: 1,
    });

    expect(result.passed).toBe(true);
    expect(result.semanticReview).toBe("deferred-to-local-asset-analysis");
  });

  it("blocks a mismatched output and raw image payload in the prompt", () => {
    const result = runBriefQualityGate({
      prompt: "data:image/png;base64,SECRET",
      outputWidth: 1280,
      outputHeight: 720,
      outputCount: 2,
      requestedAspectRatio: "1:1",
      referenceCount: 1,
      submittedReferenceCount: 0,
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toHaveLength(4);
  });
});
