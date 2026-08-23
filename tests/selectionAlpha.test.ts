import { describe, expect, it } from "vitest";
import { invertSelectionAlpha } from "@/lib/raster/selection";

describe("raster Selection alpha operations", () => {
  it("inverts only alpha while preserving RGB", () => {
    const source = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 200]);

    expect(Array.from(invertSelectionAlpha(source))).toEqual([10, 20, 30, 255, 40, 50, 60, 55]);
    expect(Array.from(source)).toEqual([10, 20, 30, 0, 40, 50, 60, 200]);
  });
});
