import { createMagicWandMask } from "./magicWand";

type SelectionWorkerRequest = {
  id: number;
  kind: "magicWand";
  width: number;
  height: number;
  data: ArrayBuffer;
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
  try {
    const pixels = new Uint8ClampedArray(request.data);
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
  }
};
