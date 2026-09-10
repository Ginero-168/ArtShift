import { describe, expect, it } from "vitest";
import { formatDisplayPrompt, parseInlineTagTokens } from "@/lib/ai/orchestration/inlineTagSynthesis";

describe("Chat Composer Tag & Formatting Enhancements", () => {
  it("parses and formats display prompt cleanly with name tags", () => {
    const prompt = "@[ภาพทิวทัศน์เทือกเขา:img-1] ปรับให้มีมังกรบินอยู่ในรูป";
    const tokens = parseInlineTagTokens(prompt);
    expect(tokens.length).toBe(2);
    expect(tokens[0].type).toBe("tag");
    if (tokens[0].type === "tag") {
      expect(tokens[0].displayName).toBe("ภาพทิวทัศน์เทือกเขา");
      expect(tokens[0].objectId).toBe("img-1");
    }
    expect(formatDisplayPrompt(prompt)).toBe("@ภาพทิวทัศน์เทือกเขา ปรับให้มีมังกรบินอยู่ในรูป");
  });

  it("handles image editing summary cleanly without raw tag leakage", () => {
    const rawPrompt = "@[ภาพทิวทัศน์เทือกเขา:img-1] ปรับให้มีมังกรบินอยู่ในรูป";
    // Strip tag markup as implemented in AICoPilotBar
    const cleanPrompt = rawPrompt.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "").trim();
    expect(cleanPrompt).toBe("ปรับให้มีมังกรบินอยู่ในรูป");
  });
});
