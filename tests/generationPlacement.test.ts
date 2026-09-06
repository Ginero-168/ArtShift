import { describe, expect, it } from "vitest";
import {
  getGenerationPreviewBounds,
  getVisibleWorldBounds,
} from "@/lib/engine/generationPlacement";

describe("generation preview placement", () => {
  const viewport = {
    width: 800,
    height: 500,
    scale: 0.5,
    tx: 20,
    ty: 10,
    slideWidth: 1920,
    slideHeight: 1080,
  };

  it("computes the visible world intersection", () => {
    expect(getVisibleWorldBounds(viewport)).toEqual({ x: 0, y: 0, width: 1560, height: 980 });
  });

  it("fits the known output inside the visible Canvas area", () => {
    const bounds = getGenerationPreviewBounds(viewport, { width: 1024, height: 1536 });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.slideWidth);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.slideHeight);
    expect(bounds.width / bounds.height).toBeCloseTo(1024 / 1536, 3);
  });
});
