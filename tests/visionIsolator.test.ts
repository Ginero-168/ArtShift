import { describe, expect, it } from "vitest";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import {
  alphaBoundsFromRgba,
  alphaCoverageFromRgba,
  hasUsableForeground,
  isForegroundForSource,
  shouldPreserveForegroundPixel,
} from "@/lib/vision/foreground";
import { composeInstanceAlpha, resolveInstanceMaskOverlaps } from "@/lib/vision/instanceMask";

describe("Vision AI Object Isolator & Calculations", () => {
  it("calculates correct pixel crop bounds from normalized bounding boxes", () => {
    const naturalWidth = 1200;
    const naturalHeight = 800;

    const bbox = {
      x_min: 0.25, // 300px
      y_min: 0.2, // 160px
      x_max: 0.75, // 900px
      y_max: 0.8, // 640px
    };

    const sx = Math.max(0, Math.round(bbox.x_min * naturalWidth));
    const sy = Math.max(0, Math.round(bbox.y_min * naturalHeight));
    const sw = Math.min(naturalWidth - sx, Math.round((bbox.x_max - bbox.x_min) * naturalWidth));
    const sh = Math.min(naturalHeight - sy, Math.round((bbox.y_max - bbox.y_min) * naturalHeight));

    expect(sx).toBe(300);
    expect(sy).toBe(160);
    expect(sw).toBe(600);
    expect(sh).toBe(480);
  });

  it("calculates canvas world placement for isolated objects", () => {
    const parentElement = {
      x: 100,
      y: 200,
      width: 400,
      height: 300,
    };

    const obj = {
      label: "cup",
      x_min: 0.5,
      y_min: 0.4,
      x_max: 0.8,
      y_max: 0.9,
    };

    const objWidth = Math.max(20, Math.round(parentElement.width * (obj.x_max - obj.x_min)));
    const objHeight = Math.max(20, Math.round(parentElement.height * (obj.y_max - obj.y_min)));
    const objX = Math.round(parentElement.x + parentElement.width * obj.x_min);
    const objY = Math.round(parentElement.y + parentElement.height * obj.y_min);

    expect(objWidth).toBe(120); // 0.3 * 400
    expect(objHeight).toBe(150); // 0.5 * 300
    expect(objX).toBe(300); // 100 + 400*0.5
    expect(objY).toBe(320); // 200 + 300*0.4
  });

  it("rejects transparent detector crops instead of creating empty rectangles", () => {
    const coverage = alphaCoverageFromRgba(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]));

    expect(coverage).toBe(0.5);
    expect(hasUsableForeground(0.005)).toBe(false);
    expect(hasUsableForeground(coverage)).toBe(true);
  });

  it("does not let a segmentation mask erase known foreground pixels", () => {
    expect(shouldPreserveForegroundPixel(255, 0)).toBe(true);
    expect(shouldPreserveForegroundPixel(0, 0)).toBe(false);
    expect(shouldPreserveForegroundPixel(0, 255)).toBe(true);
  });

  it("keeps thin foreground accessories when an instance mask misses them", () => {
    const composed = composeInstanceAlpha(
      new Uint8ClampedArray([255, 220, 0, 0]),
      new Uint8ClampedArray([255, 0, 0, 255]),
    );

    expect(Array.from(composed)).toEqual([255, 220, 0, 255]);
  });

  it("can fall back to a refinement-only mask when source alpha is not trusted", () => {
    const composed = composeInstanceAlpha(
      new Uint8ClampedArray([255, 255, 0]),
      new Uint8ClampedArray([0, 255, 255]),
      { preserveSourceAlpha: false },
    );

    expect(Array.from(composed)).toEqual([0, 255, 255]);
  });

  it("assigns overlapping mask pixels to only one extracted object", () => {
    const resolved = resolveInstanceMaskOverlaps([
      {
        box: { x_min: 0, y_min: 0, x_max: 2 / 3, y_max: 1 },
        mask: { width: 3, height: 1, data: new Uint8Array([1, 1, 0]), score: 0.8 },
      },
      {
        box: { x_min: 1 / 3, y_min: 0, x_max: 1, y_max: 1 },
        mask: { width: 3, height: 1, data: new Uint8Array([0, 1, 1]), score: 0.9 },
      },
    ]);

    expect(Array.from(resolved[0].data)).toEqual([1, 0, 0]);
    expect(Array.from(resolved[1].data)).toEqual([0, 1, 1]);
  });

  it("reuses a foreground result only for the source image that produced it", () => {
    expect(
      isForegroundForSource("foreground-file", "foreground-file", "data:image/png;base64,x"),
    ).toBe(true);
    expect(isForegroundForSource("new-source", "foreground-file", "data:image/png;base64,x")).toBe(
      false,
    );
    expect(isForegroundForSource("foreground-file", "foreground-file", null)).toBe(false);
  });

  it("uses the image cache key instead of a raw data URL for extracted objects", () => {
    expect(createCachedImageAsset({ fileId: "asset-hash", width: 320, height: 180 })).toEqual({
      fileId: "asset-hash",
      naturalWidth: 320,
      naturalHeight: 180,
    });
  });

  it("finds tight alpha bounds without trimming the visible edge", () => {
    const rgba = new Uint8ClampedArray(5 * 4 * 4);
    for (const pixel of [7, 8, 12, 13]) rgba[pixel * 4 + 3] = 255;

    expect(alphaBoundsFromRgba(rgba, 5, 4, 8, 1)).toEqual({
      x: 1,
      y: 0,
      width: 4,
      height: 4,
    });
  });
});
