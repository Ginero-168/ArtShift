import { describe, expect, it } from "vitest";
import {
  applyAlphaToImageData,
  normalizeMatteValues,
  resizeMatteToAlpha,
} from "@/lib/ai/removeBgPostprocess";

describe("Remove BG matte post-processing", () => {
  it("normalizes model logits before converting them to alpha", () => {
    const normalized = normalizeMatteValues(new Float32Array([0.2, 0.4, 0.8, 1]));

    expect(Array.from(normalized).map((value) => Number(value.toFixed(3)))).toEqual([
      0, 0.25, 0.75, 1,
    ]);
  });

  it("resizes normalized matte values before quantizing alpha", () => {
    const alpha = resizeMatteToAlpha(new Float32Array([0, 0.5, 1]), 3, 1, 7, 1);

    expect(Array.from(alpha)).toEqual([0, 18, 73, 128, 182, 237, 255]);
  });

  it("supports a gentle black/white point adjustment without hard clipping edges", () => {
    const alpha = resizeMatteToAlpha(new Float32Array([0, 0.25, 0.5, 0.75, 1]), 5, 1, 5, 1, {
      blackPoint: 0.1,
      whitePoint: 0.9,
    });

    expect(Array.from(alpha)).toEqual([0, 48, 128, 207, 255]);
  });

  it("composites RGBA source pixels without shifting channels", () => {
    const rgba = applyAlphaToImageData(
      new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]),
      4,
      new Uint8ClampedArray([100, 200]),
    );

    expect(Array.from(rgba)).toEqual([10, 20, 30, 100, 50, 60, 70, 200]);
  });
});
