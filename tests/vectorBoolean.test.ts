import { describe, expect, it } from "vitest";
import { createDiamond, createEllipse, createRect, createTriangle } from "../lib/engine/factory";
import {
  applyBooleanOperation,
  computePolygonBoolean,
  elementToPolygon,
  isPointInsidePolygon,
  segmentIntersection,
} from "../lib/engine/vectorBoolean";

describe("Boolean Vector Shape Operations (Pathfinder)", () => {
  it("converts rectangle, ellipse, and triangle elements to closed polygon points", () => {
    const rect = createRect({ x: 10, y: 20, width: 100, height: 80 });
    const polyRect = elementToPolygon(rect);
    expect(polyRect.length).toBe(4);
    expect(polyRect[0]).toEqual([10, 20]);
    expect(polyRect[2]).toEqual([110, 100]);

    const ellipse = createEllipse({ x: 0, y: 0, width: 50, height: 50 });
    const polyEllipse = elementToPolygon(ellipse, 16);
    expect(polyEllipse.length).toBe(16);

    const triangle = createTriangle({ x: 0, y: 0, width: 60, height: 60 });
    const polyTriangle = elementToPolygon(triangle);
    expect(polyTriangle.length).toBeGreaterThanOrEqual(3);
  });

  it("tests point inside polygon and segment intersections", () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];

    expect(isPointInsidePolygon([50, 50], square)).toBe(true);
    expect(isPointInsidePolygon([150, 50], square)).toBe(false);

    const hit = segmentIntersection([0, 50], [100, 50], [50, 0], [50, 100]);
    expect(hit).toEqual([50, 50]);
  });

  it("computes polygon boolean operations: union, subtract, intersect, exclude, minusBack", () => {
    const boxA: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const boxB: Array<[number, number]> = [
      [50, 50],
      [150, 50],
      [150, 150],
      [50, 150],
    ];

    const union = computePolygonBoolean(boxA, boxB, "union");
    expect(union.length).toBeGreaterThanOrEqual(4);

    const intersect = computePolygonBoolean(boxA, boxB, "intersect");
    expect(intersect.length).toBeGreaterThan(0);

    const subtract = computePolygonBoolean(boxA, boxB, "subtract");
    expect(subtract.length).toBeGreaterThan(0);

    const minusBack = computePolygonBoolean(boxA, boxB, "minusBack");
    expect(minusBack.length).toBeGreaterThan(0);
  });

  it("accurately unites overlapping diamonds without zig-zag criss-cross artifacts", () => {
    const diamondA = createDiamond({ x: 0, y: 0, width: 100, height: 100 });
    const diamondB = createDiamond({ x: 50, y: 0, width: 100, height: 100 });

    const result = applyBooleanOperation([diamondA, diamondB], "union");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(false);
    if (!Array.isArray(result) && result) {
      expect(result.type).toBe("path");
      expect(result.closed).toBe(true);
      expect(result.nodes.length).toBe(8);
      expect(result.width).toBe(150);
      expect(result.height).toBe(100);
    }
  });

  it("executes multi-element boolean operation and generates unified VectorPathElement", () => {
    const rectA = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const rectB = createRect({ x: 50, y: 50, width: 100, height: 100 });
    const rectC = createRect({ x: 100, y: 100, width: 100, height: 100 });

    const result = applyBooleanOperation([rectA, rectB, rectC], "union");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(false);
    if (!Array.isArray(result) && result) {
      expect(result.type).toBe("path");
      expect(result.closed).toBe(true);
      expect(result.nodes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("executes Pathfinder Divide into multiple separate vector pieces", () => {
    const rectA = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const rectB = createRect({ x: 50, y: 50, width: 100, height: 100 });

    const pieces = applyBooleanOperation([rectA, rectB], "divide");
    expect(pieces).toBeDefined();
    expect(Array.isArray(pieces)).toBe(true);
    if (Array.isArray(pieces)) {
      expect(pieces.length).toBe(3); // Part A only, Intersect part, Part B only
      for (const p of pieces) {
        expect(p.type).toBe("path");
        expect(p.closed).toBe(true);
      }
    }
  });
});
