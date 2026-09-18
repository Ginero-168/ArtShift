import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prompt Helper plan route consent", () => {
  it("forwards cloudConsent into ai.execute", () => {
    const source = readFileSync("app/api/ai/prompt-helper/plan/route.ts", "utf8");
    expect(source).toContain("cloudConsent: true");
    expect(source).toContain("allowFallback: false");
  });
});
