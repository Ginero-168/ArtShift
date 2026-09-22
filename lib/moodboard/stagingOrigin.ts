import {
  MOODBOARD_CELL_SIZE,
  MOODBOARD_GRID_COLUMNS,
  MOODBOARD_GRID_GAP,
  MOODBOARD_GRID_ROWS,
} from "./constants";
import { layoutMoodboard3x3 } from "./layoutGrid";

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Pick a staging origin for the 3×3 Moodboard grid.
 * Prefer the visible viewport center when empty; otherwise place beside
 * existing work (right of the occupied union, or near board origin).
 */
export function findMoodboardStagingOrigin(
  elements: WorldRect[],
  viewport: WorldRect | null,
  options: { cellSize?: number; gap?: number; padding?: number } = {},
): { x: number; y: number } {
  const cellSize = options.cellSize ?? MOODBOARD_CELL_SIZE;
  const gap = options.gap ?? MOODBOARD_GRID_GAP;
  const padding = options.padding ?? 48;
  const grid = layoutMoodboard3x3(
    { x: 0, y: 0 },
    { cellWidth: cellSize, cellHeight: cellSize, gap },
  );
  const gridW = grid.bounds.width;
  const gridH = grid.bounds.height;

  const candidates: { x: number; y: number }[] = [];

  if (viewport && viewport.width > 0 && viewport.height > 0) {
    candidates.push({
      x: Math.round(viewport.x + (viewport.width - gridW) / 2),
      y: Math.round(viewport.y + (viewport.height - gridH) / 2),
    });
    candidates.push({
      x: Math.round(viewport.x + padding),
      y: Math.round(viewport.y + padding),
    });
  }

  const live = elements.filter((el) => el.width > 0 && el.height > 0);
  if (live.length) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const el of live) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    candidates.push({
      x: Math.round(maxX + MOODBOARD_GRID_GAP + padding),
      y: Math.round(minY),
    });
    candidates.push({
      x: Math.round(minX),
      y: Math.round(maxY + MOODBOARD_GRID_GAP + padding),
    });
  }

  // Board origin staging — matches earlier Moodboard role-cluster spirit.
  candidates.push({ x: 80, y: 80 });
  candidates.push({ x: 0, y: 0 });

  for (const origin of candidates) {
    const proposed = layoutMoodboard3x3(origin, {
      cellWidth: cellSize,
      cellHeight: cellSize,
      gap,
    }).bounds;
    if (!overlapsAny(proposed, live, padding / 2)) {
      return { x: origin.x, y: origin.y };
    }
  }

  // Last resort: right of everything, preserving a quiet empty strip.
  if (live.length) {
    const maxX = Math.max(...live.map((el) => el.x + el.width));
    const minY = Math.min(...live.map((el) => el.y));
    return {
      x: Math.round(maxX + MOODBOARD_GRID_GAP + padding),
      y: Math.round(minY),
    };
  }

  return { x: 80, y: 80 };
}

function overlapsAny(a: WorldRect, others: WorldRect[], inset: number): boolean {
  const ax1 = a.x + inset;
  const ay1 = a.y + inset;
  const ax2 = a.x + a.width - inset;
  const ay2 = a.y + a.height - inset;
  if (ax2 <= ax1 || ay2 <= ay1) return false;
  for (const b of others) {
    if (rectsOverlap(ax1, ay1, ax2, ay2, b.x, b.y, b.x + b.width, b.y + b.height)) {
      return true;
    }
  }
  return false;
}

function rectsOverlap(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): boolean {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

/** Total footprint of a default 3×3 moodboard grid. */
export function moodboardGridFootprint(
  cellSize = MOODBOARD_CELL_SIZE,
  gap = MOODBOARD_GRID_GAP,
): { width: number; height: number } {
  return {
    width: MOODBOARD_GRID_COLUMNS * cellSize + (MOODBOARD_GRID_COLUMNS - 1) * gap,
    height: MOODBOARD_GRID_ROWS * cellSize + (MOODBOARD_GRID_ROWS - 1) * gap,
  };
}
