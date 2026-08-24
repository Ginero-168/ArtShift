import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import { normalizeMatteValues, resizeMatteToAlpha } from "./removeBgPostprocess";

type RemoveBgWorkerRequest = {
  type: "remove";
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  channels: 3 | 4;
  blackPoint?: number;
  whitePoint?: number;
};

type RemoveBgWorkerCancel = { type: "cancel"; id: number };
type RemoveBgWorkerMessage = RemoveBgWorkerRequest | RemoveBgWorkerCancel;

type RemoveBgWorkerResponse =
  | {
      type: "progress";
      id: number;
      progress: number;
      stage: "loading" | "decoding" | "inference" | "postprocess";
    }
  | { type: "result"; id: number; alpha: ArrayBuffer }
  | { type: "error"; id: number; name?: string; message: string };

// biome-ignore lint/suspicious/noExplicitAny: third-party Transformers.js runtime types
type RmbgRuntime = { model: any; processor: any };

const cancelled = new Set<number>();
let runtimePromise: Promise<RmbgRuntime> | null = null;

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RemoveBgWorkerMessage>) => void) | null;
  postMessage: (message: RemoveBgWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }
  void execute(message);
};

async function loadRuntime(id: number): Promise<RmbgRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const progress_callback = (info: { status?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.total || cancelled.has(id)) return;
      workerScope.postMessage({
        type: "progress",
        id,
        progress: Math.min(0.7, ((info.loaded ?? 0) / info.total) * 0.7),
        stage: "loading",
      });
    };
    const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");
    const canUseWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    try {
      const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
        device: canUseWebGpu ? "webgpu" : "wasm",
        dtype: canUseWebGpu ? "fp16" : "q8",
        progress_callback,
      });
      return { model, processor };
    } catch (_error) {
      if (!canUseWebGpu) {
        const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
          device: "wasm",
          progress_callback,
        });
        return { model, processor };
      }
      const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
        device: "wasm",
        progress_callback,
      });
      return { model, processor };
    }
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

async function execute(request: RemoveBgWorkerRequest): Promise<void> {
  try {
    throwIfCancelled(request.id);
    const runtime = await loadRuntime(request.id);
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.72,
      stage: "decoding",
    });

    const image = new RawImage(
      new Uint8ClampedArray(request.pixels),
      request.width,
      request.height,
      request.channels,
    );
    const { pixel_values } = await runtime.processor(image);
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.82,
      stage: "inference",
    });
    const { output } = await runtime.model({ input: pixel_values });
    throwIfCancelled(request.id);

    const modelMask = output[0];
    const sourceWidth = Number(modelMask.dims.at(-1));
    const sourceHeight = Number(modelMask.dims.at(-2));
    if (
      !Number.isInteger(sourceWidth) ||
      !Number.isInteger(sourceHeight) ||
      sourceWidth < 1 ||
      sourceHeight < 1
    ) {
      throw new Error("RMBG returned an invalid matte size.");
    }
    const normalized = normalizeMatteValues(modelMask.data);
    const alpha = resizeMatteToAlpha(
      normalized,
      sourceWidth,
      sourceHeight,
      request.width,
      request.height,
      { blackPoint: request.blackPoint, whitePoint: request.whitePoint },
    );
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.96,
      stage: "postprocess",
    });
    const alphaBuffer = alpha.buffer as ArrayBuffer;
    workerScope.postMessage({ type: "result", id: request.id, alpha: alphaBuffer }, [alphaBuffer]);
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      id: request.id,
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : "Remove BG worker failed.",
    });
  } finally {
    cancelled.delete(request.id);
  }
}

function throwIfCancelled(id: number): void {
  if (cancelled.has(id)) {
    const error = new Error("Background removal was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}
