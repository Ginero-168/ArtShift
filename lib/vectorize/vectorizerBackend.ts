import {
  VECTORIZE_PRESET_CONFIGS,
  type VectorizeClustering,
  type VectorizeComposition,
  type VectorizeOptions,
  type VectorizePreset,
  type VectorizeTraceMode,
} from "./vectorizer-core";

export type VectorizeBackend = "custom" | "vtracer-wasm";

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
};

/** Quality-oriented native defaults for each ArtShift preset. */
export const VTRACER_PRESET_DEFAULTS: Record<
  Exclude<VectorizePreset, "custom">,
  VTracerPresetDefaults
> = {
  highFidelity: {
    mode: "spline",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 2,
    layerDifference: 16,
    binaryThreshold: 128,
  },
  photoDetailed: {
    mode: "spline",
    hierarchical: "stacked",
    clustering: "color-cluster",
    filterSpeckle: 10,
    layerDifference: 48,
    binaryThreshold: 128,
  },
  illustration: {
    mode: "spline",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 3,
    layerDifference: 16,
    binaryThreshold: 128,
  },
  clipart: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
  },
  lineArt: {
    mode: "spline",
    hierarchical: "stacked",
    clustering: "bw",
    filterSpeckle: 2,
    layerDifference: 16,
    binaryThreshold: 140,
  },
  silhouette: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "bw",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
  },
  posterize: {
    mode: "polygon",
    hierarchical: "cutout",
    clustering: "color-cluster",
    filterSpeckle: 4,
    layerDifference: 16,
    binaryThreshold: 128,
  },
};

const VTRACER_GENERIC_DEFAULTS: VTracerPresetDefaults = {
  mode: "spline",
  hierarchical: "cutout",
  clustering: "color-cluster",
  filterSpeckle: 4,
  layerDifference: 16,
  binaryThreshold: 128,
};

export const DEFAULT_VECTORIZE_BACKEND: VectorizeBackend = "custom";

export const VECTORIZE_BACKEND_OPTIONS: readonly {
  value: VectorizeBackend;
  label: string;
  description: string;
}[] = [
  {
    value: "custom",
    label: "ArtShift Custom",
    description: "ตัวเดิมของ ArtShift — editable paths โดยตรง",
  },
  {
    value: "vtracer-wasm",
    label: "VTracer WASM",
    description: "Rust/WASM trace — native geometry, color clustering และ seam-free controls",
  },
];

export function isVectorizeBackend(value: unknown): value is VectorizeBackend {
  return value === "custom" || value === "vtracer-wasm";
}

/** Keep the user's tracing settings while switching a failed VTracer job to Custom. */
export function getVectorizeFallbackOptions(
  options?: VectorizeOptions,
): VectorizeOptions | undefined {
  if (options?.backend !== "vtracer-wasm") return options;
  return { ...options, backend: "custom" };
}

export function getVectorizeBackendLabel(backend: VectorizeBackend): string {
  return (
    VECTORIZE_BACKEND_OPTIONS.find((option) => option.value === backend)?.label ?? "ArtShift Custom"
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

/** Translate ArtShift's stable UI settings to VTracer's native configuration. */
export function mapArtShiftOptionsToVTracer(options: VectorizeOptions): VTracerOptions {
  const presetDefaults =
    options.preset && options.preset !== "custom"
      ? VECTORIZE_PRESET_CONFIGS[options.preset]
      : undefined;
  const sourceMode = options.mode ?? presetDefaults?.mode;
  const monochrome =
    sourceMode === "monochrome" || options.preset === "lineArt" || options.preset === "silhouette";
  const nativeDefaults = getVTracerPresetDefaults(options.preset, monochrome);
  const controls = options.vtracer;
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
  const simplify =
    controls?.simplify === null || controls?.simplify === undefined
      ? undefined
      : Number(clamp(controls.simplify, 0.1, 2.5).toFixed(2));

  return {
    preset: vtracerPresetFor(options.preset, monochrome),
    clustering: controls?.clustering ?? nativeDefaults.clustering,
    hierarchical: controls?.hierarchical ?? nativeDefaults.hierarchical,
    mode: controls?.mode ?? nativeDefaults.mode,
    filterSpeckle: Math.round(
      clamp(controls?.filterSpeckle ?? nativeDefaults.filterSpeckle, 1, 32),
    ),
    colorPrecision: Math.round(clamp(4 + detailLevel, 1, 8)),
    layerDifference: Math.round(
      clamp(controls?.layerDifference ?? nativeDefaults.layerDifference, 0, 255),
    ),
    cornerThreshold: Math.round(
      options.cornerSharpness === undefined &&
        vtracerPresetFor(options.preset, monochrome) === "photo"
        ? 180
        : 20 + (1 - cornerSharpness) * 100,
    ),
    lengthThreshold: Number((7 - detailLevel * 0.75).toFixed(2)),
    maxIterations: 10,
    spliceThreshold: Math.round(30 + (1 - smoothing) * 30),
    simplify,
    pathPrecision: 2,
    maxColors: monochrome ? undefined : colors,
    optimize: 2,
    binaryThreshold: monochrome
      ? Math.round(clamp(controls?.binaryThreshold ?? blackThreshold, 0, 255))
      : undefined,
  };
}
