import type { ComposerImageRef } from "./imageReferences";
import {
  type ContextAwareImageTaskOptions,
  type ContextAwareTaskResult,
  type ContextAwareTaskStage,
  runContextAwareImageTask,
} from "./imageTaskRunner";
import type { AiTask } from "./taskMachine";

export const MAX_IMAGE_OUTPUTS_PER_BATCH = 5 as const;
export const MAX_IMAGE_OUTPUTS_PER_RUN = 100 as const;

export type ImageBatchPlan = {
  index: number;
  itemIndexes: number[];
};

export type DirectedImageRun = {
  id: string;
  requestedOutputCount: number;
  maxBatchSize: typeof MAX_IMAGE_OUTPUTS_PER_BATCH;
  totalBatches: number;
  estimatedMaxCostUsd: number;
  batches: ImageBatchPlan[];
  tasks: AiTask[];
};

export type ImageRunItemStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "outcome-unknown";

export type ContextAwareImageRunItem = {
  taskId: string;
  outputIndex: number;
  batchIndex: number;
  status: ImageRunItemStatus;
  retryable: boolean;
  result?: ContextAwareTaskResult;
  error?: string;
};

export type ContextAwareImageRunStatus = "succeeded" | "partial" | "cancelled";

export type ContextAwareImageRunResult = {
  runId: string;
  status: ContextAwareImageRunStatus;
  requestedOutputCount: number;
  maxBatchSize: typeof MAX_IMAGE_OUTPUTS_PER_BATCH;
  totalBatches: number;
  completedCount: number;
  failedCount: number;
  remainingCount: number;
  cancelled: boolean;
  items: ContextAwareImageRunItem[];
};

export type ContextAwareImageRunUpdate = {
  runId: string;
  stage: ContextAwareTaskStage | "batch-start" | "partial";
  message: string;
  requestedOutputCount: number;
  completedCount: number;
  failedCount: number;
  remainingCount: number;
  outputIndex: number;
  batchIndex: number;
  totalBatches: number;
  itemStatus: ImageRunItemStatus;
  taskUpdate?: Parameters<NonNullable<ContextAwareImageTaskOptions["onUpdate"]>>[0];
};

export type ContextAwareImageTaskExecutor = (
  task: AiTask,
  refs: readonly ComposerImageRef[],
  options: ContextAwareImageTaskOptions,
) => Promise<ContextAwareTaskResult>;

export type ContextAwareImageRunOptions = Omit<
  ContextAwareImageTaskOptions,
  "onUpdate" | "placement"
> & {
  executeTask?: ContextAwareImageTaskExecutor;
  onUpdate?: (update: ContextAwareImageRunUpdate) => void;
};

export function planImageBatches(requestedOutputCount: number): ImageBatchPlan[] {
  if (
    !Number.isInteger(requestedOutputCount) ||
    requestedOutputCount < 1 ||
    requestedOutputCount > MAX_IMAGE_OUTPUTS_PER_RUN
  ) {
    throw new Error(
      `requested output count must be an integer from 1 to ${MAX_IMAGE_OUTPUTS_PER_RUN}`,
    );
  }
  const batches: ImageBatchPlan[] = [];
  for (let start = 0; start < requestedOutputCount; start += MAX_IMAGE_OUTPUTS_PER_BATCH) {
    batches.push({
      index: batches.length + 1,
      itemIndexes: Array.from(
        { length: Math.min(MAX_IMAGE_OUTPUTS_PER_BATCH, requestedOutputCount - start) },
        (_, offset) => start + offset,
      ),
    });
  }
  return batches;
}

export async function runContextAwareImageRun(
  run: DirectedImageRun,
  refs: readonly ComposerImageRef[],
  options: ContextAwareImageRunOptions = {},
): Promise<ContextAwareImageRunResult> {
  assertRunPlan(run);
  if (options.cloudConsent !== true) {
    throw new Error("Explicit cloud consent is required for the complete image run");
  }

  const executeTask = options.executeTask ?? runContextAwareImageTask;
  const items: ContextAwareImageRunItem[] = run.tasks.map((task, index) => ({
    taskId: task.id,
    outputIndex: index + 1,
    batchIndex: task.imageRun?.batchIndex ?? 1,
    status: "queued",
    retryable: false,
  }));
  let cancelled = false;

  const counts = () => {
    const completedCount = items.filter((item) => item.status === "succeeded").length;
    const failedCount = items.filter(
      (item) => item.status === "failed" || item.status === "outcome-unknown",
    ).length;
    return {
      completedCount,
      failedCount,
      remainingCount: run.requestedOutputCount - completedCount,
    };
  };
  const emit = (
    item: ContextAwareImageRunItem,
    stage: ContextAwareImageRunUpdate["stage"],
    message: string,
    taskUpdate?: ContextAwareImageRunUpdate["taskUpdate"],
  ) => {
    options.onUpdate?.({
      runId: run.id,
      stage,
      message,
      requestedOutputCount: run.requestedOutputCount,
      ...counts(),
      outputIndex: item.outputIndex,
      batchIndex: item.batchIndex,
      totalBatches: run.totalBatches,
      itemStatus: item.status,
      ...(taskUpdate ? { taskUpdate } : {}),
    });
  };

  for (const batch of run.batches) {
    if (options.signal?.aborted) {
      cancelled = true;
      markRemainingCancelled(items);
      return finalizeRun(run, items, cancelled);
    }
    const firstItem = items[batch.itemIndexes[0] ?? -1];
    if (firstItem) {
      emit(
        firstItem,
        "batch-start",
        `เริ่ม batch ${batch.index}/${run.totalBatches} (${batch.itemIndexes.length} ภาพ)`,
      );
    }

    await Promise.all(
      batch.itemIndexes.map(async (itemIndex) => {
        const item = items[itemIndex];
        const task = run.tasks[itemIndex];
        if (!item || !task) throw new Error("image run plan is inconsistent");
        if (options.signal?.aborted) {
          cancelled = true;
          item.status = "cancelled";
          return;
        }

        item.status = "running";
        emit(
          item,
          "generating",
          `กำลังสร้างภาพ ${item.outputIndex}/${run.requestedOutputCount} · batch ${batch.index}/${run.totalBatches}`,
        );
        try {
          const result = await executeTask(task, refs, {
            signal: options.signal,
            cloudConsent: true,
            analyzeOutput: options.analyzeOutput,
            reviewOutput: options.reviewOutput,
            placement: {
              outputIndex: item.outputIndex,
              requestedOutputCount: run.requestedOutputCount,
            },
            onUpdate: (taskUpdate) => {
              emit(
                item,
                taskUpdate.stage,
                `ภาพ ${item.outputIndex}/${run.requestedOutputCount}: ${taskUpdate.message}`,
                taskUpdate,
              );
            },
          });
          item.status = "succeeded";
          item.result = result;
          emit(item, "succeeded", `ภาพ ${item.outputIndex}/${run.requestedOutputCount} สำเร็จ`);
        } catch (error) {
          const wasCancelled =
            (error as Error).name === "AbortError" || Boolean(options.signal?.aborted);
          if (wasCancelled) {
            cancelled = true;
            item.status = "cancelled";
            emit(item, "cancelled", "ยกเลิกแล้ว");
            return;
          }
          item.status =
            (error as Error).name === "OutcomeUnknownError" ? "outcome-unknown" : "failed";
          item.retryable = true;
          item.error = (error as Error).message || "task execution failed";
          emit(
            item,
            "failed",
            `ภาพ ${item.outputIndex}/${run.requestedOutputCount} ไม่สำเร็จ: ${item.error}`,
          );
        }
      }),
    );

    if (cancelled || options.signal?.aborted) {
      cancelled = true;
      markRemainingCancelled(items);
      const abortedItem = items.find((i) => i.status === "cancelled") ?? items[0];
      if (abortedItem) {
        emit(abortedItem, "cancelled", "ยกเลิกแล้ว และจะไม่เริ่มภาพหรือ batch ถัดไป");
      }
      return finalizeRun(run, items, cancelled);
    }
  }

  return finalizeRun(run, items, cancelled);
}

function assertRunPlan(run: DirectedImageRun): void {
  if (
    typeof run.id !== "string" ||
    run.id.trim().length === 0 ||
    !Number.isInteger(run.requestedOutputCount) ||
    run.requestedOutputCount < 1 ||
    run.requestedOutputCount > MAX_IMAGE_OUTPUTS_PER_RUN ||
    run.maxBatchSize !== MAX_IMAGE_OUTPUTS_PER_BATCH ||
    run.tasks.length !== run.requestedOutputCount
  ) {
    throw new Error("directed image run plan is invalid");
  }
}

function markRemainingCancelled(items: ContextAwareImageRunItem[]): void {
  for (const item of items) {
    if (item.status === "queued" || item.status === "running") {
      item.status = "cancelled";
    }
  }
}

function finalizeRun(
  run: DirectedImageRun,
  items: ContextAwareImageRunItem[],
  cancelled: boolean,
): ContextAwareImageRunResult {
  const completedCount = items.filter((item) => item.status === "succeeded").length;
  const failedCount = items.filter(
    (item) => item.status === "failed" || item.status === "outcome-unknown",
  ).length;
  const status: ContextAwareImageRunStatus = cancelled
    ? "cancelled"
    : completedCount === run.requestedOutputCount
      ? "succeeded"
      : "partial";
  return {
    runId: run.id,
    status,
    requestedOutputCount: run.requestedOutputCount,
    maxBatchSize: run.maxBatchSize,
    totalBatches: run.totalBatches,
    completedCount,
    failedCount,
    remainingCount: run.requestedOutputCount - completedCount,
    cancelled,
    items,
  };
}
