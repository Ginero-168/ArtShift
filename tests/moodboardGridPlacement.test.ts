import { describe, expect, it } from "vitest";
import {
  beginProcessingPreview,
  clearProcessingPreview,
  getProcessingPreviewPlacement,
  PROCESSING_PREVIEW_GAP,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";
import {
  findMoodboardGridOrigin,
  fitImageInCell,
  moodboardGridCells,
} from "@/lib/moodboard/gridPlacement";
import { resolveMoodboardPreloadBounds } from "@/lib/moodboard/preloadPlacement";

describe("moodboard N×N grid placement", () => {
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

  it("returns a 4×4 layout for 16 images", () => {
    const cells = moodboardGridCells({ x: 0, y: 0 }, 16, { cellSize: 100, gap: 10, cols: 4 });
    expect(cells).toHaveLength(16);
    expect(cells[4]).toMatchObject({ x: 0, y: 110 });
    expect(cells[15]).toMatchObject({ x: 330, y: 330 });
  });

  it("returns a 5×5 layout for 25 images", () => {
    const cells = moodboardGridCells({ x: 0, y: 0 }, 25, { cellSize: 100, gap: 10, cols: 5 });
    expect(cells).toHaveLength(25);
    expect(cells[5]).toMatchObject({ x: 0, y: 110 });
    expect(cells[24]).toMatchObject({ x: 440, y: 440 });
  });

  it("anchors the preload card to the right of a selection", () => {
    const bounds = resolveMoodboardPreloadBounds({
      count: 9,
      occupied: [{ x: 40, y: 60, width: 200, height: 180 }],
      selected: { x: 40, y: 60, width: 200, height: 180 },
      cellSize: 100,
      gap: 10,
    });
    expect(bounds).toMatchObject({
      x: 40 + 200 + PROCESSING_PREVIEW_GAP,
      y: 60,
      width: 320,
      height: 320,
    });
  });

  it("does not cover other artwork when the right-hand preload footprint overlaps", () => {
    const selected = { x: 0, y: 0, width: 200, height: 200 };
    const blocker = { x: 232, y: 0, width: 400, height: 400 };
    const bounds = resolveMoodboardPreloadBounds({
      count: 9,
      occupied: [selected, blocker],
      selected,
      cellSize: 100,
      gap: 10,
    });
    expect(bounds.x).toBeGreaterThanOrEqual(blocker.x + blocker.width);
    const coversBlocker =
      bounds.x < blocker.x + blocker.width &&
      bounds.x + bounds.width > blocker.x &&
      bounds.y < blocker.y + blocker.height &&
      bounds.y + bounds.height > blocker.y;
    expect(coversBlocker).toBe(false);
  });

  it("centers an empty board in the viewport instead of the world origin", () => {
    const bounds = resolveMoodboardPreloadBounds({
      count: 9,
      occupied: [],
      viewport: {
        width: 1000,
        height: 800,
        scale: 1,
        tx: -200,
        ty: -100,
        slideWidth: 1000,
        slideHeight: 800,
      },
      cellSize: 100,
      gap: 10,
    });
    expect(bounds.x).not.toBe(0);
    expect(bounds.y).not.toBe(0);
    expect(bounds.width).toBe(320);
  });

  it("commits the grid at a dragged Preload origin", () => {
    const initial = { x: 400, y: 80, width: 320, height: 320 };
    const id = beginProcessingPreview({
      kind: "generate",
      label: "Moodboard 3×3",
      ...initial,
      progress: 0.2,
    });
    updateProcessingPreview(id, { x: 900, y: 200, userDragged: true });
    const placement = getProcessingPreviewPlacement(id, initial);
    const cells = moodboardGridCells({ x: placement.x, y: placement.y }, 9, {
      cols: 3,
      cellSize: 100,
      gap: 10,
    });
    expect(cells[0]).toMatchObject({ x: 900, y: 200 });
    clearProcessingPreview(id);
  });

  it("fits images into cells without rotation (contain)", () => {
    const fitted = fitImageInCell({ x: 0, y: 0, width: 200, height: 200 }, 400, 200);
    expect(fitted.width).toBe(200);
    expect(fitted.height).toBe(100);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(50);
  });
});
