import type { BlockPlacement, WorkspaceStrictness } from "./types";

/** The 16:9 reference stays at 24 × 12: twice the original 12 × 12 workspace. */
export const HEX_COLUMNS = 24;
export const HEX_ROWS = 12;
export const HEX_TARGET_CELLS = HEX_COLUMNS * HEX_ROWS;

export type HexPoint = { x: number; y: number };
export type HexCell = {
  col: number;
  row: number;
  center: HexPoint;
  points: HexPoint[];
};
export type BlockRect = { x: number; y: number; width: number; height: number };
export type HexGridDimensions = { columns: number; rows: number };

export type HexMetrics = HexGridDimensions & {
  radius: number;
  cellHeight: number;
  stepX: number;
  originX: number;
  originY: number;
};

export type BlockLayoutItem = {
  id: string;
  placement: BlockPlacement;
};

export type BlockLayoutResult = {
  placements: Map<string, BlockPlacement>;
  overflowIds: string[];
};

export const REFERENCE_HEX_GRID: HexGridDimensions = {
  columns: HEX_COLUMNS,
  rows: HEX_ROWS,
};

const SQRT_3 = Math.sqrt(3);
const WORKSPACE_FILL = 0.92;
const MIN_GRID_CELLS = Math.round(HEX_TARGET_CELLS * 0.75);
const MAX_GRID_CELLS = Math.round(HEX_TARGET_CELLS * 1.25);
const MIN_AXIS_CELLS = 2;
const MAX_AXIS_CELLS = 96;
const CACHE_LIMIT = 48;
const gridCache = new Map<string, HexGridDimensions>();
const metricsCache = new Map<string, HexMetrics>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Keep roughly 288 cells while changing rows and columns to match the Artwork.
 * This preserves the familiar 24 × 12 landscape grid without letterboxing
 * square, portrait, Story, A4, or custom aspect ratios into a landscape band.
 */
export function getHexGridDimensions(width: number, height: number): HexGridDimensions {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const cacheKey = aspect.toFixed(6);
  const cached = gridCache.get(cacheKey);
  if (cached) return cached;

  let best = REFERENCE_HEX_GRID;
  let bestScore = Infinity;
  let bestDensityError = Infinity;

  for (let rows = MIN_AXIS_CELLS; rows <= MAX_AXIS_CELLS; rows++) {
    for (let columns = MIN_AXIS_CELLS; columns <= MAX_AXIS_CELLS; columns++) {
      const cellCount = columns * rows;
      if (cellCount < MIN_GRID_CELLS || cellCount > MAX_GRID_CELLS) continue;
      const gridAspect = (2 + (columns - 1) * 1.5) / (SQRT_3 * (rows + (columns > 1 ? 0.5 : 0)));
      const aspectError = Math.abs(Math.log(gridAspect / aspect));
      const densityError = Math.abs(cellCount - HEX_TARGET_CELLS) / HEX_TARGET_CELLS;
      const score = aspectError + densityError;
      if (
        score < bestScore - 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && densityError < bestDensityError)
      ) {
        best = { columns, rows };
        bestScore = score;
        bestDensityError = densityError;
      }
    }
  }

  cacheValue(gridCache, cacheKey, best);
  return best;
}

export function getHexMetrics(width: number, height: number): HexMetrics {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const cacheKey = `${safeWidth}:${safeHeight}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) return cached;

  const { columns, rows } = getHexGridDimensions(safeWidth, safeHeight);
  const availableWidth = safeWidth * WORKSPACE_FILL;
  const availableHeight = safeHeight * WORKSPACE_FILL;
  const widthRadius = availableWidth / (2 + (columns - 1) * 1.5);
  const staggeredRows = rows + (columns > 1 ? 0.5 : 0);
  const heightRadius = availableHeight / (SQRT_3 * staggeredRows);
  const radius = Math.max(0.01, Math.min(widthRadius, heightRadius));
  const cellHeight = SQRT_3 * radius;
  const stepX = radius * 1.5;
  const gridWidth = radius * 2 + (columns - 1) * stepX;
  const gridHeight = cellHeight * staggeredRows;
  const metrics = {
    columns,
    rows,
    radius,
    cellHeight,
    stepX,
    originX: (safeWidth - gridWidth) / 2,
    originY: (safeHeight - gridHeight) / 2,
  };
  cacheValue(metricsCache, cacheKey, metrics);
  return metrics;
}

export function getHexCell(
  col: number,
  row: number,
  width: number,
  height: number,
  inset = 0,
): HexCell {
  return hexCellFromMetrics(col, row, getHexMetrics(width, height), inset);
}

export function getAllHexCells(width: number, height: number, inset = 0): HexCell[] {
  const metrics = getHexMetrics(width, height);
  const cells: HexCell[] = [];
  for (let row = 0; row < metrics.rows; row++) {
    for (let col = 0; col < metrics.columns; col++) {
      cells.push(hexCellFromMetrics(col, row, metrics, inset));
    }
  }
  return cells;
}

export function normalizeBlockPlacement(
  block: BlockPlacement,
  grid: HexGridDimensions = REFERENCE_HEX_GRID,
): BlockPlacement {
  const minColSpan = clamp(Math.round(block.minColSpan ?? 1), 1, grid.columns);
  const minRowSpan = clamp(Math.round(block.minRowSpan ?? 1), 1, grid.rows);
  const colSpan = clamp(Math.round(block.colSpan), minColSpan, grid.columns);
  const rowSpan = clamp(Math.round(block.rowSpan), minRowSpan, grid.rows);
  return {
    ...block,
    minColSpan,
    minRowSpan,
    colSpan,
    rowSpan,
    col: clamp(Math.round(block.col), 0, grid.columns - colSpan),
    row: clamp(Math.round(block.row), 0, grid.rows - rowSpan),
  };
}

/** Preserve relative placement and footprint while the Artwork grid changes shape. */
export function remapBlockPlacement(
  block: BlockPlacement,
  from: HexGridDimensions,
  to: HexGridDimensions,
): BlockPlacement {
  const source = normalizeBlockPlacement(block, from);
  const col = Math.round((source.col / from.columns) * to.columns);
  const row = Math.round((source.row / from.rows) * to.rows);
  const colEnd = Math.round(((source.col + source.colSpan) / from.columns) * to.columns);
  const rowEnd = Math.round(((source.row + source.rowSpan) / from.rows) * to.rows);
  const minColSpan = Math.max(
    1,
    Math.round(((source.minColSpan ?? 1) / from.columns) * to.columns),
  );
  const minRowSpan = Math.max(1, Math.round(((source.minRowSpan ?? 1) / from.rows) * to.rows));
  return normalizeBlockPlacement(
    {
      ...source,
      col,
      row,
      colSpan: Math.max(minColSpan, colEnd - col),
      rowSpan: Math.max(minRowSpan, rowEnd - row),
      minColSpan,
      minRowSpan,
    },
    to,
  );
}

export function cellsForPlacement(
  block: BlockPlacement,
  grid: HexGridDimensions = REFERENCE_HEX_GRID,
): Array<{ col: number; row: number }> {
  const placement = normalizeBlockPlacement(block, grid);
  const cells: Array<{ col: number; row: number }> = [];
  for (let row = placement.row; row < placement.row + placement.rowSpan; row++) {
    for (let col = placement.col; col < placement.col + placement.colSpan; col++) {
      cells.push({ col, row });
    }
  }
  return cells;
}

export function blockRectForPlacement(
  block: BlockPlacement,
  width: number,
  height: number,
): BlockRect {
  const metrics = getHexMetrics(width, height);
  return blockRectWithMetrics(block, metrics);
}

export function blockPlacementForRect(
  rect: BlockRect,
  width: number,
  height: number,
  previous?: BlockPlacement,
): BlockPlacement {
  const metrics = getHexMetrics(width, height);
  const desiredColSpan = nearestSpan(rect.width, metrics.columns, (span) =>
    span === 1 ? metrics.radius * 2 : metrics.radius * 2 + (span - 1) * metrics.stepX,
  );
  const desiredRowSpan = nearestSpan(
    rect.height,
    metrics.rows,
    (span) => (span + (desiredColSpan > 1 ? 0.5 : 0)) * metrics.cellHeight,
  );
  const colSpan = Math.min(metrics.columns, Math.max(previous?.minColSpan ?? 1, desiredColSpan));
  const rowSpan = Math.min(metrics.rows, Math.max(previous?.minRowSpan ?? 1, desiredRowSpan));
  const targetCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  let best: BlockPlacement | null = null;
  let bestScore = Infinity;

  for (let row = 0; row <= metrics.rows - rowSpan; row++) {
    for (let col = 0; col <= metrics.columns - colSpan; col++) {
      const candidate = normalizeBlockPlacement(
        {
          ...previous,
          col,
          row,
          colSpan,
          rowSpan,
        },
        metrics,
      );
      const candidateRect = blockRectWithMetrics(candidate, metrics);
      const dx = candidateRect.x + candidateRect.width / 2 - targetCenter.x;
      const dy = candidateRect.y + candidateRect.height / 2 - targetCenter.y;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return (
    best ?? normalizeBlockPlacement({ ...previous, col: 0, row: 0, colSpan, rowSpan }, metrics)
  );
}

/** Number of shared cells between two placements. */
export function placementOverlapCells(a: BlockPlacement, b: BlockPlacement): number {
  const left = Math.max(a.col, b.col);
  const right = Math.min(a.col + a.colSpan, b.col + b.colSpan);
  const top = Math.max(a.row, b.row);
  const bottom = Math.min(a.row + a.rowSpan, b.row + b.rowSpan);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function placementsFit(
  a: BlockPlacement,
  b: BlockPlacement,
  strictness: WorkspaceStrictness,
): boolean {
  return placementOverlapCells(a, b) <= strictness - 1;
}

/**
 * Stable auto-layout resolver. The active Object owns its requested cells;
 * colliding Objects move to the nearest legal placement. Strictness is the
 * only collision policy exposed to callers.
 */
export function reflowBlockItems(
  items: BlockLayoutItem[],
  options: {
    anchorId?: string;
    anchorPlacement?: BlockPlacement;
    strictness?: WorkspaceStrictness;
    grid?: HexGridDimensions;
  } = {},
): BlockLayoutResult {
  const strictness = options.strictness ?? 1;
  const grid = options.grid ?? REFERENCE_HEX_GRID;
  const normalized = items.map((item) => ({
    id: item.id,
    placement:
      item.id === options.anchorId && options.anchorPlacement
        ? normalizeBlockPlacement(options.anchorPlacement, grid)
        : normalizeBlockPlacement(item.placement, grid),
  }));
  const anchor = options.anchorId
    ? normalized.find((item) => item.id === options.anchorId)
    : undefined;
  const queue = anchor
    ? [anchor, ...normalized.filter((item) => item.id !== anchor.id)]
    : normalized;
  const placed: BlockLayoutItem[] = [];
  const overflowIds: string[] = [];

  for (const item of queue) {
    const occupied = placed.map((entry) => entry.placement);
    const resolved = isAvailable(item.placement, occupied, strictness)
      ? item.placement
      : findNearestAvailable(item.placement, occupied, strictness, grid);
    if (resolved) placed.push({ id: item.id, placement: resolved });
    else {
      overflowIds.push(item.id);
      placed.push(item);
    }
  }
  return {
    placements: new Map(placed.map((item) => [item.id, item.placement])),
    overflowIds,
  };
}

function hexCellFromMetrics(col: number, row: number, metrics: HexMetrics, inset = 0): HexCell {
  const radius = Math.max(0.01, metrics.radius - inset);
  const center = {
    x: metrics.originX + metrics.radius + col * metrics.stepX,
    y:
      metrics.originY +
      metrics.cellHeight / 2 +
      row * metrics.cellHeight +
      (col % 2 === 1 ? metrics.cellHeight / 2 : 0),
  };
  const halfHeight = (SQRT_3 * radius) / 2;
  return {
    col,
    row,
    center,
    points: [
      { x: center.x + radius, y: center.y },
      { x: center.x + radius / 2, y: center.y + halfHeight },
      { x: center.x - radius / 2, y: center.y + halfHeight },
      { x: center.x - radius, y: center.y },
      { x: center.x - radius / 2, y: center.y - halfHeight },
      { x: center.x + radius / 2, y: center.y - halfHeight },
    ],
  };
}

function blockRectWithMetrics(block: BlockPlacement, metrics: HexMetrics): BlockRect {
  const placement = normalizeBlockPlacement(block, metrics);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { col, row } of cellsForPlacement(placement, metrics)) {
    const cell = hexCellFromMetrics(col, row, metrics);
    for (const point of cell.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function nearestSpan(value: number, max: number, sizeForSpan: (span: number) => number) {
  let best = 1;
  let distance = Infinity;
  for (let span = 1; span <= max; span++) {
    const nextDistance = Math.abs(sizeForSpan(span) - value);
    if (nextDistance < distance) {
      best = span;
      distance = nextDistance;
    }
  }
  return best;
}

function isAvailable(
  candidate: BlockPlacement,
  occupied: BlockPlacement[],
  strictness: WorkspaceStrictness,
) {
  return occupied.every((placement) => placementsFit(candidate, placement, strictness));
}

function findNearestAvailable(
  requested: BlockPlacement,
  occupied: BlockPlacement[],
  strictness: WorkspaceStrictness,
  grid: HexGridDimensions,
): BlockPlacement | null {
  const minColSpan = requested.minColSpan ?? 1;
  const minRowSpan = requested.minRowSpan ?? 1;
  const sizes: Array<{ colSpan: number; rowSpan: number }> = [];
  for (let rowSpan = requested.rowSpan; rowSpan >= minRowSpan; rowSpan--) {
    for (let colSpan = requested.colSpan; colSpan >= minColSpan; colSpan--) {
      sizes.push({ colSpan, rowSpan });
    }
  }
  sizes.sort((a, b) => b.colSpan * b.rowSpan - a.colSpan * a.rowSpan);

  for (const size of sizes) {
    const candidates: BlockPlacement[] = [];
    for (let row = 0; row <= grid.rows - size.rowSpan; row++) {
      for (let col = 0; col <= grid.columns - size.colSpan; col++) {
        candidates.push({ ...requested, ...size, col, row });
      }
    }
    candidates.sort((a, b) => {
      const distanceA = Math.abs(a.col - requested.col) + Math.abs(a.row - requested.row);
      const distanceB = Math.abs(b.col - requested.col) + Math.abs(b.row - requested.row);
      return distanceA - distanceB || a.row - b.row || a.col - b.col;
    });
    const free = candidates.find((candidate) => isAvailable(candidate, occupied, strictness));
    if (free) return normalizeBlockPlacement(free, grid);
  }
  return null;
}

function cacheValue<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}
