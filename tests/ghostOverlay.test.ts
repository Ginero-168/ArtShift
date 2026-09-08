import { describe, expect, it, vi } from "vitest";
import {
  calculateGhostBounds,
  drawGhostVariationOverlay,
  type GhostVariationOverlay,
} from "@/lib/renderer/ghostOverlay";

describe("Canvas Ghost Overlay Prototype", () => {
  it("calculates centered ghost bounds preserving aspect ratio", () => {
    const bounds = calculateGhostBounds(1000, 1000, 800, 400, "center");

    // 2:1 aspect ratio, target area 0.65 -> width: 650, height: 325
    expect(bounds.width).toBe(650);
    expect(bounds.height).toBe(325);
    expect(bounds.x).toBe(175); // (1000 - 650) / 2
    expect(bounds.y).toBe(338); // Math.round((1000 - 325) / 2)
  });

  it("calculates background fill ghost bounds", () => {
    const bounds = calculateGhostBounds(1920, 1080, 500, 500, "fill-background");
    expect(bounds).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("preserves selection bounds when intent is preserve-selection", () => {
    const selection = { x: 50, y: 80, width: 300, height: 400 };
    const bounds = calculateGhostBounds(1000, 1000, 500, 500, "preserve-selection", selection);
    expect(bounds).toEqual(selection);
  });

  it("calls canvas 2D draw methods with correct styles and save/restore", () => {
    const ctxMock = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 120 }),
      setLineDash: vi.fn(),
      globalAlpha: 1.0,
      strokeStyle: "",
      lineWidth: 1,
      fillStyle: "",
      font: "",
      textBaseline: "",
    };

    const overlay: GhostVariationOverlay = {
      variationId: "var-1",
      image: {} as HTMLImageElement,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      opacity: 0.8,
      label: "Variation 1 (Book Cover)",
    };

    drawGhostVariationOverlay(overlay, { ctx: ctxMock as unknown as CanvasRenderingContext2D });

    expect(ctxMock.save).toHaveBeenCalled();
    expect(ctxMock.restore).toHaveBeenCalled();
    expect(ctxMock.drawImage).toHaveBeenCalledWith(overlay.image, 100, 100, 400, 300);
    expect(ctxMock.strokeRect).toHaveBeenCalledWith(100, 100, 400, 300);
    expect(ctxMock.fillText).toHaveBeenCalledWith(
      "✨ Variation 1 (Book Cover)",
      expect.any(Number),
      expect.any(Number),
    );
  });
});
