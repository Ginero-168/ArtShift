import { beforeEach, describe, expect, it, vi } from "vitest";
import { VectorizeComplexityError, vectorizeImage } from "@/lib/vectorize/vectorizer";

describe("vectorizer large-image stress repro", () => {
  const size = 1200;

  beforeEach(() => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const noisy = (x * 31 + y * 17) % 11 < 6;
        data[index] = noisy ? 80 : 220;
        data[index + 1] = noisy ? 120 : 60;
        data[index + 2] = noisy ? 180 : 40;
        data[index + 3] = 255;
      }
    }

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data, width: size, height: size })),
    } as unknown as CanvasRenderingContext2D);

    class MockImage {
      naturalWidth = size;
      naturalHeight = size;
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;

      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }

    vi.stubGlobal("Image", MockImage);
  });

  it("rejects an unsafe contour instead of blocking the main thread indefinitely", async () => {
    await expect(
      vectorizeImage(
        "data:image/png;base64,stress",
        { x: 0, y: 0, width: size, height: size },
        { preset: "highFidelity", colors: 4, detailLevel: 4 },
      ),
    ).rejects.toBeInstanceOf(VectorizeComplexityError);
  }, 10_000);
});
