import { describe, expect, it } from "vitest";
import {
  ARTSHIFT_HARNESS_VERSION,
  buildHarnessSystemPrompt,
} from "@/lib/ai/orchestration/harnessPolicy";

describe("executable ArtShift Harness", () => {
  it("exposes v2.2 rules to runtime", () => {
    const prompt = buildHarnessSystemPrompt();
    expect(ARTSHIFT_HARNESS_VERSION).toBe("2.2");
    expect(prompt).toContain("REFERENCE_ANALYSIS");
    expect(prompt).toContain("A/B/C/Other");
    expect(prompt).toContain("quality gate");
    expect(prompt).toContain("atomic Canvas commit");
  });
});
