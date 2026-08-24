import { summarizeAssetPixels } from "./assetAnalysis";
import type {
  AssetAnalysisWorkerMessage,
  AssetAnalysisWorkerRequest,
  AssetAnalysisWorkerResponse,
} from "./assetAnalysisWorkerProtocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<AssetAnalysisWorkerMessage>) => void) | null;
  postMessage: (message: AssetAnalysisWorkerResponse) => void;
};

const workerScope = self as unknown as WorkerScope;
const cancelled = new Set<number>();

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }
  void execute(message);
};

async function execute(request: AssetAnalysisWorkerRequest): Promise<void> {
  try {
    throwIfCancelled(request.id);
    const response = await fetch(request.dataURL);
    const bitmap = await createImageBitmap(await response.blob());
    throwIfCancelled(request.id);

    const scale = Math.min(1, request.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the asset analysis canvas.");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    bitmap.close();
    throwIfCancelled(request.id);

    workerScope.postMessage({
      type: "result",
      id: request.id,
      result: summarizeAssetPixels(
        request.fileId,
        request.sourceWidth,
        request.sourceHeight,
        pixels.data,
        width,
        height,
      ),
    });
    cancelled.delete(request.id);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    workerScope.postMessage({
      type: "error",
      id: request.id,
      name: failure.name,
      message: failure.message,
    });
  }
}

function throwIfCancelled(id: number): void {
  if (!cancelled.has(id)) return;
  cancelled.delete(id);
  const error = new Error("Asset analysis was cancelled.");
  error.name = "AbortError";
  throw error;
}
