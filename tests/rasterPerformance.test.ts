import { describe, expect, it } from "vitest";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";

describe("raster performance gates", () => {
  it("keeps a medium Magic Wand job below the UI-blocking budget", async () => {
    const processor = getLocalRasterProcessor();
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    const samples: number[] = [];

    // Warm the worker/message path so startup is not mistaken for the job's
    // steady-state cost when the complete suite is running in parallel.
    await processor.execute({
      kind: "magicWand",
      pixels: { width: 128, height: 128, data },
      seedX: 64,
      seedY: 64,
      tolerance: 0,
    });

    for (let iteration = 0; iteration < 20; iteration++) {
      const started = performance.now();
      await processor.execute({
        kind: "magicWand",
        pixels: { width: 128, height: 128, data },
        seedX: 64,
        seedY: 64,
        tolerance: 0,
      });
      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)];
    // Keep headroom for shared CI runners while retaining a hard regression
    // gate well below the point at which this small job is user-perceptible.
    expect(p95).toBeLessThan(100);
  });
});
