import { describe, expect, it } from "vitest";
import {
  buildReferenceRoleAppendix,
  extractInlineTagObjectIds,
  extractInlineTagRefs,
  finalizeRefinedPromptWithNameTags,
  formatDisplayPrompt,
  inferInlineTagRoles,
  parseInlineTagTokens,
  stripInlineTagTokens,
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

  it("extracts Name Tag refs with display names", () => {
    const prompt =
      "สร้างรูปจากสไตล์นี้@[ภาพโฆษณา:22a4057b-3291-4ed7-b266-033a8f0534e1] และใช้บรีฟ รวมถึง Layout จากรูปนี้@[merged-image.png:4b6e6f6e-081d-436e-a8a6-4e2c1bf53f7b]";
    expect(extractInlineTagRefs(prompt)).toEqual([
      {
        objectId: "22a4057b-3291-4ed7-b266-033a8f0534e1",
        displayName: "ภาพโฆษณา",
      },
      {
        objectId: "4b6e6f6e-081d-436e-a8a6-4e2c1bf53f7b",
        displayName: "merged-image.png",
      },
    ]);
  });

  it("infers style vs layout roles from surrounding Thai clauses", () => {
    const prompt =
      "สร้างรูปจากสไตล์นี้@[Style Ref:id-style] และใช้บรีฟ รวมถึง Layout จากรูปนี้@[Layout Ref:id-layout]";
    const roles = inferInlineTagRoles(prompt);
    expect(roles.get("id-style")).toBe("style");
    expect(roles.get("id-layout")).toBe("layout");
  });

  it("strips raw Name Tag tokens from refined prompts", () => {
    const leaked =
      "Create an ad from @[ภาพโฆษณา:22a4057b-3291-4ed7-b266-033a8f0534e1] and layout @[merged-image.png:4b6e6f6e-081d-436e-a8a6-4e2c1bf53f7b].";
    expect(stripInlineTagTokens(leaked)).toBe("Create an ad from and layout.");
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
    expect(result.semanticMappingText).toContain('@Photo (Object ID: "id-1"');
    expect(result.semanticMappingText).toContain("a plate of red grapes on white ceramic");
    expect(result.semanticMappingText).toContain('@BG (Object ID: "id-2"');
    expect(result.semanticMappingText).toContain("warm wooden desk with subtle morning light");

    expect(result.expandedPromptForModel).toContain('reference "Photo"');
    expect(result.expandedPromptForModel).toContain("a plate of red grapes on white ceramic");
    expect(result.expandedPromptForModel).toContain('reference "BG"');
  });

  it("matches flat director-wire analyses that lost nested ref", () => {
    const prompt = "สร้างรูปจากสไตล์นี้@[Style Shot:id-style] และ Layout จากรูปนี้@[Brief:id-brief]";
    const result = synthesizePromptWithInlineTags(prompt, [
      {
        objectId: "id-style",
        displayName: "Style Shot",
        caption: "joyful boy in shark float at water park",
        objects: ["boy", "float"],
        visibleText: "SPLASH",
      },
      {
        objectId: "id-brief",
        displayName: "Brief",
        caption: "vertical ad layout with yellow badge",
        objects: ["badge"],
        visibleText: "เปิดแล้ววันนี้",
      },
    ]);

    expect(result.semanticMappingText).toContain("Role: style");
    expect(result.semanticMappingText).toContain("Role: layout");
    expect(result.semanticMappingText).toContain("joyful boy in shark float at water park");
    expect(result.expandedPromptForModel).toContain('style reference "Style Shot"');
    expect(result.expandedPromptForModel).toContain('layout reference "Brief"');
  });

  it("finalizes refinedPrompt by stripping tags and appending named roles", () => {
    const original =
      "สร้างรูปจากสไตล์นี้@[Style Shot:id-style] และใช้บรีฟ รวมถึง Layout จากรูปนี้@[Brief:id-brief]";
    const refined =
      "Professional ad using @[Style Shot:id-style] for look and @[Brief:id-brief] for layout.";
    const finalized = finalizeRefinedPromptWithNameTags(refined, original, [
      { objectId: "id-style", displayName: "Style Shot", caption: "water park boy" },
      { objectId: "id-brief", displayName: "Brief", caption: "layout mock" },
    ]);

    expect(finalized).not.toContain("@[");
    expect(finalized).not.toMatch(/id-style|id-brief/);
    expect(finalized).toContain("=== INPUT REFERENCE IMAGES");
    expect(finalized).toContain('"Style Shot"');
    expect(finalized).toContain("ROLE: STYLE reference");
    expect(finalized).toContain('"Brief"');
    expect(finalized).toContain("ROLE: LAYOUT / BRIEF reference");
    expect(finalized).toContain("layout GUIDES only");
    expect(buildReferenceRoleAppendix(original)).toContain("attachment order");
  });
});
