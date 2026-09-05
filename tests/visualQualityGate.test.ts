import { describe, expect, it } from "vitest";
import { runVisualQualityGate } from "@/lib/ai/visualQualityGate";

describe("visual generation quality gate", () => {
  it("passes one valid image candidate with usable dimensions", () => {
    const result = runVisualQualityGate({
      dataUrl: "data:image/webp;base64,AAAA",
      prompt: "a warm editorial portrait",
      width: 1024,
      height: 1024,
      outputCount: 1,
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it.each([
    ["empty prompt", { prompt: "" }],
    ["invalid data URL", { dataUrl: "https://example.com/image.webp" }],
    ["zero width", { width: 0 }],
    ["multiple outputs", { outputCount: 2 }],
  ])("rejects %s before the image reaches the editor", (_label, overrides) => {
    const result = runVisualQualityGate({
      dataUrl: "data:image/webp;base64,AAAA",
      prompt: "a warm editorial portrait",
      width: 1024,
      height: 1024,
      outputCount: 1,
      ...overrides,
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});
