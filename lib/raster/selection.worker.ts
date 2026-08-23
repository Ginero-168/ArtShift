import { createMagicWandMask } from "./magicWand";

type SelectionWorkerRequest = {
  id: number;
  kind: "magicWand" | "magicWandBitmap";
  width: number;
  height: number;
  data?: ArrayBuffer;
  bitmap?: ImageBitmap;
  seedX: number;
  seedY: number;
  tolerance: number;
};

type SelectionWorkerResponse = {
  id: number;
  mask?: ArrayBuffer;
  error?: string;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SelectionWorkerRequest>) => void) | null;
  postMessage: (message: SelectionWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  let bitmap: ImageBitmap | undefined;
  try {
    let pixels: Uint8ClampedArray;
    if (request.kind === "magicWandBitmap") {
      if (!request.bitmap || typeof OffscreenCanvas === "undefined") {
        throw new Error("OffscreenCanvas is unavailable in the raster worker.");
      }
      bitmap = request.bitmap;
      const canvas = new OffscreenCanvas(request.width, request.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a raster worker context.");
      context.drawImage(bitmap, 0, 0, request.width, request.height);
      pixels = context.getImageData(0, 0, request.width, request.height).data;
    } else {
      if (!request.data) throw new Error("Raster worker received no pixel data.");
      pixels = new Uint8ClampedArray(request.data);
    }
    const mask = createMagicWandMask(
      { width: request.width, height: request.height, data: pixels },
      request.seedX,
      request.seedY,
      request.tolerance,
    );
    workerScope.postMessage({ id: request.id, mask: mask.buffer as ArrayBuffer }, [mask.buffer]);
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "Raster selection worker failed.",
    });
  } finally {
    bitmap?.close();
  }
};
