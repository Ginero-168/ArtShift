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

  it("stores paint metadata and keeps pressure aligned when compacting", () => {
    const points = Array.from({ length: 1200 }, (_, index) => [index, index] as [number, number]);
    const pressures = Array.from({ length: 1200 }, (_, index) => index / 1199);
    const stroke = createRasterStroke(points, 18, 0.6, {
      mode: "paint",
      color: "#ff6b35",
      hardness: 0.35,
      pressures,
    });
    const compacted = compactRasterStroke(stroke);

    expect(stroke.mode).toBe("paint");
    expect(stroke.color).toBe("#ff6b35");
    expect(stroke.hardness).toBe(0.35);
    expect(compacted.pressures).toHaveLength(compacted.points.length);
    expect(compacted.pressures?.at(-1)).toBe(1);
  });

  it("stores a Selection snapshot without requiring a PNG per stroke", () => {
    const selection = {
      width: 100,
      height: 100,
      operations: [
        {
          id: "selection-1",
          mode: "replace" as const,
          shape: { kind: "rect" as const, x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        },
      ],
    };
    const stroke = createRasterStroke([[20, 20]], 32, 1, {
      mode: "paint",
      selection,
    });

    expect(stroke.selection).toEqual(selection);
    expect(stroke.selectionMaskDataUrl).toBeUndefined();
  });
});
