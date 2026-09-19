import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendRasterSelection,
  createRasterSelection,
  createRasterSelectionMaskDataUrl,
  createRasterSelectionOperation,
} from "@/lib/raster/selection";

describe("raster Selection masks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rasterizes a vector Selection into a reusable alpha-mask data URL", () => {
    const fillRect = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect,
      globalCompositeOperation: "source-over",
      fillStyle: "#fff",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,selection",
    );

    const selection = appendRasterSelection(
      createRasterSelection(100, 80),
      createRasterSelectionOperation("replace", {
        kind: "rect",
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.4,
      }),
      100,
      80,
    );

    expect(createRasterSelectionMaskDataUrl(selection, 100, 80)).toBe(
      "data:image/png;base64,selection",
    );
    const [x, y, width, height] = fillRect.mock.calls[0] as number[];
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(16);
    expect(width).toBeCloseTo(50);
    expect(height).toBeCloseTo(32);
  });

  it("caches the rendered mask for repeated strokes sharing one Selection", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      globalCompositeOperation: "source-over",
      fillStyle: "#fff",
    } as unknown as CanvasRenderingContext2D;
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,cached-selection");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const selection = appendRasterSelection(
      createRasterSelection(100, 80),
      createRasterSelectionOperation("replace", {
        kind: "ellipse",
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.4,
      }),
      100,
      80,
    );

    createRasterSelectionMaskDataUrl(selection, 100, 80);
    createRasterSelectionMaskDataUrl(selection, 100, 80);

    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it("rasterizes anti-aliased shapes via a 2× downsample", () => {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      fillRect,
      globalCompositeOperation: "source-over",
      fillStyle: "#fff",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,aa-selection",
    );

    const selection = appendRasterSelection(
      createRasterSelection(100, 80),
      createRasterSelectionOperation(
        "replace",
        { kind: "rect", x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
        { antiAlias: true },
      ),
      100,
      80,
    );

    expect(createRasterSelectionMaskDataUrl(selection, 100, 80)).toBe(
      "data:image/png;base64,aa-selection",
    );
    expect(fillRect).toHaveBeenCalled();
    const [x, y, width, height] = fillRect.mock.calls[0] as number[];
    expect(x).toBeCloseTo(20);
    expect(y).toBeCloseTo(32);
    expect(width).toBeCloseTo(100);
    expect(height).toBeCloseTo(64);
    expect(drawImage).toHaveBeenCalled();
  });
});
