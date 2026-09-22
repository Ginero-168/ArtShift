import {
  MOODBOARD_CELL_SIZE,
  MOODBOARD_GRID_COLUMNS,
  MOODBOARD_GRID_GAP,
  MOODBOARD_GRID_ROWS,
  MOODBOARD_IMAGE_COUNT,
} from "./constants";

export type MoodboardGridCell = {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MoodboardGridLayout = {
  origin: { x: number; y: number };
  cellWidth: number;
  cellHeight: number;
  gap: number;
  columns: number;
  rows: number;
  cells: MoodboardGridCell[];
  bounds: { x: number; y: number; width: number; height: number };
};

/**
 * Lay out exactly 9 upright cells in a 3×3 grid for Moodboard AI fill.
 * Does not rotate; images stay at 0°.
 */
export function layoutMoodboard3x3(
  origin: { x: number; y: number },
  options: {
    cellWidth?: number;
    cellHeight?: number;
    gap?: number;
    count?: number;
  } = {},
): MoodboardGridLayout {
  const cellWidth = Math.max(48, Math.round(options.cellWidth ?? MOODBOARD_CELL_SIZE));
  const cellHeight = Math.max(48, Math.round(options.cellHeight ?? MOODBOARD_CELL_SIZE));
  const gap = Math.max(0, Math.round(options.gap ?? MOODBOARD_GRID_GAP));
  const count = Math.max(
    1,
    Math.min(MOODBOARD_IMAGE_COUNT, Math.floor(options.count ?? MOODBOARD_IMAGE_COUNT)),
  );
  const columns = MOODBOARD_GRID_COLUMNS;
  const rows = MOODBOARD_GRID_ROWS;
  const cells: MoodboardGridCell[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    cells.push({
      index,
      row,
      column,
      x: Math.round(origin.x + column * (cellWidth + gap)),
      y: Math.round(origin.y + row * (cellHeight + gap)),
      width: cellWidth,
      height: cellHeight,
    });
  }

  const width = columns * cellWidth + (columns - 1) * gap;
  const height = rows * cellHeight + (rows - 1) * gap;

  return {
    origin: { x: Math.round(origin.x), y: Math.round(origin.y) },
    cellWidth,
    cellHeight,
    gap,
    columns,
    rows,
    cells,
    bounds: {
      x: Math.round(origin.x),
      y: Math.round(origin.y),
      width,
      height,
    },
  };
}

/** Bounds for cell `index` (0-based) within an existing layout. */
export function moodboardCellBounds(
  layout: MoodboardGridLayout,
  index: number,
): MoodboardGridCell | null {
  return layout.cells[index] ?? null;
}
