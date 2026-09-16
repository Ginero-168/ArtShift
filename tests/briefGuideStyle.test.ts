import { describe, expect, it } from "vitest";
import {
  BRIEF_GUIDE_FILL,
  BRIEF_GUIDE_TEXT,
  styleBriefGuideShape,
  styleBriefGuideText,
} from "@/lib/ai/briefGuideStyle";

describe("briefGuideStyle", () => {
  it("applies fill-only monochrome styling with no outline stroke", () => {
    const shape = {
      strokeColor: "#0f172a",
      strokeWidth: 2,
      strokeStyle: "dashed" as const,
      fillStyle: "hachure",
      backgroundColor: "#fcd34d",
      roughness: 1,
    };
    styleBriefGuideShape(shape, BRIEF_GUIDE_FILL.hero);
    expect(shape).toMatchObject({
      strokeColor: "transparent",
      strokeWidth: 0,
      strokeStyle: "solid",
      fillStyle: "solid",
      backgroundColor: BRIEF_GUIDE_FILL.hero,
      roughness: 0,
    });
  });

  it("uses readable gray text on light and dark guide fills", () => {
    const light = { strokeColor: "#000000" };
    const dark = { strokeColor: "#000000" };
    styleBriefGuideText(light);
    styleBriefGuideText(dark, true);
    expect(light.strokeColor).toBe(BRIEF_GUIDE_TEXT.default);
    expect(dark.strokeColor).toBe(BRIEF_GUIDE_TEXT.onFooter);
  });
});
