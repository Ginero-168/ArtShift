import { elementWorldBBox, type Rect } from "./bounds";
import type { ArrowElement, EngineElement, EngineSlide } from "./types";

/**
 * Recompute arrow endpoints based on their bindings.
 * Returns a new slide with updated arrows if any bindings were applied.
 */
export function recomputeArrowBindings(slide: EngineSlide): EngineSlide {
  let changed = false;
  const elements = slide.elements.map((el) => {
    if (el.type !== "arrow") return el;

    let nextArrow = el as ArrowElement;
    let modified = false;

    if (nextArrow.startBinding) {
      const target = slide.elements.find((t) => t.id === nextArrow.startBinding!.elementId);
      if (target && !target.isDeleted) {
        const newPt = computeBoundPoint(target, nextArrow, "start");
        if (newPt) {
          const pts = [...nextArrow.points];
          pts[0] = [newPt.x - nextArrow.x, newPt.y - nextArrow.y];
          nextArrow = { ...nextArrow, points: pts };
          modified = true;
        }
      }
    }

    if (nextArrow.endBinding) {
      const target = slide.elements.find((t) => t.id === nextArrow.endBinding!.elementId);
      if (target && !target.isDeleted) {
        const newPt = computeBoundPoint(target, nextArrow, "end");
        if (newPt) {
          const pts = [...nextArrow.points];
          pts[pts.length - 1] = [newPt.x - nextArrow.x, newPt.y - nextArrow.y];
          nextArrow = { ...nextArrow, points: pts };
          modified = true;
        }
      }
    }

    if (modified) {
      changed = true;
      // We also need to fix the bounding box (x, y, width, height) of the arrow
      // because points are relative to x, y.
      // If we move points, the origin might need to shift to keep points >= 0.
      return normalizeArrowBBox(nextArrow);
    }
    return el;
  });

  return changed ? { ...slide, elements } : slide;
}

function computeBoundPoint(target: EngineElement, arrow: ArrowElement, endpoint: "start" | "end") {
  const bbox = elementWorldBBox(target);
  const tc = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };

  // Find the other end of the arrow to determine approach angle
  const pts = arrow.points;
  let otherLocalPt = endpoint === "start" ? pts[pts.length - 1] : pts[0];
  if (!otherLocalPt) otherLocalPt = endpoint === "start" ? pts[1] : pts[pts.length - 2];
  if (!otherLocalPt) return tc;

  const otherWorldPt = { x: arrow.x + otherLocalPt[0], y: arrow.y + otherLocalPt[1] };

  // Gap
  const gap = endpoint === "start" ? arrow.startBinding!.gap : arrow.endBinding!.gap;

  // Find the intersection from otherWorldPt → tc on the target bbox edge
  return intersectRayRect(bbox, otherWorldPt, tc, gap);
}

/**
 * Compute where a ray from `from` toward `to` intersects the edge of `rect`,
 * stopping `gap` pixels before the edge (outward).
 *
 * For arrow binding: `from` is the other endpoint, `to` is the target center.
 * We want the point ON the target's edge.
 */
function intersectRayRect(
  rect: Rect,
  from: { x: number; y: number },
  to: { x: number; y: number },
  gap: number,
) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  // Direction from the arrow's other end toward the target center
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) return to;

  const hw = rect.width / 2;
  const hh = rect.height / 2;

  // For an axis-aligned rectangle, find where the line from `from` hits the rect edge.
  // We parameterize: P(t) = from + t * (to - from).
  // The rect edges are at cx ± hw, cy ± hh.
  // We want the intersection closest to `to` that lies on the rect boundary.

  // Instead, compute from center outward: the point on the rect boundary in the
  // direction from center toward `from`.
  const fdx = from.x - cx;
  const fdy = from.y - cy;

  if (fdx === 0 && fdy === 0) {
    // `from` is at center of target — just pick the top edge
    return { x: cx, y: rect.y - gap };
  }

  // Scale to find intersection with the rectangle boundary
  const scaleX = hw > 0 ? Math.abs(hw / fdx) : Infinity;
  const scaleY = hh > 0 ? Math.abs(hh / fdy) : Infinity;
  const edgeScale = Math.min(scaleX, scaleY);

  // Point on the edge of the rectangle
  const edgeX = cx + fdx * edgeScale;
  const edgeY = cy + fdy * edgeScale;

  // Offset by gap in the same direction (away from center)
  const len = Math.sqrt(fdx * fdx + fdy * fdy);
  if (len === 0) return { x: edgeX, y: edgeY };
  const nx = fdx / len;
  const ny = fdy / len;

  return {
    x: edgeX + nx * gap,
    y: edgeY + ny * gap,
  };
}

// Adjust arrow x,y so points are all >= 0
function normalizeArrowBBox(arrow: ArrowElement): ArrowElement {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of arrow.points) {
    const ax = arrow.x + p[0];
    const ay = arrow.y + p[1];
    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
  }

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const pts = arrow.points.map((p) => {
    const ax = arrow.x + p[0];
    const ay = arrow.y + p[1];
    return [ax - minX, ay - minY] as [number, number];
  });

  return { ...arrow, x: minX, y: minY, width: w, height: h, points: pts };
}
