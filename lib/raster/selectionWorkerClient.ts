import type { RasterPixelData } from "./magicWand";

type PendingJob = {
  resolve: (mask: Uint8Array) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextJobId = 1;
const pending = new Map<number, PendingJob>();

/** Run a large raster selection away from the main thread. */
export function runMagicWandWorker(
  imageData: RasterPixelData,
  seedX: number,
  seedY: number,
  tolerance: number,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Raster selection workers are unavailable."));
  }

  const selectionWorker = getWorker();
  const id = nextJobId++;
  const data = imageData.data.slice().buffer;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    selectionWorker.postMessage(
      {
        id,
        kind: "magicWand",
        width: imageData.width,
        height: imageData.height,
        data,
        seedX,
        seedY,
        tolerance,
      },
      [data],
    );
  });
}

/**
 * Sample and select an image inside the worker. This avoids the synchronous
 * HTMLImageElement -> canvas -> getImageData readback on the UI thread for
 * large Magic Wand operations. The caller retains the existing ImageData
 * fallback for browsers without ImageBitmap/OffscreenCanvas support.
 */
export function runMagicWandWorkerFromBitmap(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Raster selection workers are unavailable."));
  }

  const selectionWorker = getWorker();
  const id = nextJobId++;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      selectionWorker.postMessage(
        {
          id,
          kind: "magicWandBitmap",
          bitmap,
          width,
          height,
          seedX,
          seedY,
          tolerance,
        },
        [bitmap],
      );
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("Could not transfer image to worker."));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./selection.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; mask?: ArrayBuffer; error?: string }>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.error || !event.data.mask) {
      job.reject(new Error(event.data.error ?? "Raster selection worker returned no mask."));
      return;
    }
    job.resolve(new Uint8Array(event.data.mask));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Raster selection worker failed.");
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}
