import { generateAIImage } from "@/lib/ai/imageGeneration";
import { getCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { getGenerationPreviewBounds } from "@/lib/engine/generationPlacement";
import { getCached, preloadDataURL } from "@/lib/engine/imageCache";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import { enqueueAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";
import { runBriefQualityGate } from "./briefQualityGate";
import type { ComposerImageRef } from "./imageReferences";
import { decideRecovery, type RecoveryFailureKind } from "./recoveryPolicy";
import { type AiTask, type AiTaskEvent, reduceAiTask } from "./taskMachine";

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
  | "cancelled";

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
    onUpdate?: (update: ContextAwareTaskUpdate) => void;
  } = {},
): Promise<ContextAwareTaskResult> {
  let task = initialTask;
  const signal = options.signal ?? new AbortController().signal;
  const inputImages = resolveReferenceImages(refs);
  const dimensions = resolveOutputDimensions(task.prompt);
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
      for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
        throwIfAborted(signal);
        task = transition(task, { type: "running" }, options, {
          stage: "generating",
          message: `กำลังสร้างภาพ (ครั้งที่ ${attempt}/${task.maxAttempts})…`,
          attempt,
          quality: task.quality,
        });
        context.update({
          phase: "running",
          progress: null,
          message: `กำลังสร้างภาพ (ครั้งที่ ${attempt}/${task.maxAttempts})…`,
        });
        try {
          const generated = await generateAIImage(
            {
              prompt: task.prompt,
              width: dimensions.width,
              height: dimensions.height,
              aspectRatio: dimensions.aspectRatio,
              quality: task.quality,
              inputImages,
              cloudConsent: true,
              enhance: false,
            },
            signal,
          );
          throwIfAborted(signal);
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
          context.update({ progress: 0.78, message: "กำลังตรวจผลลัพธ์เทียบกับ brief…" });
          const preloaded = await preloadDataURL(generated.dataUrl);
          throwIfAborted(signal);
          task = transition(task, { type: "preloading" }, options, {
            stage: "preloading",
            message: "กำลังโหลดภาพให้พร้อมก่อนวางบน Canvas…",
            attempt,
            quality: task.quality,
          });
          context.update({ progress: 0.92, message: "กำลังโหลดภาพให้พร้อมก่อนวางบน Canvas…" });
          const state = useEngine.getState();
          const slide = state.currentSlide();
          if (!slide) throw new Error("ไม่พบ Canvas ที่กำลังใช้งาน");
          const finalBounds = getGenerationPreviewBounds(
            { ...viewport, slideWidth: slide.width, slideHeight: slide.height },
            { width: preloaded.width, height: preloaded.height },
          );
          task = transition(task, { type: "committing" }, options, {
            stage: "committing",
            message: "กำลังเพิ่มผลลัพธ์แบบ atomic โดยไม่ทับต้นฉบับ…",
            attempt,
            quality: task.quality,
          });
          context.update({ progress: 0.98, message: "กำลังเพิ่มผลลัพธ์ลง Canvas…" });
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
          state.selectOnly([element.id]);
          enqueueAssetAnalysis({
            fileId: preloaded.fileId,
            dataURL: preloaded.dataURL,
            width: preloaded.width,
            height: preloaded.height,
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
          const recovery = decideRecovery({ kind, attempt, maxAttempts: task.maxAttempts });
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
          task = transition(task, { type: "failed", reason: errorMessage(error) }, options, {
            stage: "failed",
            message: `Task ไม่สำเร็จ: ${errorMessage(error)}`,
            attempt,
            quality: task.quality,
          });
          throw error;
        }
      }
    },
  });

  try {
    await job.promise;
  } catch (error) {
    if (isAbortError(error)) {
      task = transition(task, { type: "cancelled", reason: "ผู้ใช้ยกเลิก" }, options, {
        stage: "cancelled",
        message: "ยกเลิก Task แล้ว และไม่มีการเปลี่ยนแปลงบน Canvas",
        attempt: task.attempt,
        quality: task.quality,
      });
    }
    throw error;
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
      element?.type !== "image" ||
      element?.version !== ref.elementVersion ||
      element?.fileId !== ref.fileId
    ) {
      throw new Error(`selected image changed before execution: ${ref.displayName}`);
    }
    const cached = getCached(ref.fileId);
    if (!cached?.dataURL) {
      throw new Error(`selected image is no longer available locally: ${ref.displayName}`);
    }
    const mimeType = cached.dataURL.match(/^data:(image\/(?:png|jpeg|webp));base64,/u)?.[1] as
      | "image/png"
      | "image/jpeg"
      | "image/webp"
      | undefined;
    return { dataUrl: cached.dataURL, ...(mimeType ? { mimeType } : {}) };
  });
}

function resolveOutputDimensions(prompt: string): {
  width: number;
  height: number;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
} {
  const value = prompt.toLocaleLowerCase();
  if (/(?:9:16|แนวตั้ง|story|reel)/iu.test(value))
    return { width: 720, height: 1280, aspectRatio: "9:16" };
  if (/(?:16:9|แนวนอน|banner|cover)/iu.test(value))
    return { width: 1280, height: 720, aspectRatio: "16:9" };
  if (/(?:4:3)/u.test(value)) return { width: 1024, height: 768, aspectRatio: "4:3" };
  if (/(?:3:4)/u.test(value)) return { width: 768, height: 1024, aspectRatio: "3:4" };
  return { width: 1024, height: 1024, aspectRatio: "1:1" };
}

function transition(
  task: AiTask,
  event: AiTaskEvent,
  options: { onUpdate?: (update: ContextAwareTaskUpdate) => void },
  update: ContextAwareTaskUpdate,
): AiTask {
  const next = reduceAiTask(task, event).task;
  options.onUpdate?.(update);
  return next;
}

function classifyFailure(error: unknown): RecoveryFailureKind {
  const message = errorMessage(error).toLocaleLowerCase();
  if (
    message.includes("provider") &&
    (message.includes("credential") || message.includes("auth") || message.includes("key"))
  )
    return "auth";
  if (message.includes("invalid") || message.includes("unsupported")) return "invalid_input";
  if (message.includes("budget") || message.includes("cost")) return "budget";
  if (message.includes("quality gate") || message.includes("brief")) return "quality";
  if (message.includes("network") || message.includes("reach") || message.includes("timeout"))
    return "network";
  return "capability";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
  error.name = "AbortError";
  throw error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
