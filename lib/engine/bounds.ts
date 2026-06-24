/**
 * Geometry helpers shared by hit-test, transform, and renderer.
 *
 * Every element exposes an axis-aligned bbox `{x, y, width, height}` plus an
 * `angle` (radians) around the bbox center. These helpers convert between
 * world coordinates (slide-local) and element-local coordinates (origin at
 * element's top-left, axis aligned with the element).
 */

import type { EngineElement } from "./types";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export function elementCenter(el: EngineElement): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/** Rotate point `p` by `angle` radians around `origin`. */
export function rotatePoint(p: Point, origin: Point, angle: number): Point {
  if (angle === 0) return { x: p.x, y: p.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** World point -> element-local (un-rotated, origin at element top-left). */
export function worldToLocal(el: EngineElement, world: Point): Point {
  const c = elementCenter(el);
  const r = rotatePoint(world, c, -el.angle);
  return { x: r.x - el.x, y: r.y - el.y };
}

/** Element-local point -> world (rotated, slide-space). */
export function localToWorld(el: EngineElement, local: Point): Point {
  const c = elementCenter(el);
  const world: Point = { x: el.x + local.x, y: el.y + local.y };
  return rotatePoint(world, c, el.angle);
}

/** Four corners of the element's oriented bounding box, in world coords. */
export function elementCorners(el: EngineElement): [Point, Point, Point, Point] {
  const c = elementCenter(el);
  const corners: [Point, Point, Point, Point] = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ];
  return corners.map((p) => rotatePoint(p, c, el.angle)) as [Point, Point, Point, Point];
}

/** Axis-aligned bbox of a (possibly rotated) element in world coords. */
export function elementWorldBBox(el: EngineElement): Rect {
  if (el.angle === 0) {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }
  const corners = elementCorners(el);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union bbox over multiple elements (for multi-select transformer). */
export function unionBBox(elements: EngineElement[]): Rect | null {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = elementWorldBBox(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
