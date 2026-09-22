import { describe, expect, it } from "vitest";
import {
  findMoodboardGridOrigin,
  fitImageInCell,
  moodboardGridCells,
} from "@/lib/moodboard/gridPlacement";

describe("moodboard 3×3 grid placement", () => {
  it("returns a 3×3 upright cell layout", () => {
    const cells = moodboardGridCells({ x: 100, y: 200 }, 9, { cellSize: 100, gap: 10 });
    expect(cells).toHaveLength(9);
    expect(cells[0]).toMatchObject({ x: 100, y: 200, width: 100, height: 100 });
    expect(cells[1]).toMatchObject({ x: 210, y: 200 });
    expect(cells[3]).toMatchObject({ x: 100, y: 310 });
    expect(cells[8]).toMatchObject({ x: 320, y: 420 });
  });

  it("places the grid to the right of existing artwork instead of overlapping", () => {
    const origin = findMoodboardGridOrigin([{ x: 0, y: 0, width: 400, height: 300 }], {
      cellSize: 100,
      gap: 20,
      margin: 40,
    });
    expect(origin.x).toBeGreaterThanOrEqual(400);
    const cells = moodboardGridCells(origin, 9, { cellSize: 100, gap: 20 });
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(400);
    }
  });

  it("fits images into cells without rotation (contain)", () => {
    const fitted = fitImageInCell({ x: 0, y: 0, width: 200, height: 200 }, 400, 200);
    expect(fitted.width).toBe(200);
    expect(fitted.height).toBe(100);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(50);
  });
});
