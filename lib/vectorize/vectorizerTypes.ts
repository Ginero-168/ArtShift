import type { VectorPathElement } from "../engine/types";

export type VectorizeTraceMode = "pixel" | "polygon" | "spline";
export type VectorizeComposition = "stacked" | "cutout";
export type VectorizeClustering = "color-cluster" | "bw" | "watershed";

export interface VTracerControls {
  /** Keep the selected VTracer preset's complete native defaults. */
  usePresetDefaults?: boolean;
  /** Native contour fitting mode. */
  mode?: VectorizeTraceMode;
  /** Native compositing strategy. Cutout prevents gaps between adjacent regions. */
  hierarchical?: VectorizeComposition;
  /** Native region segmentation strategy. */
  clustering?: VectorizeClustering;
  /** Native color separation threshold; lower values retain more color regions. */
  layerDifference?: number;
  /** Native speckle side length, not an area. */
  filterSpeckle?: number;
  /** Native binary luminance threshold for B&W clustering. */
  binaryThreshold?: number;
  /** Native palette cap; null keeps the palette uncapped. */
  maxColors?: number | null;
  /** Extra curve simplification tolerance; null disables the extra pass. */
  simplify?: number | null;
}

export type VectorizePreset =
  | "highFidelity"
  | "photoDetailed"
  | "illustration"
  | "clipart"
  | "lineArt"
  | "silhouette"
  | "posterize"
  | "custom";

export interface VectorizeOptions {
  /** The only supported raster-to-vector implementation. */
  backend?: "vtracer-wasm";
  preset?: VectorizePreset;
  mode?: "color" | "monochrome" | "posterize";
  colors?: number;
  detailLevel?: 1 | 2 | 3 | 4 | 5;
  smoothing?: number;
  cornerSharpness?: number;
  minArea?: number;
  blackThreshold?: number;
  /** Native VTracer controls. */
  vtracer?: VTracerControls;
}

export interface VectorizeResult {
  backend?: "vtracer-wasm";
  elements: VectorPathElement[];
  svgString: string;
  palette: string[];
  totalNodes: number;
  width: number;
  height: number;
}

export type VectorizeProgressStage = "loading" | "quantizing" | "tracing" | "building";

export interface VectorizeProgress {
  progress: number;
  stage: VectorizeProgressStage;
}

export interface VectorizeCallbacks {
  onProgress?: (update: VectorizeProgress) => void;
  signal?: AbortSignal;
}

export const VECTORIZE_LIMITS = {
  maxDimension: 1200,
  maxElements: 512,
  maxTotalNodes: 50_000,
  maxContourPoints: 30_000,
} as const;

export class VectorizeComplexityError extends Error {
  constructor(message = "Image is too detailed to vectorize safely.") {
    super(message);
    this.name = "VectorizeComplexityError";
  }
}

export class VectorizeCancelledError extends Error {
  constructor() {
    super("Vectorization cancelled.");
    this.name = "AbortError";
  }
}

const VECTORIZE_PRESET_CONFIGS = {
  highFidelity: {
    mode: "color",
    colors: 24,
    detailLevel: 4,
    smoothing: 0.25,
    cornerSharpness: 0.65,
    minArea: 4,
    blackThreshold: 128,
  },
  photoDetailed: {
    mode: "color",
    colors: 36,
    detailLevel: 5,
    smoothing: 0.2,
    cornerSharpness: 0.5,
    minArea: 2,
    blackThreshold: 128,
  },
  illustration: {
    mode: "color",
    colors: 12,
    detailLevel: 3,
    smoothing: 0.4,
    cornerSharpness: 0.7,
    minArea: 10,
    blackThreshold: 128,
  },
  clipart: {
    mode: "color",
    colors: 8,
    detailLevel: 2,
    smoothing: 0.55,
    cornerSharpness: 0.8,
    minArea: 20,
    blackThreshold: 128,
  },
  lineArt: {
    mode: "monochrome",
    colors: 2,
    detailLevel: 4,
    smoothing: 0.2,
    cornerSharpness: 0.85,
    minArea: 3,
    blackThreshold: 140,
  },
  silhouette: {
    mode: "monochrome",
    colors: 2,
    detailLevel: 3,
    smoothing: 0.45,
    cornerSharpness: 0.75,
    minArea: 16,
    blackThreshold: 128,
  },
  posterize: {
    mode: "posterize",
    colors: 6,
    detailLevel: 3,
    smoothing: 0.5,
    cornerSharpness: 0.6,
    minArea: 15,
    blackThreshold: 128,
  },
} as const satisfies Record<
  Exclude<VectorizePreset, "custom">,
  {
    mode: "color" | "monochrome" | "posterize";
    colors: number;
    detailLevel: 1 | 2 | 3 | 4 | 5;
    smoothing: number;
    cornerSharpness: number;
    minArea: number;
    blackThreshold: number;
  }
>;

export { VECTORIZE_PRESET_CONFIGS };

export function getVectorizeMaxDimension(options?: VectorizeOptions): number {
  const detailLevel = options?.detailLevel ?? VECTORIZE_PRESET_CONFIGS.highFidelity.detailLevel;
  const maxDimensions = [450, 650, 900, 1200, 1600];
  return Math.min(maxDimensions[detailLevel - 1] ?? 1000, VECTORIZE_LIMITS.maxDimension);
}
