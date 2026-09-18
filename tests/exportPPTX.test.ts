import { describe, expect, it } from "vitest";
import {
  getPptxClippedChildIds,
  getPptxSlideTransform,
  shouldRasterizeElementForPptx,
  shouldRasterizeImageForPptx,
} from "@/lib/engine/exportPPTX";
import { createFrame, createImage, createText } from "@/lib/engine/factory";
import type { EngineSlide } from "@/lib/engine/types";

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
    expect(
      shouldRasterizeImageForPptx({
        ...image,
        rasterEdits: [
          {
            id: "edit-1",
            mode: "heal",
            dataUrl: "data:image/png;base64,AAAA",
            x: 10,
            y: 10,
            width: 20,
            height: 20,
            opacity: 1,
          },
        ],
      }),
    ).toBe(true);
  });

  it("treats frames and clipped children as rasterized PPTX objects", () => {
    const frame = createFrame({
      x: 40,
      y: 40,
      width: 400,
      height: 240,
      name: "Hero frame",
    });
    const child = createText({
      x: 60,
      y: 70,
      text: "Inside the frame",
      width: 200,
    });
    frame.childIds = [child.id];
    const slide = {
      id: "slide-1",
      name: "Slide 1",
      background: "#fff",
      width: 1920,
      height: 1080,
      elements: [frame, child],
      layers: [],
    } as EngineSlide;

    const clipped = getPptxClippedChildIds(slide);
    expect(clipped.has(child.id)).toBe(true);
    expect(shouldRasterizeElementForPptx(frame, clipped)).toBe(true);
    expect(shouldRasterizeElementForPptx(child, clipped)).toBe(true);
  });
});
