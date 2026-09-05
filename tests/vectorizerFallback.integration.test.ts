import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vectorizer runtime fallback integration", () => {
  it("does not silently fall back to the removed Custom engine", () => {
    const source = readFileSync("lib/vectorize/vectorizer.ts", "utf8");
    expect(source).not.toContain("fallbackOptions");
    expect(source).not.toContain("vectorizer-core");
    expect(source).toContain("vectorizeRgbaWithVTracer");
  });
});
