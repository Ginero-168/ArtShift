import type { ShapeObject } from "./types";

/**
 * Endpoint pair (start → end) for a line/arrow shape in local bbox coords.
 * Honors the optional `flipX`/`flipY` flags set by the drawing tool so a
 * diagonal drag is rendered as an actual diagonal. Legacy shapes (no flags
 * and thin bbox) collapse to a horizontal midline for visual compatibility.
 */
export function shapeDiagonal(s: ShapeObject): [number, number, number, number] {
  const w = s.width;
  const h = s.height;
  // Legacy / tap-to-add shapes have *undefined* flip flags → fall back to a
  // horizontal midline so old slides keep looking the same. Drag-created or
  // endpoint-edited shapes always write explicit booleans, so they bypass this
  // fallback and honor the actual diagonal even when the bbox is very thin.
  if (s.flipX === undefined && s.flipY === undefined && h <= 10) {
    return [0, h / 2, w, h / 2];
  }
  const sx = s.flipX ? w : 0;
  const sy = s.flipY ? h : 0;
  const ex = s.flipX ? 0 : w;
  const ey = s.flipY ? 0 : h;
  return [sx, sy, ex, ey];
}

/** Draw a filled triangular arrowhead at (ex, ey) pointing away from (sx, sy). */
export function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  color: string,
  size = 12,
) {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular unit vector (rotated +90°)
  const px = -uy;
  const py = ux;
  const bx = ex - ux * size;
  const by = ey - uy * size;
  const halfW = size * 0.6;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(bx + px * halfW, by + py * halfW);
  ctx.lineTo(bx - px * halfW, by - py * halfW);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
