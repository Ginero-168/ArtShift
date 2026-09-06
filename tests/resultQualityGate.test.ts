import { describe, expect, it } from "vitest";
import { runGeneratedImageQualityGate } from "@/lib/ai/orchestration/resultQualityGate";

describe("generated image quality gate", () => {
  it("passes deterministic and supported local evidence", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["mug"],
      requiredText: "SALE",
      outputAnalysis: {
        caption: "a white mug on a table",
        objects: ["mug", "table"],
        visibleText: "SALE",
        limitations: [],
      },
    });

    expect(result.passed).toBe(true);
    expect(result.review).toBe("local-analysis");
    expect(result.blockers).toEqual([]);
  });

  it("blocks a dimension mismatch before Canvas commit", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 768,
      requestedAspectRatio: "1:1",
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "dimensions")?.passed).toBe(false);
  });

  it("blocks missing required subject or OCR text", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["mug"],
      requiredText: "SALE",
      outputAnalysis: {
        caption: "a landscape photograph",
        objects: ["tree"],
        visibleText: "",
        limitations: [],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "subject")?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "text")?.passed).toBe(false);
  });

  it("fails closed when a required semantic review is unavailable", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requiredSubjects: ["product"],
    });

    expect(result.passed).toBe(false);
    expect(result.review).toBe("unverifiable");
    expect(result.blockers).toContain("Required subjects need local output analysis.");
  });
});
