import { describe, expect, it } from "vitest";
import { getBookMockupGeometry } from "@/lib/engine/bookMockup";
import { createBookMockup } from "@/lib/engine/factory";

function mockup(patch: Partial<ReturnType<typeof createBookMockup>> = {}) {
  return {
    ...createBookMockup({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
      fileId: "cover",
      naturalWidth: 1200,
      naturalHeight: 1800,
    }),
    ...patch,
  };
}

describe("book mockup projection", () => {
  it("projects a finite editable 3D surface set inside the element", () => {
    const geometry = getBookMockupGeometry(
      mockup({ yaw: 31, pitch: -16, roll: 9, binding: "hardcover" }),
    );
    expect(geometry.surfaces.map((surface) => surface.id)).toContain("frontCover");
    expect(geometry.surfaces.map((surface) => surface.id)).toContain("pageFore");
    for (const point of geometry.surfaces.flatMap((surface) => surface.quad)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(600);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(800);
    }
  });

  it("exposes opposite physical edges as yaw crosses the camera", () => {
    const leftView = getBookMockupGeometry(mockup({ yaw: 32, pitch: 0 }));
    const rightView = getBookMockupGeometry(mockup({ yaw: -32, pitch: 0 }));
    expect(leftView.surfaces.find((surface) => surface.id === "spine")?.visible).toBe(true);
    expect(rightView.surfaces.find((surface) => surface.id === "pageFore")?.visible).toBe(true);
  });

  it("supports an independent roll axis and lens perspective", () => {
    const neutral = getBookMockupGeometry(mockup({ roll: 0, perspective: 80 }));
    const changed = getBookMockupGeometry(mockup({ roll: 18, perspective: 30 }));
    expect(changed.front[0].x).not.toBeCloseTo(neutral.front[0].x, 2);
    expect(changed.front[0].y).not.toBeCloseTo(neutral.front[0].y, 2);
  });

  it("keeps camera/material identity when the mockup box scales", () => {
    const small = getBookMockupGeometry(mockup({ width: 300, height: 400, yaw: 26, pitch: -12 }));
    const large = getBookMockupGeometry(mockup({ width: 600, height: 800, yaw: 26, pitch: -12 }));
    for (let index = 0; index < 4; index++) {
      expect(small.front[index].x / 300).toBeCloseTo(large.front[index].x / 600, 5);
      expect(small.front[index].y / 400).toBeCloseTo(large.front[index].y / 800, 5);
    }
  });

  it("keeps a larger cover around the page block for hardcover binding", () => {
    const geometry = getBookMockupGeometry(
      mockup({ binding: "hardcover", coverOverhang: 4, yaw: -30, pitch: -18 }),
    );
    expect(geometry.binding).toBe("hardcover");
    expect(geometry.surfaces.find((surface) => surface.id === "frontEdgeTop")?.visible).toBe(true);
    expect(geometry.hinge).toHaveLength(4);
  });

  it("supports toggling ground shadow on and off", () => {
    const defaultMockup = mockup();
    expect(defaultMockup.showShadow).toBe(true);

    const noShadowMockup = mockup({ showShadow: false });
    expect(noShadowMockup.showShadow).toBe(false);
  });
});
