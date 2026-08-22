/**
 * In-Browser Ultra-High-Fidelity Vectorizer Engine (Image-to-Vector / Auto-Trace).
 * 100% Client-Side, Free, and Fast.
 * Converts raster images into high-precision, multi-layered Bézier Vector Path Elements.
 */

import type { VectorPathElement, VectorPathNode } from "../engine/types";
import { recomputeVectorPathBounds } from "../engine/vectorPath";

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
  preset?: VectorizePreset;
  mode?: "color" | "monochrome" | "posterize";
  colors?: number; // 2..64 colors
  detailLevel?: 1 | 2 | 3 | 4 | 5; // 1 = Fast (400px), 3 = High (800px), 5 = Ultra (1400px)
  smoothing?: number; // Curve smoothing tolerance (0.05..1.5)
  cornerSharpness?: number; // 0 (all smooth) to 1 (preserve sharp angles)
  minArea?: number; // Minimum speckle area in pixels (1..60)
  blackThreshold?: number; // Luminance threshold for monochrome (0..255)
}

export interface VectorizeResult {
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

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new VectorizeCancelledError();
}

export function getVectorizeMaxDimension(options?: VectorizeOptions): number {
  const detailLevel = options?.detailLevel ?? VECTORIZE_PRESET_CONFIGS.highFidelity.detailLevel;
  const maxDimensions = [450, 650, 900, 1200, 1600];
  return Math.min(maxDimensions[detailLevel - 1] ?? 1000, VECTORIZE_LIMITS.maxDimension);
}

export const VECTORIZE_PRESET_CONFIGS: Record<
  Exclude<VectorizePreset, "custom">,
  Required<Omit<VectorizeOptions, "preset">>
> = {
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
};

/**
 * Calculates weighted perceptual color distance (approximation of Human Eye CIE Delta-E).
 * Weights: Red (2), Green (4), Blue (3) with mean red compensation.
 */
function perceptualColorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return ((512 + rMean) * dr * dr) / 256 + 4 * dg * dg + ((767 - rMean) * db * db) / 256;
}

/**
 * High-Precision Color Quantization using Weighted Adaptive K-Means++.
 */
function quantizeColors(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  numColors: number,
  sampleDensity: number,
  signal?: AbortSignal,
): { palette: [number, number, number][]; map: Uint8Array } {
  const pixelCount = width * height;
  const map = new Uint8Array(pixelCount);

  // Collect non-transparent sample pixels
  const samples: [number, number, number][] = [];
  const targetSamples = Math.min(pixelCount, Math.max(3000, sampleDensity * 3000));
  const step = Math.max(1, Math.floor(pixelCount / targetSamples));

  for (let i = 0; i < pixelCount; i += step) {
    if ((i & 0x3fff) === 0) assertNotCancelled(signal);
    const idx = i * 4;
    const a = pixels[idx + 3];
    if (a > 64) {
      samples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  if (samples.length === 0) {
    return { palette: [[0, 0, 0]], map };
  }

  const k = Math.min(numColors, samples.length);
  const centroids: [number, number, number][] = [];

  // K-Means++ seeding with perceptual distance
  centroids.push(samples[Math.floor(Math.random() * samples.length)]);

  while (centroids.length < k) {
    let maxDist = -1;
    let bestSample = samples[0];

    for (const s of samples) {
      let minDist = Number.POSITIVE_INFINITY;
      for (const c of centroids) {
        const d = perceptualColorDistSq(s[0], s[1], s[2], c[0], c[1], c[2]);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDist) {
        maxDist = minDist;
        bestSample = s;
      }
    }
    assertNotCancelled(signal);
    centroids.push(bestSample);
  }

  // Run K-Means iterations (up to 8 for deep color convergence)
  const maxIterations = 8;
  for (let iter = 0; iter < maxIterations; iter++) {
    const clusterSums: [number, number, number][] = centroids.map(() => [0, 0, 0]);
    const clusterCounts = new Array(k).fill(0);

    for (const s of samples) {
      let minDist = Number.POSITIVE_INFINITY;
      let clusterIdx = 0;
      for (let c = 0; c < k; c++) {
        const cent = centroids[c];
        const dist = perceptualColorDistSq(s[0], s[1], s[2], cent[0], cent[1], cent[2]);
        if (dist < minDist) {
          minDist = dist;
          clusterIdx = c;
        }
      }
      clusterSums[clusterIdx][0] += s[0];
      clusterSums[clusterIdx][1] += s[1];
      clusterSums[clusterIdx][2] += s[2];
      clusterCounts[clusterIdx]++;
    }
    assertNotCancelled(signal);

    for (let c = 0; c < k; c++) {
      if (clusterCounts[c] > 0) {
        centroids[c] = [
          Math.round(clusterSums[c][0] / clusterCounts[c]),
          Math.round(clusterSums[c][1] / clusterCounts[c]),
          Math.round(clusterSums[c][2] / clusterCounts[c]),
        ];
      }
    }
  }

  // Assign pixels to closest centroids
  for (let i = 0; i < pixelCount; i++) {
    if ((i & 0x3fff) === 0) assertNotCancelled(signal);
    const idx = i * 4;
    const a = pixels[idx + 3];
    if (a <= 64) {
      map[i] = 255;
      continue;
    }

    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];

    let minDist = Number.POSITIVE_INFINITY;
    let bestC = 0;
    for (let c = 0; c < k; c++) {
      const cent = centroids[c];
      const dist = perceptualColorDistSq(r, g, b, cent[0], cent[1], cent[2]);
      if (dist < minDist) {
        minDist = dist;
        bestC = c;
      }
    }
    map[i] = bestC;
  }

  // Sort palette from darkest to lightest luminance
  const indexedPalette = centroids.map((c, i) => ({
    color: c,
    origIndex: i,
    lum: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2],
  }));
  indexedPalette.sort((a, b) => a.lum - b.lum);

  const finalPalette = indexedPalette.map((p) => p.color);
  const remap = new Uint8Array(256);
  indexedPalette.forEach((p, newIdx) => {
    remap[p.origIndex] = newIdx;
  });
  remap[255] = 255;

  for (let i = 0; i < pixelCount; i++) {
    if ((i & 0x3fff) === 0) assertNotCancelled(signal);
    map[i] = remap[map[i]];
  }

  return { palette: finalPalette, map };
}

/**
 * Traces continuous contour boundaries around binary pixel islands.
 */
function traceContours(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea = 4,
  signal?: AbortSignal,
): Array<Array<[number, number]>> {
  const visited = new Uint8Array(width * height);
  const contours: Array<Array<[number, number]>> = [];

  const getPixel = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return binary[y * width + x];
  };

  const DIRS: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) assertNotCancelled(signal);
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && !visited[idx]) {
        const boundary: Array<[number, number]> = [];
        let cx = x;
        let cy = y;
        let dir = 0;

        const startX = x;
        const startY = y;
        let steps = 0;
        const maxSteps = VECTORIZE_LIMITS.maxContourPoints;

        do {
          boundary.push([cx, cy]);
          visited[cy * width + cx] = 1;

          let foundNext = false;
          for (let d = 0; d < 8; d++) {
            const checkDir = (dir + d) % 8;
            const nx = cx + DIRS[checkDir][0];
            const ny = cy + DIRS[checkDir][1];

            if (getPixel(nx, ny) === 1) {
              cx = nx;
              cy = ny;
              dir = (checkDir + 5) % 8;
              foundNext = true;
              break;
            }
          }

          if (!foundNext) break;
          steps++;
          if (steps >= maxSteps) {
            throw new VectorizeComplexityError(
              "A contour exceeded the safe complexity limit. Try a lower Detail level or a larger Min Area.",
            );
          }
        } while ((cx !== startX || cy !== startY) && steps < maxSteps);

        if (boundary.length >= 3) {
          // Polygon Area (Shoelace formula)
          let area = 0;
          for (let i = 0; i < boundary.length; i++) {
            const j = (i + 1) % boundary.length;
            area += boundary[i][0] * boundary[j][1];
            area -= boundary[j][0] * boundary[i][1];
          }
          area = Math.abs(area) / 2;

          if (area >= minArea) {
            contours.push(boundary);
            if (contours.length >= VECTORIZE_LIMITS.maxElements) {
              throw new VectorizeComplexityError(
                "The image contains too many vector regions. Try fewer Colors or a larger Min Area.",
              );
            }
          }
        }
      }
    }
  }

  return contours;
}

/**
 * Enhanced Ramer-Douglas-Peucker Polyline Simplification.
 */
function simplifyPolygon(
  points: Array<[number, number]>,
  tolerance: number,
): Array<[number, number]> {
  if (points.length <= 4) return points;

  const sqTolerance = tolerance * tolerance;

  function getSqSegDist(p: [number, number], p1: [number, number], p2: [number, number]) {
    let x = p1[0];
    let y = p1[1];
    let dx = p2[0] - x;
    let dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2[0];
        y = p2[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function simplifyDPStep(
    pts: Array<[number, number]>,
    first: number,
    last: number,
    sqTol: number,
    simplified: Array<[number, number]>,
  ) {
    let maxSqDist = sqTol;
    let index = 0;

    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > sqTol) {
      if (index - first > 1) simplifyDPStep(pts, first, index, sqTol, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyDPStep(pts, index, last, sqTol, simplified);
    }
  }

  const simplified: Array<[number, number]> = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);

  return simplified;
}

/**
 * Corner-Preserving Bézier Spline Fitting.
 * Preserves sharp corners when angle is sharp, and applies smooth cubic Bézier tangent handles otherwise.
 */
function fitCornerPreservingBezierNodes(
  polygon: Array<[number, number]>,
  width: number,
  height: number,
  smoothing = 0.35,
  cornerSharpness = 0.6,
): VectorPathNode[] {
  if (polygon.length < 3) {
    return polygon.map(([px, py]) => ({
      x: px / width,
      y: py / height,
    }));
  }

  const n = polygon.length;
  const nodes: VectorPathNode[] = [];
  // Corner angle threshold: 0 -> 180 deg (all smooth), 1 -> 65 deg (preserve sharp corners)
  const cornerThresholdCos = Math.cos((180 - cornerSharpness * 115) * (Math.PI / 180));

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    // Vectors to adjacent vertices
    const vInX = curr[0] - prev[0];
    const vInY = curr[1] - prev[1];
    const vOutX = next[0] - curr[0];
    const vOutY = next[1] - curr[1];

    const lenIn = Math.hypot(vInX, vInY) || 1;
    const lenOut = Math.hypot(vOutX, vOutY) || 1;

    // Angle cosine between incoming and outgoing edges
    const dot = (vInX * vOutX + vInY * vOutY) / (lenIn * lenOut);
    const isSharpCorner = cornerSharpness > 0.05 && dot < cornerThresholdCos;

    if (isSharpCorner) {
      // Sharp anchor point: no Bézier overshoot handles
      nodes.push({
        x: curr[0] / width,
        y: curr[1] / height,
      });
    } else {
      // Smooth organic curve tangent
      const vx = next[0] - prev[0];
      const vy = next[1] - prev[1];
      const totalLen = Math.hypot(vx, vy) || 1;

      const handleScale = smoothing * 0.28;
      const outDx = (vx / totalLen) * lenOut * handleScale;
      const outDy = (vy / totalLen) * lenOut * handleScale;

      const inDx = (-vx / totalLen) * lenIn * handleScale;
      const inDy = (-vy / totalLen) * lenIn * handleScale;

      nodes.push({
        x: curr[0] / width,
        y: curr[1] / height,
        in: [inDx / width, inDy / height],
        out: [outDx / width, outDy / height],
      });
    }
  }

  return nodes;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function getVectorizeConfig(options?: VectorizeOptions) {
  const presetKey = options?.preset && options.preset !== "custom" ? options.preset : undefined;
  const defaults = presetKey
    ? VECTORIZE_PRESET_CONFIGS[presetKey]
    : VECTORIZE_PRESET_CONFIGS.highFidelity;

  return {
    mode: options?.mode ?? defaults.mode,
    numColors: options?.mode === "monochrome" ? 2 : (options?.colors ?? defaults.colors),
    detailLevel: options?.detailLevel ?? defaults.detailLevel,
    smoothing: options?.smoothing ?? defaults.smoothing,
    cornerSharpness: options?.cornerSharpness ?? defaults.cornerSharpness,
    minArea: options?.minArea ?? defaults.minArea,
    blackThreshold: options?.blackThreshold ?? defaults.blackThreshold,
  };
}
/** Converts already-decoded pixels into bounded, editable vector paths. */
export function vectorizeImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetBounds: { x: number; y: number; width: number; height: number },
  options?: VectorizeOptions,
  callbacks: VectorizeCallbacks = {},
): VectorizeResult {
  const { mode, numColors, detailLevel, smoothing, cornerSharpness, minArea, blackThreshold } =
    getVectorizeConfig(options);
  const report = (progress: number, stage: VectorizeProgressStage) =>
    callbacks.onProgress?.({ progress, stage });

  assertNotCancelled(callbacks.signal);
  if (Math.max(width, height) > VECTORIZE_LIMITS.maxDimension) {
    throw new VectorizeComplexityError(
      `Image resolution is capped at ${VECTORIZE_LIMITS.maxDimension}px for safe vectorization.`,
    );
  }

  report(0.08, "quantizing");
  const { palette, map } = quantizeColors(
    pixels,
    width,
    height,
    numColors,
    detailLevel,
    callbacks.signal,
  );
  const elements: VectorPathElement[] = [];
  const paletteHexList = palette.map((c) => rgbToHex(c[0], c[1], c[2]));
  let totalNodes = 0;

  // Trace each color cluster layer.
  for (let c = 0; c < palette.length; c++) {
    assertNotCancelled(callbacks.signal);
    report(0.2 + (c / Math.max(1, palette.length)) * 0.58, "tracing");
    const colorHex = paletteHexList[c];
    const lum = 0.2126 * palette[c][0] + 0.7152 * palette[c][1] + 0.0722 * palette[c][2];

    if (mode === "monochrome" && lum > blackThreshold) continue;

    const binaryMask = new Uint8Array(width * height);
    let pixelCount = 0;
    for (let i = 0; i < width * height; i++) {
      if ((i & 0x3fff) === 0) assertNotCancelled(callbacks.signal);
      if (map[i] === c) {
        binaryMask[i] = 1;
        pixelCount++;
      }
    }

    if (pixelCount < minArea) continue;

    const rawContours = traceContours(binaryMask, width, height, minArea, callbacks.signal);
    for (const contour of rawContours) {
      assertNotCancelled(callbacks.signal);
      const tolerance = Math.max(0.4, smoothing * (2.0 - detailLevel * 0.2));
      const simplified = simplifyPolygon(contour, tolerance);
      if (simplified.length < 3) continue;

      const nodes = fitCornerPreservingBezierNodes(
        simplified,
        width,
        height,
        smoothing,
        cornerSharpness,
      );
      if (totalNodes + nodes.length > VECTORIZE_LIMITS.maxTotalNodes) {
        throw new VectorizeComplexityError(
          "The vector result contains too many anchor nodes. Try a lower Detail level or a larger Min Area.",
        );
      }
      totalNodes += nodes.length;

      const pathEl: VectorPathElement = {
        id: crypto.randomUUID(),
        type: "path",
        x: targetBounds.x,
        y: targetBounds.y,
        width: targetBounds.width,
        height: targetBounds.height,
        angle: 0,
        opacity: 1,
        nodes,
        closed: true,
        fillRule: "nonzero",
        backgroundColor: colorHex,
        fillStyle: "solid",
        strokeColor: "transparent",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        seed: Math.floor(Math.random() * 2 ** 31),
        groupIds: [],
        locked: false,
        z: 0,
        version: 1,
        isDeleted: false,
        visible: true,
        name: `Vector ${colorHex}`,
      };

      const bounded = recomputeVectorPathBounds(pathEl);
      bounded.x = Math.max(0, bounded.x);
      bounded.y = Math.max(0, bounded.y);
      elements.push(bounded);
    }
  }

  report(0.84, "building");
  let svgPaths = "";
  for (const el of elements) {
    assertNotCancelled(callbacks.signal);
    const localNodes = el.nodes;
    if (localNodes.length < 2) continue;

    let d = `M ${(el.x + localNodes[0].x * el.width).toFixed(2)} ${(el.y + localNodes[0].y * el.height).toFixed(2)}`;
    for (let i = 1; i < localNodes.length; i++) {
      const prev = localNodes[i - 1];
      const curr = localNodes[i];
      const p0x = el.x + prev.x * el.width;
      const p0y = el.y + prev.y * el.height;
      const p3x = el.x + curr.x * el.width;
      const p3y = el.y + curr.y * el.height;

      if (prev.out && curr.in) {
        d += ` C ${(p0x + prev.out[0] * el.width).toFixed(2)} ${(p0y + prev.out[1] * el.height).toFixed(2)} ${(p3x + curr.in[0] * el.width).toFixed(2)} ${(p3y + curr.in[1] * el.height).toFixed(2)} ${p3x.toFixed(2)} ${p3y.toFixed(2)}`;
      } else {
        d += ` L ${p3x.toFixed(2)} ${p3y.toFixed(2)}`;
      }
    }
    d += " Z";
    svgPaths += `<path d="${d}" fill="${el.backgroundColor}" />\n`;
  }

  report(1, "building");
  return {
    elements,
    svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetBounds.width} ${targetBounds.height}">\n${svgPaths}</svg>`,
    palette: paletteHexList,
    totalNodes,
    width: targetBounds.width,
    height: targetBounds.height,
  };
}
