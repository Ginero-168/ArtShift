/**
 * Point-in-element hit testing.
 *
 * Strategy: rotate the world point into element-local space, then run a
 * shape-specific containment test. For stroke-only shapes (line, arrow,
 * unfilled rect outline) we accept hits within `HIT_TOLERANCE` of the
 * stroke. For filled shapes hit-test counts the interior plus edge.
 */

import {
  elementWorldBBox,
  type Point,
  pointInRect,
  type Rect,
  rotatePoint,
  worldToLocal,
} from "./bounds";
import { getInteractiveElements } from "./layers";
import type { EngineElement, EngineSlide } from "./types";

const HIT_TOLERANCE = 6; // px in world space

export function hitTestElement(world: Point, el: EngineElement): boolean {
  if (el.isDeleted || el.hidden || el.visible === false) return false;
  // Cheap reject via world bbox first.
  const bbox = elementWorldBBox(el);
  if (!pointInRect({ x: world.x, y: world.y }, expandRect(bbox, HIT_TOLERANCE))) return false;

  switch (el.type) {
    case "rect":
    case "image":
    case "bookMockup":
    case "frame":
      return hitRect(world, el);
    case "ellipse":
      return hitEllipse(world, el);
    case "diamond":
      return hitDiamond(world, el);
    case "triangle":
      return hitTriangle(world, el);
    case "star":
      return hitStar(world, el);
    case "hexagon":
      return hitHexagon(world, el);
    case "heart":
      return hitHeart(world, el);
    case "plus":
      return hitPlus(world, el);
    case "line":
    case "arrow":
      return hitPolyline(world, el);
    case "freedraw":
      return hitFreedraw(world, el);
    case "path":
      return hitVectorPath(world, el);
    case "text":
      return hitText(world, el);
  }
}

/** Top-most element under `world` (last-rendered first). */
export function pickTopMost(
  world: Point,
  source: EngineElement[] | EngineSlide,
): EngineElement | null {
  const ordered = Array.isArray(source)
    ? [...source].sort((a, b) => b.z - a.z)
    : getInteractiveElements(source).toReversed();
  for (const element of ordered) {
    if (hitTestElement(world, element)) return element;
  }
  return null;
}

/** Elements whose AABB is fully inside the (axis-aligned) world rect. */
export function pickInsideRect(rect: Rect, elements: EngineElement[]): EngineElement[] {
  const out: EngineElement[] = [];
  for (const el of elements) {
    if (el.isDeleted || el.visible === false) continue;
    const b = elementWorldBBox(el);
    if (
      b.x >= rect.x &&
      b.y >= rect.y &&
      b.x + b.width <= rect.x + rect.width &&
      b.y + b.height <= rect.y + rect.height
    ) {
      out.push(el);
    }
  }
  return out;
}

/** Elements whose AABB intersects the (axis-aligned) world rect. */
export function pickIntersectRect(rect: Rect, elements: EngineElement[]): EngineElement[] {
  const out: EngineElement[] = [];
  for (const el of elements) {
    if (el.isDeleted || el.visible === false) continue;
    const b = elementWorldBBox(el);
    if (
      b.x < rect.x + rect.width &&
      b.x + b.width > rect.x &&
      b.y < rect.y + rect.height &&
      b.y + b.height > rect.y
    ) {
      out.push(el);
    }
  }
  return out;
}

// ——— internals ———

function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

function hitRect(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  if (local.x >= 0 && local.x <= el.width && local.y >= 0 && local.y <= el.height) {
    return true;
  }
  const tol = Math.max(1, (el.strokeWidth ?? 1) / 2);
  return (
    local.x >= -tol && local.x <= el.width + tol && local.y >= -tol && local.y <= el.height + tol
  );
}

function hitText(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  // Generous padding so text is easy to select.
  const pad = Math.max(8, (el as import("@/lib/engine/types").TextElement).fontSize * 0.5);
  return (
    local.x >= -pad && local.x <= el.width + pad && local.y >= -pad && local.y <= el.height + pad
  );
}

function hitEllipse(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const cx = el.width / 2;
  const cy = el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;
  if (rx <= 0 || ry <= 0) return false;
  const nx = (local.x - cx) / rx;
  const ny = (local.y - cy) / ry;
  const d = nx * nx + ny * ny;
  if (d <= 1) return true;
  const tol = Math.max(1, (el.strokeWidth ?? 1) / 2) / Math.max(1, (rx + ry) / 2);
  return d <= (1 + tol) * (1 + tol);
}

function hitDiamond(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const cx = el.width / 2;
  const cy = el.height / 2;
  const dx = Math.abs(local.x - cx) / cx;
  const dy = Math.abs(local.y - cy) / cy;
  if (dx + dy <= 1) return true;
  const tol = Math.max(1, (el.strokeWidth ?? 1) / 2) / Math.max(1, (cx + cy) / 2);
  return dx + dy <= 1 + tol;
}

function hitTriangle(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const pts: [number, number][] = [
    [el.width / 2, 0],
    [el.width, el.height],
    [0, el.height],
  ];
  if (pointInPolygon(local, pts)) return true;
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (distanceToSegment(local, a, b) <= tol) return true;
  }
  return false;
}

function hitStar(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const cx = el.width / 2;
  const cy = el.height / 2;
  const outerR = Math.min(el.width, el.height) / 2;
  const innerR = outerR * 0.4;
  const n = (el as import("./types").StarElement).numPoints ?? 5;
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  if (pointInPolygon(local, pts)) return true;
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (distanceToSegment(local, a, b) <= tol) return true;
  }
  return false;
}

function hitHexagon(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const w = el.width;
  const h = el.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * i) / 3 - Math.PI / 2;
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  if (pointInPolygon(local, pts)) return true;
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (distanceToSegment(local, a, b) <= tol) return true;
  }
  return false;
}

function hitHeart(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  if (local.x >= 0 && local.x <= el.width && local.y >= 0 && local.y <= el.height) {
    return true;
  }
  const tol = Math.max(1, (el.strokeWidth ?? 1) / 2);
  return (
    local.x >= -tol && local.x <= el.width + tol && local.y >= -tol && local.y <= el.height + tol
  );
}

function hitPlus(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const t =
    ((el as import("./types").PlusElement).crossThickness ?? 0.3) * Math.min(el.width, el.height);
  const hw = t / 2;
  const cx = el.width / 2;
  const cy = el.height / 2;
  const inVertical =
    local.x >= cx - hw && local.x <= cx + hw && local.y >= 0 && local.y <= el.height;
  const inHorizontal =
    local.y >= cy - hw && local.y <= cy + hw && local.x >= 0 && local.x <= el.width;
  if (inVertical || inHorizontal) return true;
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);
  return (
    (local.x >= cx - hw - tol &&
      local.x <= cx + hw + tol &&
      local.y >= -tol &&
      local.y <= el.height + tol) ||
    (local.y >= cy - hw - tol &&
      local.y <= cy + hw + tol &&
      local.x >= -tol &&
      local.x <= el.width + tol)
  );
}

function pointInPolygon(p: Point, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1];
    const xj = poly[j][0],
      yj = poly[j][1];
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function hitPolyline(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const points = (el as { points?: Array<[number, number]> }).points;
  if (!points || points.length < 2) return false;
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (distanceToSegment(local, a, b) <= tol) return true;
  }
  return false;
}

function hitFreedraw(world: Point, el: EngineElement): boolean {
  const local = worldToLocal(el, world);
  const points = (el as { points: Array<[number, number, number]> }).points;
  if (!points || points.length < 2) return false;
  // Use stroke width + tolerance as the hit envelope.
  const env = Math.max(HIT_TOLERANCE, el.strokeWidth + 6);
  for (let i = 0; i < points.length - 1; i++) {
    const a: [number, number] = [points[i][0], points[i][1]];
    const b: [number, number] = [points[i + 1][0], points[i + 1][1]];
    if (distanceToSegment(local, a, b) <= env) return true;
  }
  return false;
}

function hitVectorPath(world: Point, el: Extract<EngineElement, { type: "path" }>): boolean {
  const local = worldToLocal(el, world);
  const points = el.nodes.map(
    (node) => [node.x * el.width, node.y * el.height] as [number, number],
  );
  const tol = Math.max(HIT_TOLERANCE, (el.strokeWidth ?? 1) / 2 + 4);

  // If closed shape, allow clicking anywhere in its interior
  if (el.closed && points.length >= 3) {
    if (pointInPolygon(local, points)) return true;
  }

  // Edge / segment distance check
  for (let index = 0; index < points.length - 1; index++) {
    if (distanceToSegment(local, points[index], points[index + 1]) <= tol) return true;
  }
  return (
    el.closed && points.length > 2 && distanceToSegment(local, points.at(-1)!, points[0]) <= tol
  );
}

function distanceToSegment(p: Point, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a[0], p.y - a[1]);
  let t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

// Re-exports kept to minimize import sprawl in callers.
export { rotatePoint };
