import {
  beginProcessingPreview,
  clearProcessingPreview,
  type ProcessingPreview,
  type ProcessingPreviewInput,
  updateProcessingPreview,
} from "./processingPreview";

export type ProcessingJobContext = {
  id: string;
  signal: AbortSignal;
  update: (patch: Partial<Omit<ProcessingPreview, "id">>) => void;
};

export type EnqueueProcessingJobInput = {
  preview: ProcessingPreviewInput;
  run: (context: ProcessingJobContext) => Promise<void>;
  signal?: AbortSignal;
  concurrent?: boolean;
};

type QueueJob = {
  id: string;
  controller: AbortController;
  run: EnqueueProcessingJobInput["run"];
  resolve: () => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

export type EnqueuedProcessingJob = {
  id: string;
  promise: Promise<void>;
  cancel: () => void;
};

const queue: QueueJob[] = [];
const concurrentJobs = new Map<string, QueueJob>();
let activeJob: QueueJob | null = null;

export function enqueueProcessingJob(input: EnqueueProcessingJobInput): EnqueuedProcessingJob {
  if (input.concurrent) {
    const id = beginProcessingPreview({
      ...input.preview,
      phase: "running",
      queuePosition: undefined,
      message: input.preview.message ?? "กำลังประมวลผล…",
    });
    const controller = new AbortController();
    let resolvePromise!: () => void;
    let rejectPromise!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const cancel = () => cancelProcessingJob(id);
    const cleanup = () => input.signal?.removeEventListener("abort", cancel);
    const job: QueueJob = {
      id,
      controller,
      run: input.run,
      resolve: resolvePromise,
      reject: rejectPromise,
      cleanup,
    };
    concurrentJobs.set(id, job);
    if (input.signal) {
      if (input.signal.aborted) cancel();
      else input.signal.addEventListener("abort", cancel, { once: true });
    }
    (async () => {
      try {
        await job.run({
          id: job.id,
          signal: job.controller.signal,
          update: (patch) => updateProcessingPreview(job.id, patch),
        });
        job.resolve();
      } catch (error) {
        job.reject(error);
      } finally {
        clearProcessingPreview(job.id);
        job.cleanup();
        concurrentJobs.delete(id);
      }
    })();
    return {
      id,
      promise,
      cancel,
    };
  }

  const id = beginProcessingPreview({
    ...input.preview,
    phase: "queued",
    queuePosition: queue.length + 1,
    message: input.preview.message ?? "รอคิวประมวลผล…",
  });
  const controller = new AbortController();
  let resolvePromise!: () => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const cleanup = () => input.signal?.removeEventListener("abort", cancel);
  const cancel = () => cancelProcessingJob(id);
  const job: QueueJob = {
    id,
    controller,
    run: input.run,
    resolve: resolvePromise,
    reject: rejectPromise,
    cleanup,
  };
  queue.push(job);
  if (input.signal) {
    if (input.signal.aborted) cancel();
    else input.signal.addEventListener("abort", cancel, { once: true });
  }
  refreshQueuePositions();
  void pumpQueue();

  return {
    id,
    promise,
    cancel: () => cancelProcessingJob(id),
  };
}

export function cancelProcessingJob(id: string): void {
  const concurrent = concurrentJobs.get(id);
  if (concurrent) {
    concurrent.controller.abort();
    clearProcessingPreview(concurrent.id);
    concurrent.cleanup();
    concurrent.resolve();
    concurrentJobs.delete(id);
    return;
  }
  const queuedIndex = queue.findIndex((job) => job.id === id);
  if (queuedIndex >= 0) {
    const [job] = queue.splice(queuedIndex, 1);
    job.controller.abort();
    clearProcessingPreview(job.id);
    job.cleanup();
    job.resolve();
    refreshQueuePositions();
    return;
  }
  if (activeJob?.id === id) {
    activeJob.controller.abort();
  }
}

async function pumpQueue(): Promise<void> {
  if (activeJob) return;
  const next = queue.shift();
  if (!next) return;
  activeJob = next;
  updateProcessingPreview(next.id, {
    phase: "running",
    queuePosition: undefined,
    message: "กำลังประมวลผล…",
  });
  refreshQueuePositions();

  try {
    await next.run({
      id: next.id,
      signal: next.controller.signal,
      update: (patch) => updateProcessingPreview(next.id, patch),
    });
    next.resolve();
  } catch (error) {
    next.reject(error);
  } finally {
    clearProcessingPreview(next.id);
    next.cleanup();
    activeJob = null;
    void pumpQueue();
  }
}

function refreshQueuePositions(): void {
  queue.forEach((job, index) => {
    updateProcessingPreview(job.id, {
      phase: "queued",
      queuePosition: index + 1,
      message: `รอคิวประมวลผล… ลำดับ ${index + 1}`,
    });
  });
}
