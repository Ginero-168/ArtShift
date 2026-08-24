import {
  AutoProcessor,
  env,
  Florence2ForConditionalGeneration,
  RawImage,
} from "transformers-florence-v3";
import { getVisionGenerationConfig } from "./visionGeneration";
import type {
  VisionWorkerMessage,
  VisionWorkerRequest,
  VisionWorkerResponse,
} from "./visionWorkerProtocol";

env.allowLocalModels = false;

const PRIMARY_MODEL_ID = "onnx-community/Florence-2-base-ft";
const FALLBACK_MODEL_ID = "onnx-community/Florence-2-base";

// biome-ignore lint/suspicious/noExplicitAny: Transformers.js model and processor generics are not exported uniformly.
type FlorenceRuntime = { model: any; processor: any };

const cancelled = new Set<number>();
let runtimePromise: Promise<FlorenceRuntime> | null = null;
let jobQueue = Promise.resolve();

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<VisionWorkerMessage>) => void) | null;
  postMessage: (message: VisionWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }

  // Florence generation is intentionally serialized. Concurrent ONNX jobs can
  // multiply memory pressure and make the whole browser process unstable.
  jobQueue = jobQueue.then(() => execute(message));
};

async function loadRuntime(jobId: number): Promise<FlorenceRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const progress_callback = (info: { status?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.total || cancelled.has(jobId)) return;
      workerScope.postMessage({
        type: "progress",
        id: jobId,
        progress: Math.min(0.5, ((info.loaded ?? 0) / info.total) * 0.5),
        stage: "loading",
      });
    };
    let lastError: unknown;

    for (const modelId of [PRIMARY_MODEL_ID, FALLBACK_MODEL_ID]) {
      try {
        // Florence-2's published ONNX graph was produced for Transformers.js v3.
        // Keep this worker on that compatible runtime and use the model card's
        // fp32 configuration. The rest of ArtShift remains on Transformers.js v4.
        const [model, processor] = await Promise.all([
          Florence2ForConditionalGeneration.from_pretrained(modelId, {
            dtype: "fp32",
            progress_callback,
          }),
          AutoProcessor.from_pretrained(modelId),
        ]);
        return { model, processor };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No compatible Florence-2 runtime is available.");
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

async function execute(request: VisionWorkerRequest): Promise<void> {
  try {
    throwIfCancelled(request.id);
    const { model, processor } = await loadRuntime(request.id);
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.55,
      stage: "decoding",
    });

    const image = await RawImage.fromURL(request.imageDataUrl);
    throwIfCancelled(request.id);
    const prompts = processor.construct_prompts(request.taskPrompt);
    const inputs = await processor(image, prompts);
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.75,
      stage: "inference",
    });

    const outputs = await model.generate({
      ...inputs,
      ...getVisionGenerationConfig(request.taskPrompt),
    });
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "progress",
      id: request.id,
      progress: 0.9,
      stage: "postprocess",
    });

    const generatedText = processor.batch_decode(outputs, { skip_special_tokens: false })[0];
    const parsed = processor.post_process_generation(generatedText, request.taskPrompt, [
      image.height,
      image.width,
    ]);
    throwIfCancelled(request.id);
    workerScope.postMessage({
      type: "result",
      id: request.id,
      result: {
        output: parsed[request.taskPrompt],
        width: image.width,
        height: image.height,
      },
    });
  } catch (error) {
    if (!cancelled.has(request.id)) {
      workerScope.postMessage({
        type: "error",
        id: request.id,
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : "Florence-2 worker failed.",
      });
    }
  } finally {
    cancelled.delete(request.id);
  }
}

function throwIfCancelled(id: number): void {
  if (!cancelled.has(id)) return;
  const error = new Error("Vision task was cancelled.");
  error.name = "AbortError";
  throw error;
}
