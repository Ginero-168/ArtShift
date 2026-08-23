import {
  assertRasterJobBudget,
  executeRasterJobLocally,
  type RasterJob,
  type RasterJobOptions,
  type RasterResult,
} from "./processor";

type SerializedJob = {
  kind: RasterJob["kind"];
  pixels: { width: number; height: number; data: ArrayBuffer };
  mask?: ArrayBuffer;
  mode?: "keep" | "erase";
  [key: string]: unknown;
};

type ExecuteRequest = { type: "execute"; id: number; job: SerializedJob };
type CancelRequest = { type: "cancel"; id: number };
type WorkerRequest = ExecuteRequest | CancelRequest;

type WorkerResponse =
  | { type: "progress"; id: number; progress: number; stage: string }
  | { type: "result"; id: number; result: SerializedResult }
  | { type: "error"; id: number; name?: string; message: string };

type SerializedResult = Omit<RasterResult, "data" | "mask"> & {
  data?: ArrayBuffer;
  mask?: ArrayBuffer;
};

const cancelled = new Set<number>();
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.id);
    return;
  }
  void execute(request);
};

async function execute(request: ExecuteRequest) {
  const { id } = request;
  try {
    if (cancelled.has(id)) throw new DOMException("Raster job cancelled.", "AbortError");
    const job = deserializeJob(request.job);
    const options: RasterJobOptions = {
      onProgress: ({ progress, stage }) => {
        if (!cancelled.has(id)) workerScope.postMessage({ type: "progress", id, progress, stage });
      },
    };
    assertRasterJobBudget(job, options);
    const result = executeRasterJobLocally(job, options);
    if (cancelled.has(id)) throw new DOMException("Raster job cancelled.", "AbortError");
    const serialized = serializeResult(result);
    const transfer: Transferable[] = [];
    if (serialized.data) transfer.push(serialized.data);
    if (serialized.mask) transfer.push(serialized.mask);
    workerScope.postMessage({ type: "result", id, result: serialized }, transfer);
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      id,
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : "Raster worker failed.",
    });
  } finally {
    cancelled.delete(id);
  }
}

function deserializeJob(job: SerializedJob): RasterJob {
  const pixels = {
    width: job.pixels.width,
    height: job.pixels.height,
    data: new Uint8ClampedArray(job.pixels.data),
  };
  if (job.kind === "selectionMask") {
    return {
      kind: "selectionMask",
      pixels,
      mask: new Uint8Array(job.mask ?? new ArrayBuffer(0)),
      mode: job.mode ?? "erase",
    };
  }
  return { ...job, pixels } as RasterJob;
}

function serializeResult(result: RasterResult): SerializedResult {
  if (result.kind === "mask") {
    return {
      kind: result.kind,
      width: result.width,
      height: result.height,
      mask: result.mask.buffer as ArrayBuffer,
    };
  }
  return {
    kind: result.kind,
    width: result.width,
    height: result.height,
    data: result.data.buffer as ArrayBuffer,
  };
}
