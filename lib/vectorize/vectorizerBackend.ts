import {
  VECTORIZE_PRESET_CONFIGS,
  type VectorizeOptions,
  type VectorizePreset,
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
    description: "Rust/WASM trace — color clustering, spline และ SVG optimization",
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

/** Translate ArtShift's stable UI settings to VTracer's native configuration. */
export function mapArtShiftOptionsToVTracer(options: VectorizeOptions): VTracerOptions {
  const monochrome =
    options.mode === "monochrome" ||
    options.preset === "lineArt" ||
    options.preset === "silhouette";
  const detailLevel = clamp(options.detailLevel ?? 4, 1, 5);
  const colors = Math.round(clamp(options.colors ?? 24, 2, 64));
  const smoothing = clamp(options.smoothing ?? 0.25, 0.05, 1.5);
  const cornerSharpness = clamp(options.cornerSharpness ?? 0.65, 0, 1);
  const minArea = clamp(options.minArea ?? 4, 1, 60);
  const presetDefaults =
    options.preset && options.preset !== "custom"
      ? VECTORIZE_PRESET_CONFIGS[options.preset]
      : undefined;
  const blackThreshold = clamp(
    options.blackThreshold ?? presetDefaults?.blackThreshold ?? 128,
    0,
    255,
  );

  return {
    preset: vtracerPresetFor(options.preset, monochrome),
    clustering: monochrome ? "bw" : "color-cluster",
    hierarchical: "stacked",
    mode: "spline",
    filterSpeckle: Math.max(1, Math.round(Math.sqrt(minArea))),
    colorPrecision: Math.round(clamp(4 + detailLevel, 1, 8)),
    cornerThreshold: Math.round(20 + (1 - cornerSharpness) * 100),
    lengthThreshold: Number((7 - detailLevel * 0.75).toFixed(2)),
    maxIterations: 10,
    spliceThreshold: Math.round(30 + (1 - smoothing) * 30),
    simplify: Number(clamp(0.35 + smoothing * 2, 0.5, 2.5).toFixed(2)),
    pathPrecision: 2,
    maxColors: monochrome ? undefined : colors,
    optimize: 2,
    binaryThreshold: monochrome ? blackThreshold : undefined,
  };
}
