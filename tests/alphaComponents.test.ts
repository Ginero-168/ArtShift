import { describe, expect, it } from "vitest";
import { findAlphaComponents } from "@/lib/vision/alphaComponents";

describe("alpha component extraction", () => {
  it("returns separate normalized boxes for disconnected foreground regions", () => {
    const rgba = new Uint8ClampedArray(12 * 4);
    for (const pixel of [0, 1, 6, 7, 4, 5, 10, 11]) rgba[pixel * 4 + 3] = 255;

    const boxes = findAlphaComponents(rgba, 6, 2, { minAreaRatio: 0.01, padding: 0 });

    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ x_min: 0, x_max: 1 / 3, y_min: 0, y_max: 1 });
    expect(boxes[1]).toMatchObject({ x_min: 2 / 3, x_max: 1, y_min: 0, y_max: 1 });
  });

  it("ignores tiny transparent noise", () => {
    const rgba = new Uint8ClampedArray(49 * 4);
    rgba[0 * 4 + 3] = 255;
    for (const pixel of [16, 17, 18, 23, 24, 25, 30, 31, 32]) rgba[pixel * 4 + 3] = 255;

    const boxes = findAlphaComponents(rgba, 7, 7, { minAreaRatio: 0.1, padding: 0 });

    expect(boxes).toHaveLength(1);
    expect(boxes[0].area).toBe(9);
  });
});
