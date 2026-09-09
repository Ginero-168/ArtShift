import { describe, expect, it } from "vitest";
import {
  extractInlineTagObjectIds,
  formatDisplayPrompt,
  parseInlineTagTokens,
  synthesizePromptWithInlineTags,
} from "@/lib/ai/orchestration/inlineTagSynthesis";
import type { ImageReferenceAnalysis } from "@/lib/ai/orchestration/referenceAnalysis";

describe("inlineTagSynthesis", () => {
  it("parses prompt into sequential text and tag tokens", () => {
    const prompt = "นำ @[Photo:id-1] มาวางบน @[BG 3:4:id-2] แล้วลบพื้นหลัง";
    const segments = parseInlineTagTokens(prompt);

    expect(segments).toEqual([
      { type: "text", text: "นำ " },
      { type: "tag", raw: "@[Photo:id-1]", displayName: "Photo", objectId: "id-1" },
      { type: "text", text: " มาวางบน " },
      { type: "tag", raw: "@[BG 3:4:id-2]", displayName: "BG 3:4", objectId: "id-2" },
      { type: "text", text: " แล้วลบพื้นหลัง" },
    ]);
  });

  it("extracts unique object IDs referenced in text", () => {
    const prompt = "ดู @[Photo:id-1] เทียบกับ @[BG:id-2] แล้วแก้ไข @[Photo:id-1]";
    const ids = extractInlineTagObjectIds(prompt);
    expect(ids).toEqual(["id-1", "id-2"]);
  });

  it("formats display prompt cleanly with @displayName", () => {
    const prompt = "นำ @[Photo:id-1] มาผสมกับ @[BG 3:4:id-2]";
    expect(formatDisplayPrompt(prompt)).toBe("นำ @Photo มาผสมกับ @BG 3:4");
  });

  it("synthesizes semantic mapping and expanded prompt using image analyses", () => {
    const prompt = "นำ @[Photo:id-1] มาตัดพื้นหลัง และวางบน @[BG:id-2]";

    const mockAnalyses: ImageReferenceAnalysis[] = [
      {
        ref: { objectId: "id-1", elementVersion: 1, displayName: "Photo" },
        caption: "a plate of red grapes on white ceramic",
        objects: ["grape", "plate"],
        visibleText: "",
        dimensions: { width: 1024, height: 1024, aspectRatio: 1 },
        transparency: "none",
        appearanceNotes: ["Canvas placement 300x300 px"],
        limitations: [],
      },
      {
        ref: { objectId: "id-2", elementVersion: 1, displayName: "BG" },
        caption: "warm wooden desk with subtle morning light",
        objects: ["desk", "wood"],
        visibleText: "Studio",
        dimensions: { width: 1920, height: 1080, aspectRatio: 1.78 },
        transparency: "none",
        appearanceNotes: ["Canvas placement 1920x1080 px"],
        limitations: [],
      },
    ];

    const result = synthesizePromptWithInlineTags(prompt, mockAnalyses);

    expect(result.referencedObjectIds).toEqual(["id-1", "id-2"]);
    expect(result.displayPrompt).toBe("นำ @Photo มาตัดพื้นหลัง และวางบน @BG");
    expect(result.semanticMappingText).toContain("=== INLINE NAME TAG SEMANTIC MAPPING ===");
    expect(result.semanticMappingText).toContain('@Photo (Object ID: "id-1")');
    expect(result.semanticMappingText).toContain("a plate of red grapes on white ceramic");
    expect(result.semanticMappingText).toContain('@BG (Object ID: "id-2")');
    expect(result.semanticMappingText).toContain("warm wooden desk with subtle morning light");

    expect(result.expandedPromptForModel).toBe(
      "นำ [image: a plate of red grapes on white ceramic containing grape, plate] มาตัดพื้นหลัง และวางบน [image: warm wooden desk with subtle morning light containing desk, wood]",
    );
  });
});
