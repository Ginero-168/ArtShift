import { describe, expect, it } from "vitest";
import {
  PROMPT_HELPER_VARIANT_SYSTEM,
  parsePromptHelperVariantPlan,
} from "@/lib/ai/orchestration/promptHelperVariantPlan";
import { resolveOptionPreview } from "@/lib/ai/orchestration/promptOptionCatalog";
import {
  applyPromptHelperVariantPlan,
  createPromptRefinement,
  listPromptHelperCatalogAxes,
} from "@/lib/ai/orchestration/promptRefinement";

describe("prompt helper variant plan", () => {
  it("parses Gemini JSON plans and ignores junk", () => {
    const plan = parsePromptHelperVariantPlan(`\`\`\`json
{
  "situation": "theme_broad",
  "rationale": "ธีมกว้าง กระจายขั้วสี",
  "preferBrandAxes": false,
  "axes": [
    { "id": "color", "optionIds": ["vibrant", "pastel", "dark"] },
    { "id": "background", "optionIds": ["studio", "nature"] }
  ]
}
\`\`\``);
    expect(plan).toMatchObject({
      situation: "theme_broad",
      preferBrandAxes: false,
    });
    expect(plan?.axes).toHaveLength(2);
    expect(parsePromptHelperVariantPlan("not json")).toBeNull();
  });

  it("applies a plan by filtering catalog options onto the card", () => {
    const baseline = createPromptRefinement("สร้างภาพ");
    const planned = applyPromptHelperVariantPlan(baseline, {
      situation: "theme_broad",
      rationale: "test",
      preferBrandAxes: false,
      axes: [
        { id: "color", optionIds: ["vibrant", "pastel", "missing-id"] },
        { id: "camera", optionIds: ["front", "closeup"] },
      ],
    });
    expect(planned.dimensions.map((d) => d.id)).toEqual(["color", "camera"]);
    expect(planned.dimensions[0]?.options.map((o) => o.id)).toEqual(["vibrant", "pastel"]);
    expect(planned.dimensions[1]?.options).toHaveLength(2);
  });

  it("keeps system prompt free of hardcoded campaign brands", () => {
    expect(PROMPT_HELPER_VARIANT_SYSTEM).not.toMatch(/Welearn|Manifest/i);
    expect(PROMPT_HELPER_VARIANT_SYSTEM).toContain("Shared Anchors");
    expect(PROMPT_HELPER_VARIANT_SYSTEM).toContain("Level 2");
  });

  it("exposes a catalog snapshot for Gemini planning", () => {
    const axes = listPromptHelperCatalogAxes();
    expect(axes.some((a) => a.axisId === "color")).toBe(true);
    expect(axes.some((a) => a.axisId === "mood")).toBe(true);
  });
});

describe("prompt helper image previews", () => {
  it("falls back to library preview when no VPS thumb exists yet", () => {
    const preview = resolveOptionPreview("vibrant");
    expect(preview?.kind === "swatch" || preview?.kind === "image").toBe(true);
  });
});
