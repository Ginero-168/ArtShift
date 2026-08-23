import { describe, expect, it } from "vitest";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";

describe("raster performance gates", () => {
  it("keeps a medium Magic Wand job below the UI-blocking budget", async () => {
    const processor = getLocalRasterProcessor();
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    const samples: number[] = [];

    for (let iteration = 0; iteration < 5; iteration++) {
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
    expect(p95).toBeLessThan(50);
  });
});
