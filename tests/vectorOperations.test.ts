import { describe, expect, it } from "vitest";
import type { VectorPathNode } from "../lib/engine/types";
import {
  insertNodeAt,
  removeNodeAt,
  setNodeHandle,
  smoothVectorPathNodes,
  toggleNodeSmoothness,
} from "../lib/engine/vectorPath";

describe("Vector Node Operations & Bézier Engine", () => {
  const initialNodes: VectorPathNode[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  it("inserts a new node at specified index", () => {
    const updated = insertNodeAt(initialNodes, 2, { x: 0.5, y: 0.5 });
    expect(updated.length).toBe(5);
    expect(updated[2]).toEqual({ x: 0.5, y: 0.5 });
  });

  it("removes a node at specified index without dropping below 2 nodes", () => {
    const updated = removeNodeAt(initialNodes, 1);
    expect(updated.length).toBe(3);
    expect(updated[0]).toEqual({ x: 0, y: 0 });
    expect(updated[1]).toEqual({ x: 1, y: 1 });

    const twoNodes: VectorPathNode[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const unchanged = removeNodeAt(twoNodes, 0);
    expect(unchanged.length).toBe(2);
  });

  it("toggles node smoothness between sharp corner and smooth curves", () => {
    // 1. Sharp to Smooth
    const smoothed = toggleNodeSmoothness(initialNodes, 1);
    expect(smoothed[1].in).toBeDefined();
    expect(smoothed[1].out).toBeDefined();

    // 2. Smooth back to Sharp
    const sharp = toggleNodeSmoothness(smoothed, 1);
    expect(sharp[1].in).toBeUndefined();
    expect(sharp[1].out).toBeUndefined();
  });

  it("manipulates Bézier handles symmetrically", () => {
    const delta: [number, number] = [0.2, -0.1];
    const withHandle = setNodeHandle(initialNodes, 1, "out", delta, true);

    expect(withHandle[1].out).toEqual([0.2, -0.1]);
    expect(withHandle[1].in).toEqual([-0.2, 0.1]); // Symmetric opposite
  });

  it("smooths closed vector paths uniformly", () => {
    const smoothed = smoothVectorPathNodes(initialNodes, 0.5, true);
    for (const node of smoothed) {
      expect(node.in).toBeDefined();
      expect(node.out).toBeDefined();
    }
  });
});
