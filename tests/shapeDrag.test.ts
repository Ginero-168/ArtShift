import { describe, expect, it } from "vitest";
import { constrainShapeDrag } from "@/lib/engine/shapeDrag";

describe("shape drag constraints", () => {
  it("locks supported Shapes to a 1:1 ratio while Shift is held", () => {
    expect(constrainShapeDrag("rect", { x: 100, y: 100 }, { x: 180, y: 140 }, true)).toEqual({
      start: { x: 100, y: 100 },
      current: { x: 180, y: 180 },
    });
    expect(constrainShapeDrag("ellipse", { x: 200, y: 200 }, { x: 140, y: 170 }, true)).toEqual({
      start: { x: 200, y: 200 },
      current: { x: 140, y: 140 },
    });
  });

  it("does not constrain line-like tools or unconstrained drags", () => {
    const start = { x: 100, y: 100 };
    const current = { x: 180, y: 140 };
    expect(constrainShapeDrag("line", start, current, true)).toEqual({ start, current });
    expect(constrainShapeDrag("rect", start, current, false)).toEqual({ start, current });
  });
});
