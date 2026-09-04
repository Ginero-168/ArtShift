import { afterEach, describe, expect, it, vi } from "vitest";
import { vectorizeImage } from "@/lib/vectorize/vectorizer";

describe("vectorizer runtime fallback integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the Custom engine when a selected VTracer Worker cannot start", async () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const inside = x >= 4 && x < 16 && y >= 4 && y < 16;
        pixels[index] = inside ? 220 : 255;
        pixels[index + 1] = inside ? 40 : 255;
        pixels[index + 2] = inside ? 40 : 255;
        pixels[index + 3] = 255;
      }
    }

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels, width, height })),
    } as unknown as CanvasRenderingContext2D);

    class MockImage {
      naturalWidth = width;
      naturalHeight = height;
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal(
      "Worker",
      class BrokenWorker {
        constructor() {
          throw new Error("Worker unavailable in this browser");
        }
      },
    );

    const result = await vectorizeImage(
      "data:image/png;base64,fallback-fixture",
      { x: 0, y: 0, width: 200, height: 200 },
      { backend: "vtracer-wasm", preset: "illustration", colors: 4, detailLevel: 1 },
    );

    expect(result.backend).toBe("custom");
    expect(result.svgString).toContain("<svg");
    expect(result.elements.every((element) => element.type === "path")).toBe(true);
  });
});
