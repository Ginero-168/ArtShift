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

  it("computes the full viewport frustum in world space", () => {
    expect(getVisibleWorldBounds(viewport)).toEqual({
      x: -40,
      y: -20,
      width: 1600,
      height: 1000,
    });
  });

  it("fits the known output inside the visible viewport (not locked to canvas)", () => {
    const visible = getVisibleWorldBounds(viewport);
    const bounds = getGenerationPreviewBounds(viewport, {
      width: 1024,
      height: 1536,
    });
    expect(bounds.x).toBeGreaterThanOrEqual(visible.x);
    expect(bounds.y).toBeGreaterThanOrEqual(visible.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(visible.x + visible.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(visible.y + visible.height);
    expect(bounds.width / bounds.height).toBeCloseTo(1024 / 1536, 3);
  });

  it("can place outside the slide when the viewport is panned off-canvas", () => {
    const pannedAway = {
      ...viewport,
      tx: -2000,
      ty: -1500,
    };
    const visible = getVisibleWorldBounds(pannedAway);
    expect(visible.x).toBeGreaterThan(0);
    expect(visible.width).toBeGreaterThan(0);

    const bounds = getGenerationPreviewBounds(pannedAway, { width: 1024, height: 1024 });
    expect(bounds.width).toBeGreaterThan(40);
    expect(bounds.height).toBeGreaterThan(40);
    expect(bounds.width / bounds.height).toBeCloseTo(1, 3);
    // Centered in viewport — may sit outside the slide rectangle.
    expect(bounds.x + bounds.width / 2).toBeCloseTo(visible.x + visible.width / 2, 0);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(visible.y + visible.height / 2, 0);
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
