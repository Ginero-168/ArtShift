import { describe, expect, it } from "vitest";
import { appendRasterMaskStroke, compactRasterStroke, createRasterStroke } from "@/lib/raster/mask";

describe("raster mask edits", () => {
  it("keeps pixel eraser strokes attached to an image-local coordinate space", () => {
    const stroke = createRasterStroke(
      [
        [12, 20],
        [30, 44],
      ],
      48,
      0.75,
    );

    expect(stroke.mode).toBe("erase");
    expect(stroke.points).toEqual([
      [12, 20],
      [30, 44],
    ]);
    expect(stroke.size).toBe(48);
    expect(stroke.opacity).toBe(0.75);
  });

  it("compacts unusually long strokes and appends without mutating history", () => {
    const points = Array.from({ length: 1200 }, (_, index) => [index, index] as [number, number]);
    const stroke = createRasterStroke(points, 24);
    const compacted = compactRasterStroke(stroke);
    const existing = [createRasterStroke([[1, 1]], 12)];
    const next = appendRasterMaskStroke(existing, stroke);

    expect(compacted.points.length).toBeLessThanOrEqual(512);
    expect(compacted.points.at(-1)).toEqual([1199, 1199]);
    expect(existing).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(existing[0]);
  });
});
