import { describe, expect, it } from "vitest";
import {
  createEllipse,
  createLine,
  createRect,
  createStar,
  createTriangle,
  createVectorPath,
} from "@/lib/engine/factory";
import { hitTestElement } from "@/lib/engine/hitTest";
import {
  convertElementToVectorPath,
  insertNodeAt,
  moveVectorPathNode,
  removeNodeAt,
  setNodeHandle,
  setNodeType,
  smoothVectorPathNodes,
} from "@/lib/engine/vectorPath";

describe("precision vector paths", () => {
  it("creates normalized anchors and hit-tests a closed fill", () => {
    const path = createVectorPath(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
      ],
      true,
    );

    expect(path.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(path.nodes[2]).toMatchObject({ x: 1, y: 1 });
    expect(hitTestElement({ x: 200, y: 200 }, path)).toBe(true);
  });

  it("adds reversible Bézier handles without moving anchors", () => {
    const path = createVectorPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 200 },
        { x: 200, y: 0 },
      ],
      false,
    );
    const smoothed = smoothVectorPathNodes(path.nodes, 0.75, false);
    const reset = smoothVectorPathNodes(smoothed, 0, false);

    expect(smoothed[1].in).toBeDefined();
    expect(smoothed.map(({ x, y }) => ({ x, y }))).toEqual(
      path.nodes.map(({ x, y }) => ({ x, y })),
    );
    expect(reset.every((node) => node.in === undefined && node.out === undefined)).toBe(true);
  });

  it("allows free unconstrained anchor edits", () => {
    const path = createVectorPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      false,
    );
    const nodes = moveVectorPathNode(path.nodes, 0, { x: -2, y: 3 });
    expect(nodes[0]).toMatchObject({ x: -2, y: 3 });
  });

  it("converts basic shapes and lines to editable vector paths", () => {
    // Rect -> 4 nodes
    const rect = createRect({ x: 10, y: 20, width: 200, height: 100 });
    const pathRect = convertElementToVectorPath(rect);
    expect(pathRect?.type).toBe("path");
    expect(pathRect?.nodes).toHaveLength(4);
    expect(pathRect?.closed).toBe(true);

    // Ellipse -> 4 bezier nodes with handles
    const ellipse = createEllipse({ x: 10, y: 20, width: 100, height: 100 });
    const pathEllipse = convertElementToVectorPath(ellipse);
    expect(pathEllipse?.nodes).toHaveLength(4);
    expect(pathEllipse?.nodes[0].in).toBeDefined();
    expect(pathEllipse?.nodes[0].out).toBeDefined();

    // Line -> 2 nodes, open path
    const line = createLine([10, 20], [110, 120]);
    const pathLine = convertElementToVectorPath(line);
    expect(pathLine?.nodes).toHaveLength(2);
    expect(pathLine?.closed).toBe(false);

    // Triangle -> 3 nodes
    const tri = createTriangle({ x: 0, y: 0, width: 100, height: 100 });
    const pathTri = convertElementToVectorPath(tri);
    expect(pathTri?.nodes).toHaveLength(3);

    // Star -> 10 nodes
    const star = createStar({ x: 0, y: 0, width: 100, height: 100, numPoints: 5 });
    const pathStar = convertElementToVectorPath(star);
    expect(pathStar?.nodes).toHaveLength(10);
  });

  it("inserts and removes anchor nodes along path", () => {
    const initial = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];

    const inserted = insertNodeAt(initial, 1, { x: 0.5, y: 0.5 });
    expect(inserted).toHaveLength(3);
    expect(inserted[1]).toMatchObject({ x: 0.5, y: 0.5 });

    const removed = removeNodeAt(inserted, 1);
    expect(removed).toHaveLength(2);
    expect(removed).toEqual(initial);
  });

  it("modifies symmetric and asymmetric (Alt-key broken) Bezier handles", () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ];

    // Symmetric handle (default)
    const sym = setNodeHandle(nodes, 1, "out", [0.2, 0.1], true);
    expect(sym[1].out).toEqual([0.2, 0.1]);
    expect(sym[1].in).toEqual([-0.2, -0.1]);

    // Asymmetric handle (Alt key held)
    const asym = setNodeHandle(sym, 1, "in", [-0.4, 0.3], false);
    expect(asym[1].out).toEqual([0.2, 0.1]); // Remains intact
    expect(asym[1].in).toEqual([-0.4, 0.3]);

    // Set to corner point (removes handles)
    const corner = setNodeType(asym, 1, "corner");
    expect(corner[1].in).toBeUndefined();
    expect(corner[1].out).toBeUndefined();
  });

  it("bounds only the actual rendered shape body and curve extrema, not the handle arms", () => {
    // Standard circle created with 4 bezier nodes
    const ellipse = createEllipse({ x: 100, y: 100, width: 200, height: 100 });
    const pathEllipse = convertElementToVectorPath(ellipse);
    expect(pathEllipse).toBeDefined();
    if (!pathEllipse) return;

    // The bounding box must match the circle's actual geometry (200x100), not expanded by tangent arms
    expect(Math.round(pathEllipse.width)).toBe(200);
    expect(Math.round(pathEllipse.height)).toBe(100);
  });
});
