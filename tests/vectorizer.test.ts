import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VectorizeResult } from "@/lib/vectorize/vectorizer";

const vtracerRuntimeMock = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock("@/lib/vectorize/vtracerRuntime", () => ({
  vectorizeRgbaWithVTracer: vtracerRuntimeMock.run,
}));

import { vectorizeImage } from "@/lib/vectorize/vectorizer";

describe("VTracer public vectorizer entrypoint", () => {
  const rgba = new Uint8ClampedArray(20 * 20 * 4);

  beforeEach(() => {
    vtracerRuntimeMock.run.mockImplementation(
      async (
        _pixels: Uint8ClampedArray,
        _width: number,
        _height: number,
        targetBounds: { x: number; y: number; width: number; height: number },
        _options: unknown,
        callbacks: {
          onProgress?: (update: { progress: number; stage: "loading" | "building" }) => void;
        },
      ): Promise<VectorizeResult> => {
        callbacks.onProgress?.({ progress: 0.25, stage: "loading" });
        callbacks.onProgress?.({ progress: 1, stage: "building" });
        return {
          backend: "vtracer-wasm",
          elements: [],
          svgString: '<svg viewBox="0 0 20 20"/>',
          palette: [],
          totalNodes: 0,
          width: targetBounds.width,
          height: targetBounds.height,
        };
      },
    );
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal(
      "Image",
      class MockImage {
        naturalWidth = 20;
        naturalHeight = 20;
        crossOrigin = "";
        onload: (() => void) | null = null;
        onerror: ((error: unknown) => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: rgba, width: 20, height: 20 })),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vtracerRuntimeMock.run.mockReset();
  });

  it("runs VTracer with the requested bounds and returns a VTracer result", async () => {
    const result = await vectorizeImage(
      "data:image/png;base64,fixture",
      { x: 50, y: 60, width: 200, height: 160 },
      { backend: "vtracer-wasm", preset: "illustration", detailLevel: 3 },
    );

    expect(result).toMatchObject({
      backend: "vtracer-wasm",
      width: 200,
      height: 160,
      svgString: expect.stringContaining("<svg"),
    });
    expect(vtracerRuntimeMock.run).toHaveBeenCalledWith(
      expect.any(Uint8ClampedArray),
      20,
      20,
      { x: 50, y: 60, width: 200, height: 160 },
      expect.objectContaining({ backend: "vtracer-wasm", preset: "illustration" }),
      {},
    );
  });

  it("keeps progress callbacks when the browser Worker is unavailable", async () => {
    const updates: number[] = [];

    await vectorizeImage(
      "data:image/png;base64,fixture",
      { x: 0, y: 0, width: 100, height: 100 },
      { backend: "vtracer-wasm" },
      { onProgress: ({ progress }) => updates.push(progress) },
    );

    expect(updates).toEqual([0.02, 0.25, 1]);
    expect(vtracerRuntimeMock.run).toHaveBeenCalledTimes(1);
  });

  it("does not enter VTracer after cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    await expect(
      vectorizeImage(
        "data:image/png;base64,fixture",
        { x: 0, y: 0, width: 100, height: 100 },
        { backend: "vtracer-wasm" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(vtracerRuntimeMock.run).not.toHaveBeenCalled();
  });
});
