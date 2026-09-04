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

  it("maps the official B&W recipe without ArtShift overrides", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "lineArt",
        vtracer: { usePresetDefaults: true },
      }),
    ).toMatchObject({
      preset: "bw",
      clustering: "bw",
      mode: "spline",
      hierarchical: "stacked",
      filterSpeckle: 4,
      colorPrecision: 6,
      layerDifference: 16,
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45,
      binaryThreshold: 128,
      optimize: 1,
      simplify: undefined,
    });
  });

  it("maps explicitly tuned monochrome settings without using the preset defaults", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "lineArt",
        mode: "monochrome",
        detailLevel: 4,
        smoothing: 0.2,
        cornerSharpness: 0.85,
        vtracer: { usePresetDefaults: false, filterSpeckle: 2, binaryThreshold: 190 },
      }),
    ).toMatchObject({
      preset: "bw",
      clustering: "bw",
      mode: "spline",
      hierarchical: "stacked",
      filterSpeckle: 2,
      binaryThreshold: 190,
      optimize: 2,
    });
  });

  it("maps an official poster recipe to polygon cutout with a compact palette", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "highFidelity",
        vtracer: { usePresetDefaults: true },
      }),
    ).toMatchObject({
      preset: "poster",
      mode: "polygon",
      hierarchical: "cutout",
      clustering: "color-cluster",
      filterSpeckle: 4,
      colorPrecision: 8,
      layerDifference: 16,
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45,
      maxColors: 8,
      optimize: 1,
      simplify: undefined,
    });
  });

  it("maps the official photo recipe without forcing a palette cap", () => {
    expect(mapArtShiftOptionsToVTracer({ preset: "photoDetailed" })).toMatchObject({
      preset: "photo",
      clustering: "color-cluster",
      mode: "spline",
      hierarchical: "stacked",
      filterSpeckle: 10,
      colorPrecision: 8,
      layerDifference: 48,
      cornerThreshold: 180,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: 45,
      maxColors: undefined,
      optimize: 1,
      simplify: undefined,
    });
  });

  it("honors native VTracer controls instead of forcing one pipeline", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "illustration",
        mode: "color",
        colors: 12,
        vtracer: {
          usePresetDefaults: false,
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

  it("does not let a preset hide an explicit ArtShift B&W threshold", () => {
    expect(mapArtShiftOptionsToVTracer({ mode: "monochrome", blackThreshold: 210 })).toMatchObject({
      clustering: "bw",
      binaryThreshold: 210,
    });
  });

  it("keeps custom detail mapping inside VTracer's supported length range", () => {
    expect(
      mapArtShiftOptionsToVTracer({
        preset: "custom",
        detailLevel: 5,
        vtracer: { usePresetDefaults: false },
      }).lengthThreshold,
    ).toBe(3.5);
  });
});
