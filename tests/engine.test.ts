import { describe, expect, it } from "vitest";
import { recomputeArrowBindings } from "@/lib/engine/binding";
import { elementWorldBBox, localToWorld, unionBBox, worldToLocal } from "@/lib/engine/bounds";
import { createArrow, createRect } from "@/lib/engine/factory";
import { hitTestElement, pickInsideRect, pickTopMost } from "@/lib/engine/hitTest";
import { snapBBox } from "@/lib/engine/snap";
import { SLIDE_H, SLIDE_W } from "@/lib/engine/types";

function rect(x: number, y: number, w: number, h: number) {
  return { ...createRect({ x, y, width: w, height: h }), z: 0 };
}

function zed(el: ReturnType<typeof rect>, z: number) {
  return { ...el, z };
}

describe("bounds", () => {
  it("returns the same bbox for an unrotated rect", () => {
    const el = rect(10, 20, 100, 50);
    expect(elementWorldBBox(el)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("round-trips world/local through rotation", () => {
    const el = { ...rect(10, 20, 100, 50), angle: Math.PI / 4 };
    const world = { x: 30, y: 40 };
    const local = worldToLocal(el, world);
    expect(localToWorld(el, local)).toMatchObject({ x: 30, y: 40 });
  });

  it("unions bboxes of multiple elements", () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(150, 200, 50, 50);
    expect(unionBBox([a, b])).toEqual({ x: 0, y: 0, width: 200, height: 250 });
  });

  it("returns null for empty union", () => {
    expect(unionBBox([])).toBeNull();
  });
});

describe("hitTest", () => {
  it("hits inside a filled rect", () => {
    const el = { ...rect(10, 10, 100, 100), backgroundColor: "#ff0000" };
    expect(hitTestElement({ x: 50, y: 50 }, el)).toBe(true);
  });

  it("hits inside a transparent filled rect", () => {
    const el = { ...rect(10, 10, 100, 100), backgroundColor: "transparent" };
    expect(hitTestElement({ x: 50, y: 50 }, el)).toBe(true);
  });

  it("misses outside a filled rect", () => {
    const el = { ...rect(10, 10, 100, 100), backgroundColor: "#ff0000" };
    expect(hitTestElement({ x: 5, y: 5 }, el)).toBe(false);
  });

  it("does not hit a hidden layer", () => {
    const el = {
      ...rect(10, 10, 100, 100),
      backgroundColor: "#ff0000",
      visible: false,
    };
    expect(hitTestElement({ x: 50, y: 50 }, el)).toBe(false);
  });

  it("picks top-most by z", () => {
    const a = { ...zed(rect(0, 0, 100, 100), 1), backgroundColor: "#ff0000" };
    const b = { ...zed(rect(0, 0, 100, 100), 2), backgroundColor: "#ff0000" };
    expect(pickTopMost({ x: 50, y: 50 }, [a, b])).toBe(b);
  });

  it("picks top-most by z even when array order differs from render order", () => {
    const top = { ...zed(rect(0, 0, 100, 100), 9), backgroundColor: "#ff0000" };
    const bottom = { ...zed(rect(0, 0, 100, 100), 1), backgroundColor: "#0000ff" };
    expect(pickTopMost({ x: 50, y: 50 }, [top, bottom])).toBe(top);
  });

  it("picks elements fully inside a rect", () => {
    const a = rect(10, 10, 20, 20);
    const b = rect(100, 100, 20, 20);
    expect(pickInsideRect({ x: 0, y: 0, width: 50, height: 50 }, [a, b])).toEqual([a]);
  });
});

describe("snap", () => {
  it("snaps a bbox to the horizontal center of the slide", () => {
    const r = rect(945, 100, 50, 50); // center is at 970, slide center 960
    const result = snapBBox({ x: r.x, y: r.y, width: r.width, height: r.height }, [], 10);
    expect(result.dx).toBe(-10);
    expect(result.guides).toEqual([{ axis: "x", at: SLIDE_W / 2, from: 0, to: SLIDE_H }]);
  });

  it("does not snap when distance is beyond threshold", () => {
    const r = rect(890, 100, 50, 50); // right edge 940, distance to center 960 = 20
    const result = snapBBox({ x: r.x, y: r.y, width: r.width, height: r.height }, [], 10);
    expect(result.dx).toBe(0);
    expect(result.guides).toHaveLength(0);
  });
});

describe("arrow binding", () => {
  it("recomputes an arrow endpoint when its bound target moves", () => {
    const target = rect(100, 100, 100, 100);
    const arrow = createArrow([0, 150], [100, 150]);
    const boundArrow = {
      ...arrow,
      endBinding: { elementId: target.id, gap: 0, focus: 0.5 },
    };

    const slide = {
      id: "s1",
      name: "test",
      background: "#fff",
      width: SLIDE_W,
      height: SLIDE_H,
      elements: [target, boundArrow],
      layers: [],
    };

    const movedTarget = { ...target, x: 200, y: 200 };
    const nextSlide = { ...slide, elements: [movedTarget, boundArrow] };
    const result = recomputeArrowBindings(nextSlide);
    const arrowAfter = result.elements.find((e) => e.type === "arrow")!;
    const endLocal = (arrowAfter as ReturnType<typeof createArrow>).points.at(-1)!;
    const endWorld = { x: arrowAfter.x + endLocal[0], y: arrowAfter.y + endLocal[1] };
    // The target moved to (200,200) 100x100; the arrow endpoint should snap
    // to the left edge of the target along the ray from the other arrow end.
    expect(endWorld.x).toBe(200);
    expect(endWorld.y).toBeCloseTo(230, 0);
  });

  it("snaps the bound endpoint to the correct edge from each direction", () => {
    const target = rect(100, 100, 100, 100);
    const center = { x: 150, y: 150 };
    const cases: { from: [number, number]; expected: { x: number; y: number } }[] = [
      // approaching from left → hit left edge
      { from: [0, 150], expected: { x: 100, y: 150 } },
      // approaching from right → hit right edge
      { from: [300, 150], expected: { x: 200, y: 150 } },
      // approaching from top → hit top edge
      { from: [150, 0], expected: { x: 150, y: 100 } },
      // approaching from bottom → hit bottom edge
      { from: [150, 300], expected: { x: 150, y: 200 } },
      // approaching from top-left → hit top-left corner
      { from: [0, 0], expected: { x: 100, y: 100 } },
    ];

    for (const c of cases) {
      const arrow = createArrow(c.from, [center.x, center.y]);
      const boundArrow = { ...arrow, endBinding: { elementId: target.id, gap: 0, focus: 0.5 } };
      const slide = {
        id: "s1",
        name: "test",
        background: "#fff",
        width: SLIDE_W,
        height: SLIDE_H,
        elements: [target, boundArrow],
        layers: [],
      };
      const result = recomputeArrowBindings(slide);
      const arrowAfter = result.elements.find((e) => e.type === "arrow")!;
      const endLocal = (arrowAfter as ReturnType<typeof createArrow>).points.at(-1)!;
      const endWorld = { x: arrowAfter.x + endLocal[0], y: arrowAfter.y + endLocal[1] };
      expect(endWorld.x).toBeCloseTo(c.expected.x, 0);
      expect(endWorld.y).toBeCloseTo(c.expected.y, 0);
    }
  });
});
