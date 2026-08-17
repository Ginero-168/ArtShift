import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportSlideToJPEG, exportSlideToPNG, exportSlideToWebP } from "../lib/engine/exportPNG";
import { createRect, createText } from "../lib/engine/factory";
import type { EngineSlide } from "../lib/engine/types";

vi.mock("../lib/renderer/canvas", () => ({
  renderSlide: vi.fn(),
}));

describe("Raster Image Exporters (PNG, WebP, JPEG)", () => {
  const testSlide: EngineSlide = {
    id: "test-slide",
    name: "Export Test",
    width: 600,
    height: 400,
    background: "#ffffff",
    layers: [],
    elements: [
      createRect({ x: 50, y: 50, width: 200, height: 100 }),
      createText({ x: 50, y: 200, text: "Sample Ad Copy", fontSize: 24 }),
    ],
  };

  beforeEach(() => {
    const mockCtx = {
      scale: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
    };

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      const mime = type || "image/png";
      const blob = new Blob(["mock-binary-data"], { type: mime });
      callback(blob);
    });
  });

  it("exports slide as PNG blob", async () => {
    const blob = await exportSlideToPNG(testSlide, testSlide.width, testSlide.height);
    expect(blob).toBeDefined();
    expect(blob.type).toBe("image/png");
  });

  it("exports slide as WebP blob", async () => {
    const blob = await exportSlideToWebP(
      testSlide,
      testSlide.width,
      testSlide.height,
      undefined,
      0.85,
    );
    expect(blob).toBeDefined();
    expect(blob.type).toBe("image/webp");
  });

  it("exports slide as JPEG blob", async () => {
    const blob = await exportSlideToJPEG(
      testSlide,
      testSlide.width,
      testSlide.height,
      undefined,
      0.9,
    );
    expect(blob).toBeDefined();
    expect(blob.type).toBe("image/jpeg");
  });
});
