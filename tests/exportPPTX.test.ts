import { describe, expect, it } from "vitest";
import { getPptxSlideTransform, shouldRasterizeImageForPptx } from "@/lib/engine/exportPPTX";
import { createImage } from "@/lib/engine/factory";

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

  it("rasterizes non-destructive image edits before PPTX export", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      fileId: "image-1",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    expect(shouldRasterizeImageForPptx(image)).toBe(false);
    expect(
      shouldRasterizeImageForPptx({
        ...image,
        crop: { x: 20, y: 10, width: 280, height: 200 },
      }),
    ).toBe(true);
    expect(
      shouldRasterizeImageForPptx({
        ...image,
        rasterMask: [
          {
            id: "stroke-1",
            mode: "erase",
            points: [[20, 20]],
            size: 12,
            opacity: 1,
            hardness: 1,
          },
        ],
      }),
    ).toBe(true);
  });
});
