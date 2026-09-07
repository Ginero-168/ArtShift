import {
  GPT_IMAGE_2_ESTIMATED_COST_USD,
  generateAIImage,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";
import { runVisualQualityGate } from "@/lib/ai/visualQualityGate";
import { getCanvasViewport, subscribeCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { getGenerationPreviewBounds } from "@/lib/engine/generationPlacement";
import { preloadDataURL } from "@/lib/engine/imageCache";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import { visionCaption, visionDetect, visionOcr } from "@/lib/vision/visionEngine";
import { runBriefQualityGate } from "./briefQualityGate";
import type { ComposerImageRef } from "./imageReferences";
import { decideRecovery, type RecoveryFailureKind } from "./recoveryPolicy";
import { type GeneratedOutputAnalysis, runGeneratedImageQualityGate } from "./resultQualityGate";
import {
  type AiTask,
  type AiTaskEvent,
  appendAiTaskEvent,
  assertAiTaskHarness,
  reduceAiTask,
  registerAiTask,
} from "./taskMachine";
import { renderVisibleReference } from "./visibleReferenceRenderer";

export type ContextAwareTaskStage =
  | "queued"
  | "analyzing"
  | "generating"
  | "retrying"
  | "quality-check"
  | "preloading"
  | "committing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "outcome-unknown";

export type ContextAwareTaskUpdate = {
  stage: ContextAwareTaskStage;
  message: string;
  attempt: number;
  quality: AiTask["quality"];
};

export type ContextAwareTaskResult = {
  task: AiTask;
  elementId: string;
  width: number;
  height: number;
};

export async function runContextAwareImageTask(
  initialTask: AiTask,
  refs: readonly ComposerImageRef[],
  options: {
    signal?: AbortSignal;
    cloudConsent?: boolean;
    analyzeOutput?: (
      dataURL: string,
      fileId: string,
      width: number,
      height: number,
      signal: AbortSignal,
    ) => Promise<GeneratedOutputAnalysis | undefined>;
    onUpdate?: (update: ContextAwareTaskUpdate) => void;
  } = {},
): Promise<ContextAwareTaskResult> {
  const signal = options.signal ?? new AbortController().signal;
  assertAiTaskHarness(initialTask);
  registerAiTask(initialTask);
  if (initialTask.cloudConsentRequired && options.cloudConsent !== true) {
    throw new Error("Explicit cloud consent is required before starting this task");
  }
  let task = initialTask;
  if (!task.history.some((event) => event.type === "intent.assessed")) {
    task = appendAiTaskEvent(task, { type: "intent.assessed", complete: true });
  }
  let inputImages: Array<{
    dataUrl: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
  }>;
  try {
    inputImages = resolveReferenceImages(refs);
  } catch (error) {
    task = appendAiTaskEvent(task, {
      type: "task.failed",
      reason: "Selected reference was stale before execution",
    });
    task = transition(task, { type: "failed", reason: errorMessage(error) }, options, {
      stage: "failed",
      message: `Task ไม่สำเร็จ: ${errorMessage(error)}`,
      attempt: task.attempt,
      quality: task.quality,
    });
    throw attachTaskSnapshot(error, task);
  }
  const initialState = useEngine.getState();
  const targetSnapshot = {
    docId: initialState.doc.id,
    slideId: initialState.currentSlideId,
    revision: initialState.doc.updatedAt,
  };
  const dimensions = task.requestedDimensions ?? resolveImageGenerationDimensions(task.prompt);
  const viewport =
    getCanvasViewport() ??
    ({
      width: dimensions.width,
      height: dimensions.height,
      scale: 1,
      tx: 0,
      ty: 0,
      slideWidth: useEngine.getState().doc.width,
      slideHeight: useEngine.getState().doc.height,
    } as const);
  const previewBounds = getGenerationPreviewBounds(viewport, dimensions);
  let committed: ContextAwareTaskResult | null = null;
  let lastError: unknown;
  let qualityRepairInstruction: string | undefined;

  task = transition(task, { type: "consent-granted" }, options, {
    stage: "queued",
    message: "ได้รับอนุญาตแล้ว กำลังเข้าคิว Task…",
    attempt: 0,
    quality: task.quality,
  });
  task = transition(task, { type: "queued" }, options, {
    stage: "queued",
    message: "กำลังเข้าคิว Task…",
    attempt: 0,
    quality: task.quality,
  });

  const job = enqueueProcessingJob({
    signal,
    preview: {
      kind: "generate",
      label: refs.length ? "Image Editor" : "Image Generator",
      x: previewBounds.x,
      y: previewBounds.y,
      width: previewBounds.width,
      height: previewBounds.height,
      progress: 0,
      sourceDataUrl: inputImages[0]?.dataUrl,
      message: "เตรียมพื้นที่ผลลัพธ์ใน Canvas…",
    },
    run: async (context) => {
      const executionSignal = context.signal;
      const unsubscribeViewport = subscribeCanvasViewport(() => {
        const currentViewport = getCanvasViewport();
        if (!currentViewport) return;
        const nextBounds = getGenerationPreviewBounds(currentViewport, dimensions);
        context.update({ ...nextBounds });
      });
      try {
        context.update({
          phase: "analyzing",
          progress: null,
          message: "กำลังวิเคราะห์บริบทของ Task ก่อนส่ง provider…",
        });
        for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
          throwIfAborted(executionSignal);
          const reservedCostUsd = attempt * GPT_IMAGE_2_ESTIMATED_COST_USD;
          if (reservedCostUsd > task.estimatedMaxCostUsd + Number.EPSILON) {
            const budgetError = new Error(
              `Task budget cannot cover attempt ${attempt}; no provider request was created.`,
            );
            task = appendAiTaskEvent(task, {
              type: "task.failed",
              reason: "Task budget cannot cover the next attempt",
            });
            task = transition(task, { type: "failed", reason: budgetError.message }, options, {
              stage: "failed",
              message: "งบประมาณของ Task ไม่พอสำหรับการลองครั้งถัดไป จึงหยุดก่อนส่ง provider",
              attempt: task.attempt,
              quality: task.quality,
            });
            throw attachTaskSnapshot(budgetError, task);
          }
          const attemptPrompt = qualityRepairInstruction
            ? `${task.prompt}\n\nQuality repair instruction: ${qualityRepairInstruction}`
            : task.prompt;
          task = transition(task, { type: "running" }, options, {
            stage: "generating",
            message: `กำลังสร้างภาพ (ครั้งที่ ${attempt}/${task.maxAttempts})…`,
            attempt,
            quality: task.quality,
          });
          context.update({
            phase: "generating",
            progress: null,
            message: `กำลังสร้างภาพ (ครั้งที่ ${attempt}/${task.maxAttempts})…`,
          });
          task = appendAiTaskEvent(task, {
            type: "provider.requested",
            attempt,
            subAgent: task.subAgent,
          });
          try {
            const generated = await generateAIImage(
              {
                prompt: attemptPrompt,
                width: dimensions.width,
                height: dimensions.height,
                aspectRatio: dimensions.aspectRatio,
                quality: task.quality,
                inputImages,
                cloudConsent: options.cloudConsent === true,
                enhance: false,
              },
              executionSignal,
            );
            throwIfAborted(executionSignal);
            const technicalGate = runVisualQualityGate({
              dataUrl: generated.dataUrl,
              prompt: task.prompt,
              width: generated.width,
              height: generated.height,
              outputCount: 1,
            });
            if (!technicalGate.passed) {
              qualityRepairInstruction = buildQualityRepairInstruction(technicalGate.blockers);
              throw new Error(
                `Generated image failed the visual quality gate: ${technicalGate.blockers.join(" ")}`,
              );
            }
            const briefGate = runBriefQualityGate({
              prompt: task.prompt,
              outputWidth: generated.width,
              outputHeight: generated.height,
              outputCount: 1,
              requestedAspectRatio: dimensions.aspectRatio,
              referenceCount: task.selectedImages.length,
              submittedReferenceCount: inputImages.length,
            });
            if (!briefGate.passed) {
              qualityRepairInstruction = buildQualityRepairInstruction(briefGate.blockers);
              throw new Error(
                `Generated image failed the brief quality gate: ${briefGate.blockers.join(" ")}`,
              );
            }
            task = transition(task, { type: "quality-check" }, options, {
              stage: "quality-check",
              message: "กำลังตรวจผลลัพธ์เทียบกับ brief…",
              attempt,
              quality: task.quality,
            });
            context.update({
              phase: "quality-check",
              progress: 0.45,
              message: "กำลังตรวจผลลัพธ์เทียบกับ brief…",
            });
            let outputAnalysis: GeneratedOutputAnalysis | undefined;
            const requiresLocalOutputReview =
              Boolean(task.requiredSubjects?.length) ||
              Boolean(task.requiredText?.trim()) ||
              task.selectedImages.length > 0;
            if (requiresLocalOutputReview) {
              try {
                outputAnalysis = await (options.analyzeOutput ?? analyzeGeneratedOutput)(
                  generated.dataUrl,
                  generated.fileId,
                  generated.width,
                  generated.height,
                  executionSignal,
                );
              } catch (error) {
                if (isAbortError(error)) throw error;
                if (task.requiredSubjects?.length || task.requiredText?.trim()) {
                  throw new Error(
                    "Generated image failed the quality gate: local output review unavailable",
                  );
                }
                context.update({
                  progress: 0.7,
                  message: "ตรวจภาพเชิงความหมายไม่ได้ จึงใช้การตรวจทางเทคนิคต่อ",
                });
              }
            } else {
              context.update({
                progress: 0.7,
                message: "ไม่มี hard semantic constraint จึงใช้การตรวจทางเทคนิคต่อ",
              });
            }
            const semanticGate = runGeneratedImageQualityGate({
              outputWidth: generated.width,
              outputHeight: generated.height,
              requestedAspectRatio: dimensions.aspectRatio,
              requiredSubjects: task.requiredSubjects,
              requiredText: task.requiredText,
              referenceRequired: task.selectedImages.length > 0,
              referenceFacts: task.referenceFacts,
              outputAnalysis,
            });
            if (!semanticGate.passed) {
              qualityRepairInstruction = buildQualityRepairInstruction(semanticGate.blockers);
              throw new Error(
                `Generated image failed the semantic quality gate: ${semanticGate.blockers.join(" ")}`,
              );
            }
            task = appendAiTaskEvent(task, {
              type: "quality.checked",
              passed: true,
              attempt,
            });
            context.update({ progress: 0.78, message: "ตรวจผลลัพธ์เทียบกับ brief แล้ว" });
            const preloaded = await preloadDataURL(generated.dataUrl);
            throwIfAborted(executionSignal);
            task = appendAiTaskEvent(task, { type: "preload.completed", attempt });
            task = transition(task, { type: "preloading" }, options, {
              stage: "preloading",
              message: "กำลังโหลดภาพให้พร้อมก่อนวางบน Canvas…",
              attempt,
              quality: task.quality,
            });
            context.update({
              phase: "preloading",
              progress: 0.92,
              message: "กำลังโหลดภาพให้พร้อมก่อนวางบน Canvas…",
            });
            const state = useEngine.getState();
            const slide = state.currentSlide();
            assertCommitTarget(state, targetSnapshot, refs);
            if (!slide) throw new Error("ไม่พบ Canvas ที่กำลังใช้งาน");
            if (slide.layers.length === 0) throw new Error("ไม่พบ Layer สำหรับวางผลลัพธ์บน Canvas");
            const historyBeforeCommit = state.history.past.length;
            const currentViewport = getCanvasViewport() ?? viewport;
            const finalBounds = getGenerationPreviewBounds(
              { ...currentViewport, slideWidth: slide.width, slideHeight: slide.height },
              { width: preloaded.width, height: preloaded.height },
            );
            task = appendAiTaskEvent(task, { type: "commit.started", attempt });
            task = transition(task, { type: "committing" }, options, {
              stage: "committing",
              message: "กำลังเพิ่มผลลัพธ์แบบ atomic โดยไม่ทับต้นฉบับ…",
              attempt,
              quality: task.quality,
            });
            context.update({
              phase: "committing",
              progress: 0.98,
              message: "กำลังเพิ่มผลลัพธ์ลง Canvas…",
            });
            const element = createImage({
              x: finalBounds.x,
              y: finalBounds.y,
              width: finalBounds.width,
              height: finalBounds.height,
              fileId: preloaded.fileId,
              naturalWidth: preloaded.width,
              naturalHeight: preloaded.height,
            });
            state.addElement(element, `AI task ${task.id} generate image`);
            const afterCommit = useEngine.getState();
            const inserted = afterCommit
              .currentSlide()
              ?.elements.some((candidate) => candidate.id === element.id && !candidate.isDeleted);
            if (!inserted || afterCommit.history.past.length !== historyBeforeCommit + 1) {
              throw new Error("Canvas commit was not applied atomically");
            }
            task = appendAiTaskEvent(task, { type: "commit.completed", attempt });
            state.selectOnly([element.id]);
            task = appendAiTaskEvent(task, {
              type: "task.succeeded",
              summary: "Generated image passed quality, preload, and atomic commit checks",
            });
            task = transition(task, { type: "succeeded" }, options, {
              stage: "succeeded",
              message: `สร้างและวางภาพสำเร็จ (${preloaded.width} × ${preloaded.height}px) โดยคงต้นฉบับไว้`,
              attempt,
              quality: task.quality,
            });
            context.update({ progress: 1, message: "สร้างและวางภาพสำเร็จ" });
            committed = {
              task,
              elementId: element.id,
              width: preloaded.width,
              height: preloaded.height,
            };
            return;
          } catch (error) {
            lastError = error;
            if (isAbortError(error)) throw error;
            const kind = classifyFailure(error);
            if (kind === "quality" && !qualityRepairInstruction) {
              qualityRepairInstruction = buildQualityRepairInstruction([errorMessage(error)]);
            }
            if (kind === "quality") {
              task = appendAiTaskEvent(task, { type: "quality.checked", passed: false, attempt });
            }
            const recovery = decideRecovery({ kind, attempt, maxAttempts: task.maxAttempts });
            task = appendAiTaskEvent(task, {
              type: "recovery.decided",
              action: recovery.action,
              reason: recovery.reason,
            });
            if (recovery.action === "outcome-unknown" || recovery.action === "resume") {
              const predictionId = predictionIdFromError(error);
              task = appendAiTaskEvent(task, {
                type: "task.outcome-unknown",
                reason:
                  recovery.action === "resume"
                    ? "Prediction handle retained; resume is unavailable in this client path"
                    : "Provider outcome could not be confirmed",
                ...(predictionId ? { predictionId } : {}),
              });
              task = transition(
                task,
                { type: "outcome-unknown", reason: "provider result could not be confirmed" },
                options,
                {
                  stage: "outcome-unknown",
                  message: "ผลลัพธ์จาก AI provider ยังยืนยันไม่ได้ จึงไม่สร้างคำขอซ้ำ",
                  attempt,
                  quality: task.quality,
                },
              );
              context.update({
                progress: null,
                message: "ผลลัพธ์ยังยืนยันไม่ได้ — ไม่มีการสร้างงานซ้ำอัตโนมัติ",
              });
              const outcomeError = isOutcomeUnknownError(error)
                ? attachTaskSnapshot(error, task)
                : createOutcomeUnknownError(task, predictionId);
              throw outcomeError;
            }
            if (recovery.action === "retry") {
              task = transition(task, { type: "failed", reason: errorMessage(error) }, options, {
                stage: "failed",
                message: `ครั้งที่ ${attempt} ไม่ผ่าน: ${recovery.reason}`,
                attempt,
                quality: task.quality,
              });
              task = transition(task, { type: "retry", reason: recovery.reason }, options, {
                stage: "retrying",
                message: `กำลังแก้ปัญหาและลองใหม่: ${recovery.reason}`,
                attempt,
                quality: task.quality,
              });
              context.update({ progress: 0, message: `กำลังแก้ปัญหาและลองใหม่…` });
              continue;
            }
            task = appendAiTaskEvent(task, {
              type: "task.failed",
              reason: "Task execution failed before commit",
            });
            task = transition(task, { type: "failed", reason: errorMessage(error) }, options, {
              stage: "failed",
              message: `Task ไม่สำเร็จ: ${errorMessage(error)}`,
              attempt,
              quality: task.quality,
            });
            throw attachTaskSnapshot(error, task);
          }
        }
      } finally {
        unsubscribeViewport();
      }
    },
  });

  try {
    await job.promise;
  } catch (error) {
    if (isAbortError(error)) {
      task = appendAiTaskEvent(task, {
        type: "task.cancelled",
        reason: "Task cancelled before commit",
      });
      task = transition(task, { type: "cancelled", reason: "ผู้ใช้ยกเลิก" }, options, {
        stage: "cancelled",
        message: "ยกเลิก Task แล้ว และไม่มีการเปลี่ยนแปลงบน Canvas",
        attempt: task.attempt,
        quality: task.quality,
      });
      throw attachTaskSnapshot(error, task);
    }
    throw error;
  }
  if (signal.aborted) {
    task = appendAiTaskEvent(task, {
      type: "task.cancelled",
      reason: "Task cancelled before queue execution",
    });
    task = transition(task, { type: "cancelled", reason: "ผู้ใช้ยกเลิกก่อนเริ่มงาน" }, options, {
      stage: "cancelled",
      message: "ยกเลิก Task ที่รอคิวแล้ว และไม่มีการเปลี่ยนแปลงบน Canvas",
      attempt: task.attempt,
      quality: task.quality,
    });
    throw attachTaskSnapshot(createAbortError(), task);
  }
  if (!committed) throw lastError instanceof Error ? lastError : new Error("AI Task ไม่ได้สร้างผลลัพธ์");
  return committed;
}

function resolveReferenceImages(
  refs: readonly ComposerImageRef[],
): Array<{ dataUrl: string; mimeType?: "image/png" | "image/jpeg" | "image/webp" }> {
  if (refs.length === 0) return [];
  const slide = useEngine.getState().currentSlide();
  return refs.map((ref) => {
    const element = slide?.elements.find((candidate) => candidate.id === ref.objectId);
    if (
      (element?.type !== "image" && element?.type !== "bookMockup") ||
      element?.version !== ref.elementVersion ||
      element?.fileId !== ref.fileId
    ) {
      throw new Error(`selected image changed before execution: ${ref.displayName}`);
    }
    const rendered = renderVisibleReference(ref);
    const mimeType = rendered.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,/u)?.[1] as
      | "image/png"
      | "image/jpeg"
      | "image/webp"
      | undefined;
    return { dataUrl: rendered.dataUrl, ...(mimeType ? { mimeType } : {}) };
  });
}

function transition(
  task: AiTask,
  event: AiTaskEvent,
  options: { onUpdate?: (update: ContextAwareTaskUpdate) => void },
  update: ContextAwareTaskUpdate,
): AiTask {
  const next = reduceAiTask(task, event).task;
  registerAiTask(next);
  options.onUpdate?.(update);
  return next;
}

function assertCommitTarget(
  state: ReturnType<typeof useEngine.getState>,
  snapshot: { docId: string; slideId: string; revision: number },
  refs: readonly ComposerImageRef[],
): void {
  if (
    state.doc.id !== snapshot.docId ||
    state.currentSlideId !== snapshot.slideId ||
    state.doc.updatedAt !== snapshot.revision
  ) {
    throw new Error("Canvas target changed before commit; please resend the task");
  }
  const slide = state.currentSlide();
  if (!slide) throw new Error("Canvas target disappeared before commit");
  for (const ref of refs) {
    const element = slide.elements.find((candidate) => candidate.id === ref.objectId);
    if (
      (element?.type !== "image" && element?.type !== "bookMockup") ||
      element.version !== ref.elementVersion ||
      element.fileId !== ref.fileId
    ) {
      throw new Error(`selected image changed before commit: ${ref.displayName}`);
    }
  }
}

function classifyFailure(error: unknown): RecoveryFailureKind {
  if (isOutcomeUnknownError(error)) return "polling";
  const message = errorMessage(error).toLocaleLowerCase();
  if (
    message.includes("provider") &&
    (message.includes("credential") || message.includes("auth") || message.includes("key"))
  )
    return "auth";
  if (
    message.includes("canvas target") ||
    message.includes("selected image changed") ||
    message.includes("commit was not applied")
  )
    return "invalid_input";
  if (message.includes("invalid") || message.includes("unsupported")) return "invalid_input";
  if (message.includes("budget") || message.includes("cost")) return "budget";
  if (message.includes("quality gate") || message.includes("brief")) return "quality";
  if (message.includes("network") || message.includes("reach") || message.includes("timeout"))
    return "network";
  return "capability";
}

function buildQualityRepairInstruction(blockers: readonly string[]): string {
  const diagnosis = blockers
    .join(" ")
    .replace(/data:image\/[^\s]+|https?:\/\/[^\s]+|bearer\s+\S+/giu, "[REDACTED]")
    .slice(0, 360);
  return `Regenerate with a materially different composition and correct the prior quality-gate finding: ${diagnosis}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

async function analyzeGeneratedOutput(
  dataURL: string,
  _fileId: string,
  _width: number,
  _height: number,
  signal: AbortSignal,
): Promise<GeneratedOutputAnalysis> {
  throwIfAborted(signal);
  const [caption, detection, visibleText] = await Promise.all([
    visionCaption(dataURL, "detailed"),
    visionDetect(dataURL),
    visionOcr(dataURL),
  ]);
  throwIfAborted(signal);
  return {
    caption: caption.trim(),
    objects: detection.objects.map((object) => object.label.trim()).filter(Boolean),
    visibleText: visibleText.trim(),
    limitations: [],
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
  error.name = "AbortError";
  throw error;
}

function attachTaskSnapshot(error: unknown, task: AiTask): Error {
  const target = error instanceof Error ? error : new Error("AI task failed.");
  Object.defineProperty(target, "task", { value: task, enumerable: false, configurable: false });
  return target;
}

function createOutcomeUnknownError(task: AiTask, predictionId?: string): Error {
  const error = new Error("AI provider result is uncertain; no duplicate request was created.");
  error.name = "OutcomeUnknownError";
  if (predictionId) Object.defineProperty(error, "predictionId", { value: predictionId });
  return attachTaskSnapshot(error, task);
}

function createAbortError(): Error {
  const error = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
  error.name = "AbortError";
  return error;
}

function isOutcomeUnknownError(error: unknown): error is Error & { predictionId?: string } {
  return error instanceof Error && error.name === "OutcomeUnknownError";
}

function predictionIdFromError(error: unknown): string | undefined {
  if (!isOutcomeUnknownError(error)) return undefined;
  return typeof error.predictionId === "string" && error.predictionId.length <= 256
    ? error.predictionId
    : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
