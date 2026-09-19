import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrayBufferToPngDataUrl,
  createBakeSurface,
  encodeImageData,
  encodeImageDataToPngDataUrl,
  PNG_DATA_URL_PREFIX,
  WEBP_DATA_URL_PREFIX,
} from "@/lib/raster/studio/encodeRevision";
import {
  clampStudioZoom,
  fitZoomForStage,
  STUDIO_MAX_ZOOM,
} from "@/lib/raster/studio/sessionStore";

describe("Raster Studio Phase 3 encode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes an ArrayBuffer as a PNG data URL", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    expect(arrayBufferToPngDataUrl(bytes.buffer)).toBe(
      `${PNG_DATA_URL_PREFIX}${btoa(String.fromCharCode(1, 2, 3, 4))}`,
    );
  });

  it("returns a PNG data URL even when jsquash cannot load", async () => {
    const fakeCtx = {
      putImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      `${PNG_DATA_URL_PREFIX}ZmFrZQ==`,
    );

    const imageData = new ImageData(2, 2);
    const result = await encodeImageDataToPngDataUrl(imageData);
    expect(result.dataURL.startsWith(PNG_DATA_URL_PREFIX)).toBe(true);
    expect(result.encoder === "jsquash-png" || result.encoder === "canvas-png").toBe(true);
  });

  it("keeps PNG as the default encode and can request WebP", async () => {
    const fakeCtx = {
      putImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation((type?: string) => {
      if (type === "image/webp") return `${WEBP_DATA_URL_PREFIX}d2VicA==`;
      return `${PNG_DATA_URL_PREFIX}ZmFrZQ==`;
    });

    const imageData = new ImageData(2, 2);
    const png = await encodeImageData(imageData);
    expect(png.format).toBe("png");
    expect(png.dataURL.startsWith(PNG_DATA_URL_PREFIX)).toBe(true);

    const webp = await encodeImageData(imageData, { format: "webp" });
    expect(webp.format === "webp" || webp.format === "png").toBe(true);
    expect(
      webp.dataURL.startsWith(WEBP_DATA_URL_PREFIX) || webp.dataURL.startsWith(PNG_DATA_URL_PREFIX),
    ).toBe(true);
  });

  it("creates a bake surface with documented dimensions", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    const surface = createBakeSurface(12, 8);
    expect(surface.canvas.width).toBe(12);
    expect(surface.canvas.height).toBe(8);
    expect(surface.ctx).toBeTruthy();
  });
});

describe("Raster Studio fit zoom", () => {
  it("fits a large image into the stage with padding", () => {
    expect(fitZoomForStage(1000, 800, 2000, 1000)).toBeCloseTo(0.46, 5);
  });

  it("clamps to the max zoom for tiny images", () => {
    expect(fitZoomForStage(10_000, 10_000, 10, 10)).toBe(STUDIO_MAX_ZOOM);
  });

  it("clamps manual zoom to the studio range", () => {
    expect(clampStudioZoom(0.001)).toBe(0.05);
    expect(clampStudioZoom(99)).toBe(STUDIO_MAX_ZOOM);
  });
});
