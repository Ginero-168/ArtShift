import { describe, expect, it } from "vitest";
import { MOODBOARD_IMAGE_COUNT } from "@/lib/moodboard/constants";
import { layoutMoodboard3x3 } from "@/lib/moodboard/layoutGrid";
import { findMoodboardStagingOrigin, moodboardGridFootprint } from "@/lib/moodboard/stagingOrigin";

describe("moodboard 3×3 layout", () => {
  it("places exactly 9 upright non-overlapping cells", () => {
    const layout = layoutMoodboard3x3({ x: 100, y: 200 });
    expect(layout.cells).toHaveLength(MOODBOARD_IMAGE_COUNT);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(3);

    for (let i = 0; i < layout.cells.length; i += 1) {
      for (let j = i + 1; j < layout.cells.length; j += 1) {
        const a = layout.cells[i];
        const b = layout.cells[j];
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap).toBe(false);
      }
    }

    expect(layout.cells[0]).toMatchObject({ row: 0, column: 0, x: 100, y: 200 });
    expect(layout.cells[4]).toMatchObject({ row: 1, column: 1 });
    expect(layout.cells[8]).toMatchObject({ row: 2, column: 2 });
  });

  it("reports a stable footprint for the default grid", () => {
    const footprint = moodboardGridFootprint(320, 24);
    expect(footprint).toEqual({ width: 320 * 3 + 24 * 2, height: 320 * 3 + 24 * 2 });
  });
});

describe("moodboard staging origin", () => {
  it("centers on an empty viewport", () => {
    const origin = findMoodboardStagingOrigin([], {
      x: 0,
      y: 0,
      width: 2000,
      height: 1400,
    });
    const footprint = moodboardGridFootprint();
    expect(origin.x).toBe(Math.round((2000 - footprint.width) / 2));
    expect(origin.y).toBe(Math.round((1400 - footprint.height) / 2));
  });

  it("avoids covering existing work by shifting beside occupied bounds", () => {
    const existing = [{ x: 100, y: 100, width: 900, height: 900 }];
    const origin = findMoodboardStagingOrigin(existing, {
      x: 0,
      y: 0,
      width: 1200,
      height: 1200,
    });
    const layout = layoutMoodboard3x3(origin);
    const overlaps = existing.some(
      (el) =>
        layout.bounds.x < el.x + el.width &&
        layout.bounds.x + layout.bounds.width > el.x &&
        layout.bounds.y < el.y + el.height &&
        layout.bounds.y + layout.bounds.height > el.y,
    );
    expect(overlaps).toBe(false);
    expect(origin.x).toBeGreaterThan(existing[0].x + existing[0].width);
  });

  it("falls back near board origin when there is no viewport", () => {
    expect(findMoodboardStagingOrigin([], null)).toEqual({ x: 80, y: 80 });
  });
});
