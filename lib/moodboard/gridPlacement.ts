import { elementWorldBBox, type Rect } from "@/lib/engine/bounds";
import type { EngineElement } from "@/lib/engine/types";
import {
  MOODBOARD_AI_BATCH_COUNT,
  MOODBOARD_CELL_GAP,
  MOODBOARD_CELL_SIZE,
  MOODBOARD_GRID_COLS,
} from "./constants";

export type MoodboardGridCell = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Place a 3×3 upright grid that does not cover existing artwork.
 * Prefer a clear patch to the right of current content; else below; else origin.
 */
export function findMoodboardGridOrigin(
  occupied: Rect[],
  options: {
    cellSize?: number;
    gap?: number;
    cols?: number;
    rows?: number;
    margin?: number;
  } = {},
): { x: number; y: number } {
  const cellSize = options.cellSize ?? MOODBOARD_CELL_SIZE;
  const gap = options.gap ?? MOODBOARD_CELL_GAP;
  const cols = options.cols ?? MOODBOARD_GRID_COLS;
  const rows = options.rows ?? MOODBOARD_GRID_COLS;
  const margin = options.margin ?? 80;
  const gridW = cols * cellSize + (cols - 1) * gap;
  const gridH = rows * cellSize + (rows - 1) * gap;

  if (!occupied.length) {
    return { x: margin, y: margin };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of occupied) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const candidates: Array<{ x: number; y: number }> = [
    { x: maxX + gap * 2, y: minY },
    { x: minX, y: maxY + gap * 2 },
    { x: maxX + gap * 2, y: maxY + gap * 2 },
    { x: margin, y: maxY + gap * 2 },
  ];

  for (const candidate of candidates) {
    const proposed: Rect = {
      x: candidate.x,
      y: candidate.y,
      width: gridW,
      height: gridH,
    };
    if (!occupied.some((rect) => rectsOverlap(rect, proposed, gap))) {
      return candidate;
    }
  }

  return { x: maxX + gap * 2, y: minY };
}

export function moodboardGridCells(
  origin: { x: number; y: number },
  count: number = MOODBOARD_AI_BATCH_COUNT,
  options: { cellSize?: number; gap?: number; cols?: number } = {},
): MoodboardGridCell[] {
  const cellSize = options.cellSize ?? MOODBOARD_CELL_SIZE;
  const gap = options.gap ?? MOODBOARD_CELL_GAP;
  const cols = options.cols ?? MOODBOARD_GRID_COLS;
  const cells: MoodboardGridCell[] = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      index: i + 1,
      x: Math.round(origin.x + col * (cellSize + gap)),
      y: Math.round(origin.y + row * (cellSize + gap)),
      width: cellSize,
      height: cellSize,
    });
  }
  return cells;
}

/** Fit natural image size into a square cell (contain), centered. */
export function fitImageInCell(
  cell: Pick<MoodboardGridCell, "x" | "y" | "width" | "height">,
  naturalWidth: number,
  naturalHeight: number,
): Rect {
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const scale = Math.min(cell.width / nw, cell.height / nh);
  const width = Math.max(1, Math.round(nw * scale));
  const height = Math.max(1, Math.round(nh * scale));
  return {
    x: Math.round(cell.x + (cell.width - width) / 2),
    y: Math.round(cell.y + (cell.height - height) / 2),
    width,
    height,
  };
}

export function occupiedRectsFromElements(elements: EngineElement[]): Rect[] {
  return elements.map((el) => elementWorldBBox(el));
}

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}
