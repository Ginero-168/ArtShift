import { describe, expect, it } from "vitest";
import { UNIFIED_VISION_PROMPT } from "@/lib/ai/orchestration/visionAnalyzePrompt";

describe("UNIFIED_VISION_PROMPT", () => {
  it("asks for zone inventory and full OCR instead of mood-first captions", () => {
    expect(UNIFIED_VISION_PROMPT).toContain("Zone-by-zone inventory");
    expect(UNIFIED_VISION_PROMPT).toContain("FULL OCR");
    expect(UNIFIED_VISION_PROMPT).toContain("layoutNotes");
    expect(UNIFIED_VISION_PROMPT).toContain("inconsistencies");
    expect(UNIFIED_VISION_PROMPT).toContain("Prefer spatial inventory over emotional summary");
    expect(UNIFIED_VISION_PROMPT).toContain("Do NOT lead with mood");
  });
});
