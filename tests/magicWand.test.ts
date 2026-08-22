import { describe, expect, it } from "vitest";
import {
  createMagicWandMask,
  createQuickSelectionMask,
  scaledRasterSize,
} from "@/lib/raster/magicWand";

function pixels(rows: string[]): { width: number; height: number; data: Uint8ClampedArray } {
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * rows.length * 4);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value =
        rows[y][x] === "r" ? 220 : rows[y][x] === "b" ? 20 : rows[y][x] === "n" ? 224 : 110;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height: rows.length, data };
}

describe("Magic Wand pixel selection", () => {
  it("selects only the contiguous region, not disconnected matching pixels", () => {
    const image = pixels(["rrbrr", "rrbrr", "rrbrr"]);
    const mask = createMagicWandMask(image, 0, 1, 0);

    expect(Array.from(mask)).toEqual([1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0]);
  });

  it("uses tolerance for nearby colors and caps working dimensions", () => {
    const image = pixels(["nnn", "nrn", "nnn"]);
    expect(createMagicWandMask(image, 1, 1, 0).reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(createMagicWandMask(image, 1, 1, 10).reduce((sum, value) => sum + value, 0)).toBe(9);

    expect(scaledRasterSize(4000, 4000, 1_000_000)).toEqual({ width: 1000, height: 1000 });
  });

  it("limits Quick Selection to a connected brush-sized neighborhood", () => {
    const image = pixels(["rrrrr", "rrrrr", "rrrrr"]);
    const mask = createQuickSelectionMask(image, 2, 1, 1.1, 1.1, 0);

    expect(Array.from(mask)).toEqual([0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0]);
  });
});
