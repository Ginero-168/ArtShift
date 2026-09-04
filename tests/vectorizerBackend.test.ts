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
      filterSpeckle: 2,
      layerDifference: 16,
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
      filterSpeckle: 10,
      layerDifference: 48,
      maxColors: 64,
      optimize: 2,
    });
    expect(mapped.filterSpeckle).toBeGreaterThanOrEqual(1);
    expect(mapped.simplify).toBeUndefined();
  });

  it("honors native VTracer controls instead of forcing one pipeline", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "illustration",
        mode: "color",
        colors: 12,
        vtracer: {
          mode: "polygon",
          hierarchical: "stacked",
          clustering: "watershed",
          filterSpeckle: 6,
          layerDifference: 32,
          simplify: null,
        },
      }),
    ).toMatchObject({
      clustering: "watershed",
      hierarchical: "stacked",
      mode: "polygon",
      filterSpeckle: 6,
      layerDifference: 32,
      simplify: undefined,
    });
  });

  it("honors the native B&W threshold when the trace is monochrome", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "lineArt",
        vtracer: { binaryThreshold: 190 },
      }),
    ).toMatchObject({ clustering: "bw", binaryThreshold: 190 });
  });

  it("does not let a preset hide an explicit ArtShift B&W threshold", () => {
    expect(mapArtShiftOptionsToVTracer({ mode: "monochrome", blackThreshold: 210 })).toMatchObject({
      clustering: "bw",
      binaryThreshold: 210,
    });
  });

  it("uses preset values when callers omit generic ArtShift controls", () => {
    expect(mapArtShiftOptionsToVTracer({ preset: "photoDetailed" })).toMatchObject({
      preset: "photo",
      maxColors: 36,
      colorPrecision: 8,
      filterSpeckle: 10,
      layerDifference: 48,
      mode: "spline",
      hierarchical: "stacked",
    });
  });
});
