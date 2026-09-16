import { describe, expect, it } from "vitest";
import {
  BRIEF_GUIDE_BORDER,
  BRIEF_GUIDE_BORDER_WIDTH,
  BRIEF_GUIDE_FILL,
  BRIEF_GUIDE_GRAY,
  BRIEF_GUIDE_TEXT,
  styleBriefGuideShape,
  styleBriefGuideText,
} from "@/lib/ai/briefGuideStyle";

describe("briefGuideStyle", () => {
  it("uses one shared gray fill and a border separator on every guide shape", () => {
    const shape = {
      strokeColor: "#0f172a",
      strokeWidth: 0,
      strokeStyle: "dashed" as const,
      fillStyle: "hachure",
      backgroundColor: "#fcd34d",
      roughness: 1,
    };
    styleBriefGuideShape(shape, BRIEF_GUIDE_FILL.hero);
    expect(shape).toMatchObject({
      strokeColor: BRIEF_GUIDE_BORDER,
      strokeWidth: BRIEF_GUIDE_BORDER_WIDTH,
      strokeStyle: "solid",
      fillStyle: "solid",
      backgroundColor: BRIEF_GUIDE_GRAY,
      roughness: 0,
    });
    expect(new Set(Object.values(BRIEF_GUIDE_FILL)).size).toBe(1);
  });

  it("keeps guide text on a single readable gray", () => {
    const light = { strokeColor: "#000000" };
    const dark = { strokeColor: "#000000" };
    styleBriefGuideText(light);
    styleBriefGuideText(dark, true);
    expect(light.strokeColor).toBe(BRIEF_GUIDE_TEXT.default);
    expect(dark.strokeColor).toBe(BRIEF_GUIDE_TEXT.default);
  });
});
