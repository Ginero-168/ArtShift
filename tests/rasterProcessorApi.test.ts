import { describe, expect, it } from "vitest";
import { ApiRasterProcessor } from "@/lib/raster/apiRasterProcessor";
import {
  decodeRasterJob,
  decodeRasterResult,
  encodeRasterJob,
  encodeRasterResult,
} from "@/lib/raster/jobPayload";
import { executeRasterJobLocally, type RasterPixelBuffer } from "@/lib/raster/processor";

function pixels(): RasterPixelBuffer {
  return {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
  };
}

describe("Raster API boundary", () => {
  it("round-trips typed pixel buffers through the JSON payload", () => {
    const job = {
      kind: "magicWand" as const,
      pixels: pixels(),
      seedX: 0,
      seedY: 0,
      tolerance: 8,
    };
    const encoded = encodeRasterJob(job);
    const decoded = decodeRasterJob(encoded);
    expect(decoded).toEqual(job);

    const result = executeRasterJobLocally(job);
    expect(decodeRasterResult(encodeRasterResult(result))).toEqual(result);
  });

  it("uses the same processor contract for Fast mode", async () => {
    const processor = new ApiRasterProcessor("/api/raster/process", async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { job: Parameters<typeof decodeRasterJob>[0] };
      const job = decodeRasterJob(body.job);
      if (!job) throw new Error("test payload did not decode");
      return new Response(
        JSON.stringify({ result: encodeRasterResult(executeRasterJobLocally(job)) }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const result = await processor.execute({
      kind: "magicWand",
      pixels: pixels(),
      seedX: 0,
      seedY: 0,
      tolerance: 0,
    });
    expect(result.kind).toBe("mask");
    if (result.kind === "mask") expect(Array.from(result.mask)).toEqual([1, 0]);
  });
});
