import { describe, expect, it } from "vitest";
import {
  createAlphaTiles,
  findAlphaComponents,
  mapAlphaComponentToImage,
  mergeAlphaComponents,
} from "@/lib/vision/alphaComponents";

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

  it("creates overlapping tiles that cover the full image", () => {
    expect(createAlphaTiles(1400, 900, 512, 64)).toEqual([
      { x: 0, y: 0, width: 512, height: 512 },
      { x: 448, y: 0, width: 512, height: 512 },
      { x: 888, y: 0, width: 512, height: 512 },
      { x: 0, y: 388, width: 512, height: 512 },
      { x: 448, y: 388, width: 512, height: 512 },
      { x: 888, y: 388, width: 512, height: 512 },
    ]);
  });

  it("maps and merges a component duplicated across overlapping tiles", () => {
    const tile = { x: 448, y: 0, width: 512, height: 512 };
    const mapped = mapAlphaComponentToImage(
      { x_min: 0, y_min: 0.2, x_max: 0.4, y_max: 0.6, area: 100 },
      tile,
      1400,
      900,
    );
    const merged = mergeAlphaComponents([
      { x_min: 0.31, y_min: 0.1, x_max: 0.5, y_max: 0.35, area: 120 },
      mapped,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ x_min: 0.31, x_max: 0.5 });
  });

  it("does not merge separate nearby objects from a small padded overlap", () => {
    const merged = mergeAlphaComponents([
      { x_min: 0.1, y_min: 0.1, x_max: 0.2, y_max: 0.2, area: 100 },
      { x_min: 0.19, y_min: 0.1, x_max: 0.29, y_max: 0.2, area: 100 },
    ]);

    expect(merged).toHaveLength(2);
  });
});
