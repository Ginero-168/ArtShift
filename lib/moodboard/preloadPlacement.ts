import type { Rect } from "@/lib/engine/bounds";
import type { CanvasViewportSnapshot } from "@/lib/engine/canvasViewport";
import { getVisibleWorldBounds } from "@/lib/engine/generationPlacement";
import { getProcessingPreviewBounds } from "@/lib/engine/processingPreview";
import {
  MOODBOARD_CELL_GAP,
  MOODBOARD_CELL_SIZE,
  type MoodboardBatchCount,
  moodboardGridSide,
} from "./constants";
import { findMoodboardGridOrigin } from "./gridPlacement";

export type MoodboardPreloadBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Pixel size of the whole N×N grid (cells + gaps), not one cell. */
export function moodboardGridPixelSize(
  count: MoodboardBatchCount,
  cellSize = MOODBOARD_CELL_SIZE,
  gap = MOODBOARD_CELL_GAP,
): { side: 3 | 4 | 5; width: number; height: number; cellSize: number; gap: number } {
  const side = moodboardGridSide(count);
  const span = side * cellSize + Math.max(0, side - 1) * gap;
  return { side, width: span, height: span, cellSize, gap };
}

/**
 * Initial Preload card for a Moodboard grid.
 * - With a selection, anchor to the right of it (same gap as Upscale / Layer).
 * - If that footprint covers other artwork, search for a clear patch.
 * - On an empty board, center the grid in the visible viewport so it is not at (0, 0).
 * The committed grid uses `getProcessingPreviewPlacement` so a drag moves this origin.
 */
export function resolveMoodboardPreloadBounds(input: {
  count: MoodboardBatchCount;
  occupied: Rect[];
  selected?: Rect | null;
  viewport?: CanvasViewportSnapshot | null;
  cellSize?: number;
  gap?: number;
}): MoodboardPreloadBounds {
  const sized = moodboardGridPixelSize(input.count, input.cellSize, input.gap);
  const { width, height, side, cellSize, gap } = sized;

  const selected = input.selected;
  if (selected && selected.width > 0 && selected.height > 0) {
    const beside = getProcessingPreviewBounds(selected);
    const proposed: Rect = { x: beside.x, y: beside.y, width, height };
    const others = input.occupied.filter((rect) => !isSameRect(rect, selected));
    if (!others.some((rect) => rectsOverlap(rect, proposed, gap))) {
      return { x: proposed.x, y: proposed.y, width, height };
    }
  }

  if (input.occupied.length === 0 && input.viewport) {
    const visible = getVisibleWorldBounds(input.viewport);
    return {
      x: Math.round(visible.x + (visible.width - width) / 2),
      y: Math.round(visible.y + (visible.height - height) / 2),
      width,
      height,
    };
  }

  const origin = findMoodboardGridOrigin(input.occupied, {
    cellSize,
    gap,
    cols: side,
    rows: side,
  });
  return { x: origin.x, y: origin.y, width, height };
}

function isSameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}
