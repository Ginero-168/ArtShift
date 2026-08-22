import {
  getVectorizeMaxDimension,
  type VectorizeOptions,
  type VectorizeProgress,
  type VectorizeResult,
  vectorizeImageData,
} from "./vectorizer-core";

type VectorizerRequest = {
  imageDataUrl: string;
  targetBounds: { x: number; y: number; width: number; height: number };
  options?: VectorizeOptions;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<VectorizerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const workerScope = self as unknown as WorkerScope;

function report(update: VectorizeProgress) {
  workerScope.postMessage({ type: "progress", update });
}

workerScope.onmessage = async (event) => {
  try {
    const { imageDataUrl, targetBounds, options } = event.data;
    report({ progress: 0.02, stage: "loading" });

    const response = await fetch(imageDataUrl);
    if (!response.ok) throw new Error(`Failed to load image (${response.status}).`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const maxDimension = getVectorizeMaxDimension(options);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(10, Math.round(bitmap.width * scale));
    const height = Math.max(10, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create worker canvas context.");

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const imageData = context.getImageData(0, 0, width, height);
    const result: VectorizeResult = vectorizeImageData(
      imageData.data,
      width,
      height,
      targetBounds,
      options,
      { onProgress: report },
    );

    workerScope.postMessage({ type: "result", result });
  } catch (error) {
    const typedError = error as Error;
    workerScope.postMessage({
      type: "error",
      name: typedError.name,
      message: typedError.message || "Vectorizer worker failed.",
    });
  }
};
