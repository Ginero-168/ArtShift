import { beforeEach, describe, expect, it, vi } from "vitest";
import { vectorizeImage } from "@/lib/vectorize/vectorizer";

describe("In-Browser Vectorizer Engine (Image-to-Vector)", () => {
  const sampleDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/2f88OmAAAAAElFTkSuQmCC";

  beforeEach(() => {
    // Mock 20x20 test pixel buffer with a red circle/square in center
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (x >= 4 && x <= 15 && y >= 4 && y <= 15) {
          data[idx] = 220; // R
          data[idx + 1] = 40; // G
          data[idx + 2] = 40; // B
          data[idx + 3] = 255; // A
        } else {
          data[idx] = 255; // R
          data[idx + 1] = 255; // G
          data[idx + 2] = 255; // B
          data[idx + 3] = 255; // A
        }
      }
    }

    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data,
        width: w,
        height: h,
      })),
    };

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    // Mock Image constructor with natural dimensions and onload dispatch
    class MockImage {
      naturalWidth = 20;
      naturalHeight = 20;
      crossOrigin = "";
      private _src = "";
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;

      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 5);
      }
    }

    vi.stubGlobal("Image", MockImage);
  });

  it("vectorizes raster image into native VectorPathElements", async () => {
    const result = await vectorizeImage(
      sampleDataUrl,
      { x: 50, y: 50, width: 200, height: 200 },
      { mode: "color", colors: 4, smoothing: 0.4 },
    );

    expect(result).toBeDefined();
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(Array.isArray(result.elements)).toBe(true);
    expect(Array.isArray(result.palette)).toBe(true);
    expect(typeof result.svgString).toBe("string");
    expect(result.svgString).toContain("<svg");
  });

  it("supports monochrome silhouette tracing", async () => {
    const result = await vectorizeImage(
      sampleDataUrl,
      { x: 0, y: 0, width: 100, height: 100 },
      { mode: "monochrome" },
    );

    expect(result).toBeDefined();
    expect(result.elements.length).toBeGreaterThanOrEqual(0);
    for (const el of result.elements) {
      expect(el.type).toBe("path");
      expect(el.closed).toBe(true);
      expect(el.nodes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("generates closed vector paths with valid 0..1 normalized Bézier nodes", async () => {
    const result = await vectorizeImage(
      sampleDataUrl,
      { x: 10, y: 20, width: 300, height: 400 },
      { mode: "posterize", colors: 6 },
    );

    for (const el of result.elements) {
      expect(el.closed).toBe(true);
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);

      for (const node of el.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(1);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("supports High-Fidelity Photo and Line Art presets with corner sharpness", async () => {
    const resultPhoto = await vectorizeImage(
      sampleDataUrl,
      { x: 0, y: 0, width: 400, height: 400 },
      { preset: "photoDetailed", colors: 36, detailLevel: 5, cornerSharpness: 0.8 },
    );

    expect(resultPhoto).toBeDefined();
    expect(resultPhoto.totalNodes).toBeGreaterThan(0);
    expect(resultPhoto.elements.length).toBeGreaterThan(0);

    const resultLineArt = await vectorizeImage(
      sampleDataUrl,
      { x: 0, y: 0, width: 200, height: 200 },
      { preset: "lineArt" },
    );

    expect(resultLineArt).toBeDefined();
    for (const el of resultLineArt.elements) {
      expect(el.closed).toBe(true);
    }
  });

  it("reports progress while vectorizing", async () => {
    const updates: number[] = [];
    await vectorizeImage(
      sampleDataUrl,
      { x: 0, y: 0, width: 100, height: 100 },
      { mode: "color", colors: 4, detailLevel: 1 },
      { onProgress: ({ progress }) => updates.push(progress) },
    );

    expect(updates[0]).toBeGreaterThan(0);
    expect(updates.at(-1)).toBe(1);
  });
});
