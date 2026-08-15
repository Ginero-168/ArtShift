import { describe, expect, it } from "vitest";
import {
  blockPlacementForRect,
  blockRectForPlacement,
  getAllHexCells,
  getHexGridDimensions,
  getHexMetrics,
  placementOverlapCells,
  placementsFit,
  reflowBlockItems,
  remapBlockPlacement,
} from "@/lib/engine/hexLayout";

describe("hex block layout", () => {
  it("keeps the 16:9 reference workspace at 288 six-sided cells", () => {
    const cells = getAllHexCells(1920, 1080);
    expect(cells).toHaveLength(288);
    expect(cells.every((cell) => cell.points.length === 6)).toBe(true);
  });

  it.each([
    { label: "square", width: 1080, height: 1080 },
    { label: "portrait", width: 1080, height: 1350 },
    { label: "story", width: 1080, height: 1920 },
    { label: "A4", width: 2480, height: 3508 },
  ])("fills $label artwork instead of preserving the 16:9 grid shape", ({ width, height }) => {
    const metrics = getHexMetrics(width, height);
    const gridWidth = metrics.radius * 2 + (metrics.columns - 1) * metrics.stepX;
    const gridHeight = metrics.cellHeight * (metrics.rows + 0.5);
    const cells = getAllHexCells(width, height);

    expect(gridWidth / width).toBeGreaterThanOrEqual(0.85);
    expect(gridHeight / height).toBeGreaterThanOrEqual(0.85);
    expect(cells).toHaveLength(metrics.columns * metrics.rows);
    expect(cells.length).toBeGreaterThanOrEqual(270);
    expect(cells.length).toBeLessThanOrEqual(306);
  });

  it("round-trips placement through artwork geometry", () => {
    const placement = { col: 4, row: 3, colSpan: 10, rowSpan: 4 };
    const rect = blockRectForPlacement(placement, 1920, 1080);
    expect(blockPlacementForRect(rect, 1920, 1080)).toMatchObject(placement);
  });

  it("preserves a Block's relative footprint when the Artwork ratio changes", () => {
    const landscape = getHexGridDimensions(1920, 1080);
    const portrait = getHexGridDimensions(1080, 1350);
    const remapped = remapBlockPlacement(
      { col: 6, row: 3, colSpan: 12, rowSpan: 6 },
      landscape,
      portrait,
    );

    expect(landscape).toEqual({ columns: 24, rows: 12 });
    expect(portrait).toEqual({ columns: 16, rows: 18 });
    expect(remapped).toMatchObject({ col: 4, row: 5, colSpan: 8, rowSpan: 9 });
  });

  it("maps strictness levels to zero, one, and two shared cells", () => {
    const base = { col: 0, row: 0, colSpan: 4, rowSpan: 2 };
    const oneCell = { col: 3, row: 1, colSpan: 4, rowSpan: 2 };
    const twoCells = { col: 3, row: 0, colSpan: 4, rowSpan: 2 };

    expect(placementOverlapCells(base, oneCell)).toBe(1);
    expect(placementsFit(base, oneCell, 1)).toBe(false);
    expect(placementsFit(base, oneCell, 2)).toBe(true);
    expect(placementsFit(base, twoCells, 2)).toBe(false);
    expect(placementsFit(base, twoCells, 3)).toBe(true);
  });

  it("gives a dragged Object priority and reflows collisions", () => {
    const a = { col: 0, row: 0, colSpan: 8, rowSpan: 3 };
    const b = { col: 8, row: 0, colSpan: 8, rowSpan: 3 };
    const result = reflowBlockItems(
      [
        { id: "a", placement: a },
        { id: "b", placement: b },
      ],
      { anchorId: "a", anchorPlacement: b, strictness: 1 },
    );

    expect(result.placements.get("a")).toMatchObject(b);
    expect(result.overflowIds).toEqual([]);
    expect(placementOverlapCells(result.placements.get("a")!, result.placements.get("b")!)).toBe(0);
  });
});
