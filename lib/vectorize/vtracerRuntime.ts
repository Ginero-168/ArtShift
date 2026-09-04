import {
  markModelFailed,
  markModelLoaded,
  markModelLoading,
  markModelProgress,
} from "@/lib/ai/modelRegistry";
import {
  VECTORIZE_LIMITS,
  type VectorizeCallbacks,
  VectorizeComplexityError,
  type VectorizeOptions,
  type VectorizeResult,
} from "./vectorizer-core";
import { mapArtShiftOptionsToVTracer, type VTracerOptions } from "./vectorizerBackend";
import { parseVTracerSvgResult, VTRACER_SVG_LIMITS } from "./vtracerAdapter";

export const VTRACER_WASM_JS_URL = "/wasm/vtracer/vtracer_browser.js";
export const VTRACER_WASM_BINARY_URL = "/wasm/vtracer/vtracer_browser_bg.wasm";

/** VTracer alpha.4 cannot trace an image with no visible pixels. */
export function hasVisibleAlpha(pixels: ArrayLike<number>): boolean {
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) > 0) return true;
  }
  return false;
}

export function assertVTracerRasterWithinLimits(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("VTracer image dimensions must be positive integers.");
  }
  const expectedLength = width * height * 4;
  if (pixels.length !== expectedLength) {
    throw new Error(`VTracer RGBA length ${pixels.length} does not equal ${expectedLength}.`);
  }
  if (
    width > VECTORIZE_LIMITS.maxDimension ||
    height > VECTORIZE_LIMITS.maxDimension ||
    width * height > VECTORIZE_LIMITS.maxDimension ** 2
  ) {
    throw new VectorizeComplexityError("VTracer image exceeds the safe pixel dimensions.");
  }
}

export function assertVTracerSvgWithinLimits(svg: string): void {
  if (svg.length > VTRACER_SVG_LIMITS.maxSvgChars) {
    throw new VectorizeComplexityError("VTracer SVG output exceeds the safe size limit.");
  }
}

type VTracerWasmModule = {
  default: (input?: string | URL | Response | WebAssembly.Module) => Promise<unknown>;
  vectorize_rgba: (
    pixels: Uint8Array,
    width: number,
    height: number,
    options: VTracerOptions,
  ) => string;
};

let runtimePromise: Promise<VTracerWasmModule> | null = null;

/** Load the bundled browser WASM once per tab/Worker. */
export async function loadVTracerWasm(): Promise<VTracerWasmModule> {
  if (runtimePromise) return runtimePromise;

  markModelLoading("vtracer-wasm");
  runtimePromise = (async () => {
    // This is intentionally a runtime URL: Next must not try to SSR or bundle
    // the generated wasm-bindgen web module as a server dependency.
    const module = (await import(
      /* webpackIgnore: true */ VTRACER_WASM_JS_URL
    )) as unknown as VTracerWasmModule;
    await module.default(VTRACER_WASM_BINARY_URL);
    markModelProgress("vtracer-wasm", 1);
    markModelLoaded("vtracer-wasm");
    return module;
  })().catch((error) => {
    runtimePromise = null;
    markModelFailed("vtracer-wasm", error);
    throw error;
  });

  return runtimePromise;
}

export async function vectorizeRgbaWithVTracer(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetBounds: { x: number; y: number; width: number; height: number },
  options: VectorizeOptions = {},
  callbacks: VectorizeCallbacks = {},
): Promise<VectorizeResult> {
  if (callbacks.signal?.aborted) throw createAbortError();
  assertVTracerRasterWithinLimits(pixels, width, height);
  callbacks.onProgress?.({ progress: 0.02, stage: "loading" });
  if (!hasVisibleAlpha(pixels)) {
    callbacks.onProgress?.({ progress: 1, stage: "building" });
    return {
      elements: [],
      svgString: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`,
      palette: [],
      totalNodes: 0,
      width: targetBounds.width,
      height: targetBounds.height,
    };
  }
  const runtime = await loadVTracerWasm();
  if (callbacks.signal?.aborted) throw createAbortError();

  callbacks.onProgress?.({ progress: 0.16, stage: "quantizing" });
  const vtracerOptions = mapArtShiftOptionsToVTracer(options);
  const svg = runtime.vectorize_rgba(new Uint8Array(pixels), width, height, vtracerOptions);
  if (callbacks.signal?.aborted) throw createAbortError();
  assertVTracerSvgWithinLimits(svg);
  callbacks.onProgress?.({ progress: 0.9, stage: "building" });

  const result = parseVTracerSvgResult(svg, {
    targetBounds,
    sourceWidth: width,
    sourceHeight: height,
  });
  callbacks.onProgress?.({ progress: 1, stage: "building" });
  return result;
}

function createAbortError(): Error {
  return Object.assign(new Error("Vectorization cancelled."), { name: "AbortError" });
}
