import {
  VECTORIZE_PRESET_CONFIGS,
  type VectorizeClustering,
  type VectorizeComposition,
  type VectorizeOptions,
  type VectorizePreset,
  type VectorizeTraceMode,
} from "./vectorizerTypes";

export type VectorizeBackend = "vtracer-wasm";

export type VTracerOptions = {
  preset?: "bw" | "poster" | "photo";
  clustering?: "color-cluster" | "bw" | "watershed";
  hierarchical?: "stacked" | "cutout";
  mode?: "pixel" | "polygon" | "spline";
  filterSpeckle?: number;
  colorPrecision?: number;
  layerDifference?: number;
  cornerThreshold?: number;
  lengthThreshold?: number;
  maxIterations?: number;
  spliceThreshold?: number;
  simplify?: number;
  pathPrecision?: number;
  maxColors?: number;
  optimize?: 0 | 1 | 2;
  binaryThreshold?: number;
};

export type VTracerPresetDefaults = {
  mode: VectorizeTraceMode;
  hierarchical: VectorizeComposition;
  clustering: VectorizeClustering;
  filterSpeckle: number;
  layerDifference: number;
  binaryThreshold: number;
  colorPrecision: number;
  cornerThreshold: number;
  lengthThreshold: number;
  maxIterations: number;
  spliceThreshold: number;
  simplify: number | null;
  pathPrecision: number;
  maxColors: number | null;
  optimize: 0 | 1 | 2;
};

/**
 * Recipes based on VTracer's upstream presets and documented examples.
 * `highFidelity` is the ArtShift label for the official poster recipe.
 */
export const VTRACER_PRESET_DEFAULTS: Record<
  Exclude<VectorizePreset, "custom">,
  VTracerPresetDefaults
> = {
  highFidelity: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 8,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: 8,
    optimize: 1,
  },
  photoDetailed: {
    mode: "spline",
    hierarchical: "stacked",
    clustering: "color-cluster",
    filterSpeckle: 10,
    layerDifference: 48,
    binaryThreshold: 128,
    colorPrecision: 8,
    cornerThreshold: 180,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: null,
    optimize: 1,
  },
  illustration: {
    mode: "spline",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 8,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: 12,
    optimize: 1,
  },
  clipart: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 8,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: 8,
    optimize: 1,
  },
  lineArt: {
    mode: "spline",
    hierarchical: "stacked",
    clustering: "bw",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 6,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: null,
    optimize: 1,
  },
  silhouette: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "bw",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 6,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: null,
    optimize: 1,
  },
  posterize: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
    colorPrecision: 8,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
    simplify: null,
    pathPrecision: 2,
    maxColors: 6,
    optimize: 1,
  },
};

const VTRACER_GENERIC_DEFAULTS: VTracerPresetDefaults = {
  mode: "spline",
  hierarchical: "stacked",
  clustering: "color-cluster",
  filterSpeckle: 4,
  layerDifference: 16,
  binaryThreshold: 128,
  colorPrecision: 6,
  cornerThreshold: 60,
  lengthThreshold: 4,
  maxIterations: 10,
  spliceThreshold: 45,
  simplify: null,
  pathPrecision: 2,
  maxColors: null,
  optimize: 1,
};

export const DEFAULT_VECTORIZE_BACKEND: VectorizeBackend = "vtracer-wasm";

export const VECTORIZE_BACKEND_OPTIONS: readonly {
  value: VectorizeBackend;
  label: string;
  description: string;
}[] = [
  {
    value: "vtracer-wasm",
    label: "VTracer WASM",
    description: "Rust/WASM trace — native geometry, color clustering และ seam-free controls",
  },
];

export function isVectorizeBackend(value: unknown): value is VectorizeBackend {
  return value === "vtracer-wasm";
}

export function getVectorizeBackendLabel(backend: VectorizeBackend): string {
  return (
    VECTORIZE_BACKEND_OPTIONS.find((option) => option.value === backend)?.label ?? "VTracer WASM"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function vtracerPresetFor(
  preset: VectorizePreset | undefined,
  monochrome: boolean,
): VTracerOptions["preset"] {
  if (monochrome || preset === "lineArt" || preset === "silhouette") return "bw";
  if (preset === "photoDetailed") return "photo";
  if (
    preset === "highFidelity" ||
    preset === "illustration" ||
    preset === "clipart" ||
    preset === "posterize"
  ) {
    return "poster";
  }
  return undefined;
}

export function getVTracerPresetDefaults(
  preset: VectorizePreset | undefined,
  monochrome = false,
): VTracerPresetDefaults {
  if (monochrome || preset === "lineArt" || preset === "silhouette") {
    return VTRACER_PRESET_DEFAULTS.lineArt;
  }
  if (preset && preset !== "custom") return VTRACER_PRESET_DEFAULTS[preset];
  return VTRACER_GENERIC_DEFAULTS;
}

function hasArtShiftOverrides(options: VectorizeOptions): boolean {
  return [
    options.mode,
    options.colors,
    options.detailLevel,
    options.smoothing,
    options.cornerSharpness,
    options.minArea,
    options.blackThreshold,
  ].some((value) => value !== undefined);
}

/** Translate ArtShift settings to the official VTracer configuration. */
export function mapArtShiftOptionsToVTracer(options: VectorizeOptions): VTracerOptions {
  const presetDefaults =
    options.preset && options.preset !== "custom"
      ? VECTORIZE_PRESET_CONFIGS[options.preset]
      : undefined;
  const sourceMode = options.mode ?? presetDefaults?.mode;
  const monochrome =
    sourceMode === "monochrome" || options.preset === "lineArt" || options.preset === "silhouette";
  const nativePreset = vtracerPresetFor(options.preset, monochrome);
  const nativeDefaults = getVTracerPresetDefaults(options.preset, monochrome);
  const controls = options.vtracer;
  const usePresetDefaults =
    nativePreset !== undefined &&
    options.preset !== "custom" &&
    (controls?.usePresetDefaults ?? !hasArtShiftOverrides(options));
  const detailLevel = clamp(options.detailLevel ?? presetDefaults?.detailLevel ?? 4, 1, 5);
  const colors = Math.round(clamp(options.colors ?? presetDefaults?.colors ?? 24, 2, 64));
  const smoothing = clamp(options.smoothing ?? presetDefaults?.smoothing ?? 0.25, 0.05, 1.5);
  const cornerSharpness = clamp(
    options.cornerSharpness ?? presetDefaults?.cornerSharpness ?? 0.65,
    0,
    1,
  );
  const blackThreshold = clamp(
    options.blackThreshold ?? presetDefaults?.blackThreshold ?? 128,
    0,
    255,
  );
  const simplifyOverride =
    controls && Object.hasOwn(controls, "simplify") ? controls.simplify : undefined;
  const simplify =
    simplifyOverride === null
      ? undefined
      : simplifyOverride !== undefined
        ? Number(clamp(simplifyOverride, 0.1, 2.5).toFixed(2))
        : usePresetDefaults
          ? (nativeDefaults.simplify ?? undefined)
          : undefined;
  const maxColorsOverride =
    controls && Object.hasOwn(controls, "maxColors") ? controls.maxColors : undefined;
  const maxColorsValue = monochrome
    ? undefined
    : maxColorsOverride === null
      ? undefined
      : (maxColorsOverride ??
        (usePresetDefaults ? (nativeDefaults.maxColors ?? undefined) : colors));

  return {
    preset: nativePreset,
    clustering: controls?.clustering ?? nativeDefaults.clustering,
    hierarchical: controls?.hierarchical ?? nativeDefaults.hierarchical,
    mode: controls?.mode ?? nativeDefaults.mode,
    filterSpeckle: Math.round(
      clamp(controls?.filterSpeckle ?? nativeDefaults.filterSpeckle, 1, 32),
    ),
    colorPrecision: usePresetDefaults
      ? nativeDefaults.colorPrecision
      : Math.round(clamp(4 + detailLevel, 1, 8)),
    layerDifference: Math.round(
      clamp(controls?.layerDifference ?? nativeDefaults.layerDifference, 0, 255),
    ),
    cornerThreshold: usePresetDefaults
      ? nativeDefaults.cornerThreshold
      : Math.round(20 + (1 - cornerSharpness) * 100),
    lengthThreshold: usePresetDefaults
      ? nativeDefaults.lengthThreshold
      : Number(Math.max(3.5, 7 - detailLevel * 0.75).toFixed(2)),
    maxIterations: usePresetDefaults ? nativeDefaults.maxIterations : 10,
    spliceThreshold: usePresetDefaults
      ? nativeDefaults.spliceThreshold
      : Math.round(30 + (1 - smoothing) * 30),
    simplify,
    pathPrecision: nativeDefaults.pathPrecision,
    maxColors: maxColorsValue === undefined ? undefined : Math.round(clamp(maxColorsValue, 2, 64)),
    optimize: usePresetDefaults ? nativeDefaults.optimize : 2,
    binaryThreshold: monochrome
      ? Math.round(
          clamp(
            controls?.binaryThreshold ??
              (usePresetDefaults ? nativeDefaults.binaryThreshold : blackThreshold),
            0,
            255,
          ),
        )
      : undefined,
  };
}
