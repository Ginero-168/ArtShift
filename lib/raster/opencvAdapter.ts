import type { RasterPixelBuffer } from "./processor";

/** Dependency-injected shape for the optional OpenCV.js spike. */
export type OpenCvRuntime = {
  autoSubject(image: RasterPixelBuffer): Promise<Uint8Array>;
  heal(image: RasterPixelBuffer, repairMask: Uint8Array): Promise<RasterPixelBuffer>;
};

export type OpenCvCapabilities = {
  available: boolean;
  features: readonly ["autoSubject", "healing"];
};

export interface OpenCvAdapter {
  capabilities(): OpenCvCapabilities;
  autoSubject(image: RasterPixelBuffer): Promise<Uint8Array>;
  heal(image: RasterPixelBuffer, repairMask: Uint8Array): Promise<RasterPixelBuffer>;
}

/**
 * Keeps OpenCV.js optional until its WASM size and model behavior are proven.
 * A desktop build can inject a loaded runtime; the browser remains free of a
 * large unconditional dependency and still exposes a stable feature seam.
 */
export function createOpenCvAdapter(runtime: OpenCvRuntime | null = null): OpenCvAdapter {
  return {
    capabilities: () => ({
      available: runtime !== null,
      features: ["autoSubject", "healing"],
    }),
    autoSubject: async (image) => {
      if (!runtime) throw new Error("OpenCV.js is not loaded in this runtime.");
      return runtime.autoSubject(image);
    },
    heal: async (image, repairMask) => {
      if (!runtime) throw new Error("OpenCV.js is not loaded in this runtime.");
      return runtime.heal(image, repairMask);
    },
  };
}
