import { describe, expect, it } from "vitest";
import { unionBBox } from "../lib/engine/bounds";
import { createRect } from "../lib/engine/factory";

describe("Multi-Element & Group Rotation Around Center Pivot", () => {
  it("calculates center pivot of multiple elements correctly", () => {
    const el1 = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const el2 = createRect({ x: 100, y: 0, width: 100, height: 100 });

    const aabb = unionBBox([el1, el2]);
    expect(aabb).toBeDefined();
    if (aabb) {
      expect(aabb.x).toBe(0);
      expect(aabb.y).toBe(0);
      expect(aabb.width).toBe(200);
      expect(aabb.height).toBe(100);

      const cx = aabb.x + aabb.width / 2;
      const cy = aabb.y + aabb.height / 2;
      expect(cx).toBe(100);
      expect(cy).toBe(50);
    }
  });

  it("rotates multiple elements around their shared center pivot by 90 degrees", () => {
    const el1 = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const el2 = createRect({ x: 100, y: 0, width: 100, height: 100 });
    const originals = [el1, el2];

    const aabb = unionBBox(originals)!;
    const cx = aabb.x + aabb.width / 2;
    const cy = aabb.y + aabb.height / 2;

    const deltaAngle = Math.PI / 2; // 90 degrees
    const cos = Math.cos(deltaAngle);
    const sin = Math.sin(deltaAngle);

    const patches = originals.map((el) => {
      const elCx = el.x + el.width / 2;
      const elCy = el.y + el.height / 2;
      const ox = elCx - cx;
      const oy = elCy - cy;
      const newElCx = cx + ox * cos - oy * sin;
      const newElCy = cy + ox * sin + oy * cos;
      return {
        id: el.id,
        patch: {
          x: Math.round(newElCx - el.width / 2),
          y: Math.round(newElCy - el.height / 2),
          angle: (el.angle ?? 0) + deltaAngle,
        },
      };
    });

    // Element 1 should have moved from left to top
    expect(patches[0].patch.x).toBe(50);
    expect(patches[0].patch.y).toBe(-50);
    expect(patches[0].patch.angle).toBeCloseTo(Math.PI / 2);

    // Element 2 should have moved from right to bottom
    expect(patches[1].patch.x).toBe(50);
    expect(patches[1].patch.y).toBe(50);
    expect(patches[1].patch.angle).toBeCloseTo(Math.PI / 2);
  });
});
