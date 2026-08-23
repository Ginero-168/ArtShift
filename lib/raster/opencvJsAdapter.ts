import { createOpenCvAdapter, type OpenCvAdapter, type OpenCvRuntime } from "./opencvAdapter";
import type { RasterPixelBuffer } from "./processor";

type CvMat = {
  data: Uint8Array;
  rows: number;
  cols: number;
  delete: () => void;
};

type CvModule = {
  Mat: {
    new (): CvMat;
    zeros: (rows: number, cols: number, type: number) => CvMat;
  };
  Rect: new (x: number, y: number, width: number, height: number) => unknown;
  matFromImageData: (image: ImageData) => CvMat;
  matFromArray: (rows: number, cols: number, type: number, data: ArrayLike<number>) => CvMat;
  inpaint: (source: CvMat, mask: CvMat, destination: CvMat, radius: number, flags: number) => void;
  grabCut: (
    image: CvMat,
    mask: CvMat,
    rectangle: unknown,
    backgroundModel: CvMat,
    foregroundModel: CvMat,
    iterations: number,
    mode: number,
  ) => void;
  CV_8UC1: number;
  CV_64FC1: number;
  GC_BGD: number;
  GC_FGD: number;
  GC_PR_BGD: number;
  GC_PR_FGD: number;
  GC_INIT_WITH_RECT: number;
  INPAINT_TELEA: number;
};

/** Load OpenCV.js only when a user actually requests an advanced raster tool. */
export async function loadOpenCvJs(): Promise<OpenCvAdapter> {
  const module = await import("@techstark/opencv-js");
  const candidate = (module as unknown as { default?: unknown }).default ?? module;
  const cv = await waitForOpenCv(candidate);
  return createOpenCvAdapter(createRuntime(cv));
}

async function waitForOpenCv(candidate: unknown): Promise<CvModule> {
  const resolved = isPromiseLike(candidate) ? await candidate : candidate;
  if (!isCvModule(resolved)) throw new Error("OpenCV.js runtime did not expose the required APIs.");
  return resolved;
}

function createRuntime(cv: CvModule): OpenCvRuntime {
  return {
    async heal(image, repairMask) {
      const source = toMat(cv, image);
      const mask = cv.matFromArray(image.height, image.width, cv.CV_8UC1, repairMask);
      const output = new cv.Mat();
      try {
        cv.inpaint(source, mask, output, 3, cv.INPAINT_TELEA);
        return fromMat(output, image);
      } finally {
        source.delete();
        mask.delete();
        output.delete();
      }
    },
    async autoSubject(image) {
      const source = toMat(cv, image);
      const mask = cv.Mat.zeros(image.height, image.width, cv.CV_8UC1);
      const backgroundModel = cv.Mat.zeros(1, 65, cv.CV_64FC1);
      const foregroundModel = cv.Mat.zeros(1, 65, cv.CV_64FC1);
      const marginX = Math.max(1, Math.floor(image.width * 0.04));
      const marginY = Math.max(1, Math.floor(image.height * 0.04));
      try {
        cv.grabCut(
          source,
          mask,
          new cv.Rect(
            marginX,
            marginY,
            Math.max(1, image.width - marginX * 2),
            Math.max(1, image.height - marginY * 2),
          ),
          backgroundModel,
          foregroundModel,
          3,
          cv.GC_INIT_WITH_RECT,
        );
        const output = new Uint8Array(image.width * image.height);
        for (let index = 0; index < output.length; index++) {
          const value = mask.data[index];
          output[index] = value === cv.GC_FGD || value === cv.GC_PR_FGD ? 1 : 0;
        }
        return output;
      } finally {
        source.delete();
        mask.delete();
        backgroundModel.delete();
        foregroundModel.delete();
      }
    },
  };
}

function toMat(cv: CvModule, image: RasterPixelBuffer): CvMat {
  return cv.matFromImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
  );
}

function fromMat(mat: CvMat, source: RasterPixelBuffer): RasterPixelBuffer {
  return {
    width: source.width,
    height: source.height,
    data: new Uint8ClampedArray(mat.data),
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isCvModule(value: unknown): value is CvModule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CvModule>;
  return (
    typeof candidate.matFromImageData === "function" &&
    typeof candidate.matFromArray === "function" &&
    typeof candidate.inpaint === "function" &&
    typeof candidate.grabCut === "function" &&
    typeof candidate.Mat === "object" &&
    typeof candidate.Rect === "function"
  );
}
