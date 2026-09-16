import { describe, expect, it } from "vitest";
import {
  getGenerationPreviewBesideSource,
  getGenerationPreviewBounds,
  getVisibleWorldBounds,
} from "@/lib/engine/generationPlacement";
import { PROCESSING_PREVIEW_GAP } from "@/lib/engine/processingPreview";

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
    expect(getVisibleWorldBounds(viewport)).toEqual({
      x: 0,
      y: 0,
      width: 1560,
      height: 980,
    });
  });

  it("fits the known output inside the visible Canvas area", () => {
    const bounds = getGenerationPreviewBounds(viewport, {
      width: 1024,
      height: 1536,
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.slideWidth);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.slideHeight);
    expect(bounds.width / bounds.height).toBeCloseTo(1024 / 1536, 3);
  });

  it("keeps a readable size when the visible Canvas intersection shrinks after a pan", () => {
    const pannedAway = {
      ...viewport,
      tx: -2000,
      ty: -1500,
    };
    const visible = getVisibleWorldBounds(pannedAway);
    expect(visible.width * visible.height).toBe(0);

    const bounds = getGenerationPreviewBounds(pannedAway, { width: 1024, height: 1024 });
    expect(bounds.width).toBeGreaterThan(40);
    expect(bounds.height).toBeGreaterThan(40);
    expect(bounds.width / bounds.height).toBeCloseTo(1, 3);
  });

  it("places generate previews beside the source like other processing preloads", () => {
    const beside = getGenerationPreviewBesideSource(
      { x: 100, y: 80, width: 320, height: 480 },
      { width: 768, height: 1024 },
    );
    expect(beside.x).toBe(100 + 320 + PROCESSING_PREVIEW_GAP);
    expect(beside.y).toBe(80);
    expect(beside.width / beside.height).toBeCloseTo(768 / 1024, 2);
    expect(beside.width * beside.height).toBeGreaterThan(40 * 40);
  });
});
