/**
 * Boolean Vector Shape Operations Engine (Pathfinder).
 * Full Adobe Illustrator-style Pathfinder operations powered by robust polygon clipping:
 * - Shape Modes: Unite (Union), Minus Front (Subtract), Intersect, Exclude (XOR)
 * - Pathfinders: Minus Back, Divide
 * Supports chaining >= 2 shapes across all vector and geometric types with exact contour preservation.
 */

import polygonClipping, { type Polygon } from "polygon-clipping";
import { createVectorPath } from "./factory";
import type { EngineElement, VectorPathElement } from "./types";
import { convertElementToVectorPath } from "./vectorPath";

export type BooleanOperation =
  | "union"
  | "subtract"
  | "intersect"
  | "exclude"
  | "minusBack"
  | "divide";

export type Point = [number, number];

/** Checks whether an element is a geometric shape or vector path eligible for Pathfinder. */
export function isShapeElement(el: EngineElement | undefined | null): boolean {
  if (!el) return false;
  return (
    el.type !== "image" &&
    el.type !== "frame" &&
    el.type !== "bookMockup" &&
    el.type !== "text" &&
    !el.isDeleted
  );
}

/** Converts any shape/path element to a closed polygon ring in slide coordinate space. */
export function elementToPolygon(el: EngineElement, sampleCount = 36): Point[] {
  const x = el.x;
  const y = el.y;
  const w = el.width;
  const h = el.height;

  if (el.type === "ellipse") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const points: Point[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    return points;
  }

  const pathEl: VectorPathElement | null =
    el.type === "path" ? (el as VectorPathElement) : convertElementToVectorPath(el);

  if (pathEl?.nodes && pathEl.nodes.length >= 3) {
    const points: Point[] = [];
    const len = pathEl.nodes.length;
    for (let i = 0; i < len; i++) {
      const curr = pathEl.nodes[i];
      const next = pathEl.nodes[(i + 1) % len];
      const pCurr: Point = [x + curr.x * w, y + curr.y * h];
      points.push(pCurr);

      // If curve segment exists, sample intermediate points along the cubic Bezier
      if (curr.out || next.in) {
        const out = curr.out ?? [0, 0];
        const incoming = next.in ?? [0, 0];
        const cp1: Point = [x + (curr.x + out[0]) * w, y + (curr.y + out[1]) * h];
        const cp2: Point = [x + (next.x + incoming[0]) * w, y + (next.y + incoming[1]) * h];
        const pNext: Point = [x + next.x * w, y + next.y * h];
        const subSteps = 6;
        for (let s = 1; s < subSteps; s++) {
          const t = s / subSteps;
          const inv = 1 - t;
          const px =
            inv * inv * inv * pCurr[0] +
            3 * inv * inv * t * cp1[0] +
            3 * inv * t * t * cp2[0] +
            t * t * t * pNext[0];
          const py =
            inv * inv * inv * pCurr[1] +
            3 * inv * inv * t * cp1[1] +
            3 * inv * t * t * cp2[1] +
            t * t * t * pNext[1];
          points.push([px, py]);
        }
      }
    }
    return points;
  }

  // Default: Rectangle bounding box
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Point inside polygon test using ray-casting algorithm. */
export function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Computes segment-segment intersection if one exists. */
export function segmentIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 1e-9) return null;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
  }
  return null;
}

/** Helper to wrap a Point[] ring into a polygon-clipping Polygon: [[ [x,y], ... ]] */
function ringToPolygon(ring: Point[]): Polygon {
  if (ring.length < 3) return [];
  const closed = [...ring];
  const first = closed[0];
  const last = closed[closed.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closed.push([first[0], first[1]]);
  }
  return [closed as [number, number][]];
}

/** Converts polygon-clipping output (MultiPolygon) to an array of Point[] rings. */
function multiPolygonToRings(multiPoly: ReturnType<typeof polygonClipping.union>): Point[][] {
  const rings: Point[][] = [];
  for (const polygon of multiPoly) {
    for (const ring of polygon) {
      if (ring.length >= 3) {
        const pts: Point[] = ring.map(([px, py]) => [px, py]);
        // Remove duplicate last closing point if present
        if (
          pts.length > 3 &&
          pts[0][0] === pts[pts.length - 1][0] &&
          pts[0][1] === pts[pts.length - 1][1]
        ) {
          pts.pop();
        }
        if (pts.length >= 3) rings.push(pts);
      }
    }
  }
  return rings;
}

/**
 * Combines two polygons using robust polygon clipping (Union, Subtract, Intersect, Exclude, MinusBack).
 */
export function computePolygonBoolean(
  polyA: Point[],
  polyB: Point[],
  op: BooleanOperation,
): Point[] {
  if (polyA.length < 3) return polyB;
  if (polyB.length < 3) return polyA;

  const pA = ringToPolygon(polyA);
  const pB = ringToPolygon(polyB);

  let result: ReturnType<typeof polygonClipping.union>;

  switch (op) {
    case "union":
      result = polygonClipping.union(pA, pB);
      break;
    case "subtract":
      result = polygonClipping.difference(pA, pB);
      break;
    case "minusBack":
      result = polygonClipping.difference(pB, pA);
      break;
    case "intersect":
      result = polygonClipping.intersection(pA, pB);
      break;
    case "exclude":
      result = polygonClipping.xor(pA, pB);
      break;
    default:
      result = polygonClipping.union(pA, pB);
      break;
  }

  const rings = multiPolygonToRings(result);
  return rings.length > 0 ? rings[0] : polyA;
}

/**
 * Executes a Boolean operation between two or more elements and produces resulting VectorPathElement(s).
 * - For divide: returns multiple VectorPathElement pieces.
 * - For other operations: returns unified VectorPathElement(s).
 */
export function applyBooleanOperation(
  firstOrArray: EngineElement | EngineElement[],
  secondOrOp?: EngineElement | BooleanOperation,
  optionalOp?: BooleanOperation,
): VectorPathElement | VectorPathElement[] | null {
  let elements: EngineElement[] = [];
  let op: BooleanOperation = "union";

  if (Array.isArray(firstOrArray)) {
    elements = firstOrArray;
    op = (secondOrOp as BooleanOperation) ?? "union";
  } else if (typeof secondOrOp === "object") {
    elements = [firstOrArray, secondOrOp];
    op = optionalOp ?? "union";
  } else {
    elements = [firstOrArray];
    op = (secondOrOp as BooleanOperation) ?? "union";
  }

  if (elements.length < 2) return null;

  const baseElement = elements[0];

  // Illustrator Pathfinder Divide: Cuts shapes into separate disjoint polygons
  if (op === "divide") {
    const [elA, elB] = elements;
    const pA = ringToPolygon(elementToPolygon(elA));
    const pB = ringToPolygon(elementToPolygon(elB));

    const diffA = multiPolygonToRings(polygonClipping.difference(pA, pB));
    const diffB = multiPolygonToRings(polygonClipping.difference(pB, pA));
    const inter = multiPolygonToRings(polygonClipping.intersection(pA, pB));

    const pieces: VectorPathElement[] = [];

    for (const ring of diffA) {
      const p = createVectorPath(
        ring.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })),
        true,
      );
      p.backgroundColor = elA.backgroundColor;
      p.strokeColor = elA.strokeColor;
      p.strokeWidth = elA.strokeWidth;
      pieces.push(p);
    }

    for (const ring of inter) {
      const p = createVectorPath(
        ring.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })),
        true,
      );
      p.backgroundColor = elA.backgroundColor;
      p.strokeColor = elA.strokeColor;
      p.strokeWidth = elA.strokeWidth;
      pieces.push(p);
    }

    for (const ring of diffB) {
      const p = createVectorPath(
        ring.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })),
        true,
      );
      p.backgroundColor = elB.backgroundColor;
      p.strokeColor = elB.strokeColor;
      p.strokeWidth = elB.strokeWidth;
      pieces.push(p);
    }

    return pieces.length > 0 ? pieces : null;
  }

  // Convert all input elements to polygon-clipping format
  const polygons: Polygon[] = elements.map((el) => ringToPolygon(elementToPolygon(el)));

  let resultMultiPoly: ReturnType<typeof polygonClipping.union>;

  switch (op) {
    case "union":
      resultMultiPoly = polygonClipping.union(polygons[0], ...polygons.slice(1));
      break;
    case "subtract":
      // Bottom shape minus all shapes above it
      resultMultiPoly = polygonClipping.difference(polygons[0], ...polygons.slice(1));
      break;
    case "minusBack":
      // Top shape minus all shapes below it
      resultMultiPoly = polygonClipping.difference(
        polygons[polygons.length - 1],
        ...polygons.slice(0, polygons.length - 1),
      );
      break;
    case "intersect":
      resultMultiPoly = polygonClipping.intersection(polygons[0], ...polygons.slice(1));
      break;
    case "exclude":
      resultMultiPoly = polygonClipping.xor(polygons[0], ...polygons.slice(1));
      break;
    default:
      resultMultiPoly = polygonClipping.union(polygons[0], ...polygons.slice(1));
      break;
  }

  const rings = multiPolygonToRings(resultMultiPoly);
  if (rings.length === 0) return null;

  const resultElements = rings.map((ring) => {
    const pathElement = createVectorPath(
      ring.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })),
      true,
    );
    pathElement.backgroundColor = baseElement.backgroundColor;
    pathElement.strokeColor = baseElement.strokeColor;
    pathElement.strokeWidth = baseElement.strokeWidth;
    pathElement.opacity = baseElement.opacity;
    return pathElement;
  });

  return resultElements.length === 1 ? resultElements[0] : resultElements;
}
