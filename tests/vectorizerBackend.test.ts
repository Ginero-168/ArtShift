import { describe, expect, it } from "vitest";
import {
  DEFAULT_VECTORIZE_BACKEND,
  mapArtShiftOptionsToVTracer,
  VECTORIZE_BACKEND_OPTIONS,
} from "@/lib/vectorize/vectorizerBackend";

describe("vectorizer backend contract", () => {
  it("keeps the existing custom engine as the default", () => {
    expect(DEFAULT_VECTORIZE_BACKEND).toBe("custom");
    expect(VECTORIZE_BACKEND_OPTIONS.map((option) => option.value)).toEqual([
      "custom",
      "vtracer-wasm",
    ]);
  });

  it("maps a monochrome ArtShift trace to VTracer binary spline settings", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "lineArt",
        mode: "monochrome",
        colors: 2,
        detailLevel: 4,
        smoothing: 0.2,
        cornerSharpness: 0.85,
        minArea: 3,
      }),
    ).toMatchObject({
      preset: "bw",
      clustering: "bw",
      mode: "spline",
      hierarchical: "stacked",
      binaryThreshold: 140,
      optimize: 2,
    });
  });

  it("maps a photo trace to a color VTracer pipeline with bounded colors", () => {
    const mapped = mapArtShiftOptionsToVTracer({
      preset: "photoDetailed",
      mode: "color",
      colors: 64,
      detailLevel: 5,
      smoothing: 0.2,
      cornerSharpness: 0.5,
      minArea: 2,
    });

    expect(mapped).toMatchObject({
      preset: "photo",
      clustering: "color-cluster",
      mode: "spline",
      hierarchical: "stacked",
      maxColors: 64,
      optimize: 2,
    });
    expect(mapped.filterSpeckle).toBeGreaterThanOrEqual(1);
    expect(mapped.simplify).toBeGreaterThan(0);
  });
});
