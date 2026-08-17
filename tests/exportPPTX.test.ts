import { describe, expect, it } from "vitest";
import { getPptxSlideTransform } from "@/lib/engine/exportPPTX";

describe("PPTX mixed-ratio export", () => {
  it("centers a portrait artwork in a landscape deck without distortion", () => {
    const transform = getPptxSlideTransform(
      { width: 1080, height: 1350 },
      { width: 1920, height: 1080 },
    );

    expect(transform.scale).toBeCloseTo(0.8, 6);
    expect(transform.offsetX).toBeCloseTo(528, 6);
    expect(transform.offsetY).toBeCloseTo(0, 6);
  });

  it("keeps matching ratios at full scale", () => {
    expect(
      getPptxSlideTransform({ width: 1280, height: 720 }, { width: 1920, height: 1080 }),
    ).toEqual({ scale: 1.5, offsetX: 0, offsetY: 0 });
  });
});
