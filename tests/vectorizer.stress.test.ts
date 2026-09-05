import { describe, expect, it } from "vitest";
import { VectorizeComplexityError } from "@/lib/vectorize/vectorizer";
import { assertVTracerRasterWithinLimits } from "@/lib/vectorize/vtracerRuntime";

describe("vectorizer large-image safety guard", () => {
  it("rejects an unsafe raster before the WASM runtime can block the main thread", () => {
    const width = 1201;
    const height = 1;
    const pixels = new Uint8ClampedArray(width * height * 4);

    expect(() => assertVTracerRasterWithinLimits(pixels, width, height)).toThrow(
      VectorizeComplexityError,
    );
  });
});
