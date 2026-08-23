import { describe, expect, it } from "vitest";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";
import {
  RasterJobBudgetError,
  RasterJobCancelledError,
  type RasterPixelBuffer,
} from "@/lib/raster/processor";

function pixels(data: number[], width: number, height: number): RasterPixelBuffer {
  return { width, height, data: new Uint8ClampedArray(data) };
}

describe("LocalRasterProcessor", () => {
  const processor = getLocalRasterProcessor();

  it("executes Magic Wand through the shared RasterJob interface", async () => {
    const result = await processor.execute({
      kind: "magicWand",
      pixels: pixels([255, 0, 0, 255, 0, 0, 255, 255], 2, 1),
      seedX: 0,
      seedY: 0,
      tolerance: 0,
    });

    expect(result.kind).toBe("mask");
    if (result.kind === "mask") expect(Array.from(result.mask)).toEqual([1, 0]);
  });

  it("applies one Selection mask to pixel data", async () => {
    const result = await processor.execute({
      kind: "selectionMask",
      pixels: pixels([10, 20, 30, 255, 40, 50, 60, 255], 2, 1),
      mask: new Uint8Array([1, 0]),
      mode: "erase",
    });

    expect(result.kind).toBe("pixels");
    if (result.kind === "pixels")
      expect(Array.from(result.data)).toEqual([10, 20, 30, 0, 40, 50, 60, 255]);
  });

  it("keeps only selected pixels for a keep mask", async () => {
    const result = await processor.execute({
      kind: "selectionMask",
      pixels: pixels([10, 20, 30, 255, 40, 50, 60, 255], 2, 1),
      mask: new Uint8Array([1, 0]),
      mode: "keep",
    });

    expect(result.kind).toBe("pixels");
    if (result.kind === "pixels")
      expect(Array.from(result.data)).toEqual([10, 20, 30, 255, 40, 50, 60, 0]);
  });

  it("resizes thumbnail pixel jobs and reports progress", async () => {
    const updates: number[] = [];
    const result = await processor.execute(
      {
        kind: "thumbnail",
        pixels: pixels([255, 0, 0, 255], 1, 1),
        width: 2,
        height: 2,
      },
      { onProgress: ({ progress }) => updates.push(progress) },
    );

    expect(result.kind).toBe("pixels");
    if (result.kind === "pixels") expect(result.data.length).toBe(16);
    expect(updates.at(-1)).toBe(1);
  });

  it("rejects over-budget and cancelled jobs before processing", async () => {
    await expect(
      processor.execute(
        {
          kind: "magicWand",
          pixels: pixels([0, 0, 0, 255], 1, 1),
          seedX: 0,
          seedY: 0,
          tolerance: 0,
        },
        { maxPixels: 0 },
      ),
    ).rejects.toBeInstanceOf(RasterJobBudgetError);

    const controller = new AbortController();
    controller.abort();
    await expect(
      processor.execute(
        {
          kind: "magicWand",
          pixels: pixels([0, 0, 0, 255], 1, 1),
          seedX: 0,
          seedY: 0,
          tolerance: 0,
        },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(RasterJobCancelledError);
  });

  it("cancels a large flood fill while it is still processing", async () => {
    const controller = new AbortController();
    const data = new Uint8ClampedArray(512 * 512 * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    const job = processor.execute(
      {
        kind: "magicWand",
        pixels: pixels(Array.from(data), 512, 512),
        seedX: 0,
        seedY: 0,
        tolerance: 0,
      },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 0);
    await expect(job).rejects.toBeInstanceOf(RasterJobCancelledError);
  });
});
