import {
  cleanImagePrompt,
  generateAIImage,
  hasExplicitDimensionsInText,
  isAlreadyOrchestratedPrompt,
  resolveDimensionsFromPixelSize,
  resolveImageGenerationDimensions,
  sanitizeAndPrepareImagePrompt,
  streamlinePromptForImageGen,
} from "@/lib/ai/imageGeneration";
import { runVisualQualityGate } from "@/lib/ai/visualQualityGate";
import { getCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import {
  getGenerationPreviewBesideSource,
  getGenerationPreviewBounds,
} from "@/lib/engine/generationPlacement";
import { preloadDataURL } from "@/lib/engine/imageCache";
import { getProcessingPreviewById } from "@/lib/engine/processingPreview";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import {
  visionCaption,
  visionDetect,
  visionOcr,
} from "@/lib/vision/visionEngine";
import { runBriefQualityGate } from "./briefQualityGate";
import type {
  CreativeOutputReview,
  CriterionEvidenceStatus,
} from "./creativeDirector";
import { deriveGeneratedImageName } from "./imageNaming";
import type { ComposerImageRef } from "./imageReferences";
import { decideRecovery, type RecoveryFailureKind } from "./recoveryPolicy";
import {
  type GeneratedOutputAnalysis,
  runGeneratedImageQualityGate,
} from "./resultQualityGate";
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
  fileId: string;
  dataUrl?: string;
  width: number;
  height: number;
};

export type ContextAwareImageTaskOptions = {
  signal?: AbortSignal;
  cloudConsent?: boolean;
  placement?: { outputIndex: number; requestedOutputCount: number };
  stageOnly?: boolean;
  analyzeOutput?: (
    dataURL: string,
    fileId: string,
    width: number,
    height: number,
    signal: AbortSignal,
    context?: { needDetection?: boolean; needOcr?: boolean },
  ) => Promise<GeneratedOutputAnalysis | undefined>;
  reviewOutput?: (input: {
    prompt: string;
    reviewCriteria: readonly string[];
    outputAnalysis: GeneratedOutputAnalysis;
    signal: AbortSignal;
  }) => Promise<CreativeOutputReview>;
  onUpdate?: (update: ContextAwareTaskUpdate) => void;
};

export async function runContextAwareImageTask(
  initialTask: AiTask,
  refs: readonly ComposerImageRef[],
  options: ContextAwareImageTaskOptions = {},
): Promise<ContextAwareTaskResult> {
  const signal = options.signal ?? new AbortController().signal;
  assertAiTaskHarness(initialTask);
  registerAiTask(initialTask);
  if (initialTask.cloudConsentRequired && options.cloudConsent !== true) {
    throw new Error(
      "Explicit cloud consent is required before starting this task",
    );
  }
  let task = initialTask;
  if (!task.history.some((event) => event.type === "intent.assessed")) {
    task = appendAiTaskEvent(task, { type: "intent.assessed", complete: true });
  }
  let inputImages: Array<{
    dataUrl: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
  }>;
  const effectiveRefs =
    refs && refs.length > 0 ? refs : (task.selectedImages ?? []);
  try {
    inputImages = resolveReferenceImages(effectiveRefs);
  } catch (error) {
    task = appendAiTaskEvent(task, {
      type: "task.failed",
      reason: "Selected reference was stale before execution",
    });
    task = transition(
      task,
      { type: "failed", reason: errorMessage(error) },
      options,
      {
        stage: "failed",
        message: `Task ไม่สำเร็จ: ${errorMessage(error)}`,
        attempt: task.attempt,
        quality: task.quality,
      },
    );
    throw attachTaskSnapshot(error, task);
  }
  const initialState = useEngine.getState();
  const initialSlide = initialState.currentSlide();
  const targetSnapshot = {
    docId: initialState.doc.id,
    slideId: initialState.currentSlideId,
    revision: initialState.doc.updatedAt,
  };
  let dimensions =
    task.requestedDimensions ?? resolveImageGenerationDimensions(task.prompt);
  if (
    !task.requestedDimensions &&
    effectiveRefs.length > 0 &&
    !hasExplicitDimensionsInText(task.prompt)
  ) {
    const source = resolveSourceElementBounds(effectiveRefs, initialSlide);
    if (source) {
      const ref0 = effectiveRefs[0] as {
        sourceWidth?: number;
        sourceHeight?: number;
      };
      const pw = ref0?.sourceWidth || source.width;
      const ph = ref0?.sourceHeight || source.height;
      dimensions = resolveDimensionsFromPixelSize(pw, ph);
    }
  }
  if (
    dimensions.width === 1024 &&
    dimensions.height === 1024 &&
    dimensions.aspectRatio === "1:1" &&
    hasExplicitDimensionsInText(task.prompt)
  ) {
    dimensions = resolveImageGenerationDimensions(task.prompt);
  }
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
  const sourceElement = resolveSourceElementBounds(effectiveRefs, initialSlide);
  const previewBounds = sourceElement
    ? getGenerationPreviewBesideSource(sourceElement, dimensions)
    : getGenerationPreviewBounds(viewport, dimensions);
  const previewLayout = sourceElement ? "anchor" : "center";
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

  const previewPlacement = computeMultiImagePlacement(
    previewBounds,
    options.placement,
    initialSlide?.width ?? 1920,
    initialSlide?.height ?? 1080,
    previewLayout,
  );

  const job = enqueueProcessingJob({
    signal,
    concurrent: true,
    preview: {
      kind: "generate",
      label: refs.length ? "Image Editor" : "Image Generator",
      x: previewPlacement.x,
      y: previewPlacement.y,
      width: previewPlacement.width,
      height: previewPlacement.height,
      progress: 0,
      sourceDataUrl: inputImages[0]?.dataUrl,
      message: "เตรียมพื้นที่ผลลัพธ์ใน Canvas…",
    },
    run: async (context) => {
      const executionSignal = context.signal;
      context.update({
        phase: "analyzing",
        progress: null,
        message: "กำลังวิเคราะห์บริบทของ Task ก่อนส่ง provider…",
      });
      for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
        throwIfAborted(executionSignal);
        const attemptPrompt = qualityRepairInstruction
          ? qualityRepairInstruction.startsWith("Streamlined prompt: ")
            ? qualityRepairInstruction.replace(/^Streamlined prompt:\s*/, "")
            : `${task.prompt}\n\nQuality repair instruction: ${qualityRepairInstruction}`
          : sanitizeAndPrepareImagePrompt(task.prompt);
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
              modelAlias: task.modelAlias,
              inputImages,
              cloudConsent: options.cloudConsent === true,
              enhance: false,
            },
            executionSignal,
          );
          throwIfAborted(executionSignal);

          // Native generation only — never Frame-crop to force aspect.
          // Requested size is sent upstream as custom WIDTHxHEIGHT / named ratio.
          const gateAspectRatio = dimensions.aspectRatio;

          const technicalGate = runVisualQualityGate({
            dataUrl: generated.dataUrl,
            prompt: task.prompt,
            width: generated.width,
            height: generated.height,
            outputCount: 1,
          });
          if (!technicalGate.passed) {
            qualityRepairInstruction = buildQualityRepairInstruction(
              technicalGate.blockers,
            );
            throw new Error(
              `Generated image failed the visual quality gate: ${technicalGate.blockers.join(" ")}`,
            );
          }
          const briefGate = runBriefQualityGate({
            prompt: task.prompt,
            outputWidth: generated.width,
            outputHeight: generated.height,
            outputCount: 1,
            requestedAspectRatio: gateAspectRatio,
            referenceCount: task.selectedImages.length,
            submittedReferenceCount: inputImages.length,
          });
          if (!briefGate.passed) {
            qualityRepairInstruction = buildQualityRepairInstruction(
              briefGate.blockers,
            );
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
          let technicalFallback = false;
          const requiresLocalOutputReview =
            Boolean(task.requiredSubjects?.length) ||
            Boolean(task.requiredText?.trim()) ||
            Boolean(task.reviewCriteria?.length) ||
            task.selectedImages.length > 0;
          if (requiresLocalOutputReview) {
            try {
              outputAnalysis = await (
                options.analyzeOutput ?? analyzeGeneratedOutput
              )(
                generated.dataUrl,
                generated.fileId,
                generated.width,
                generated.height,
                executionSignal,
                {
                  needDetection: Boolean(
                    task.requiredSubjects?.length ||
                    task.selectedImages.length > 0,
                  ),
                  needOcr: Boolean(task.requiredText?.trim()),
                },
              );
            } catch (error) {
              if (isAbortError(error)) throw error;
              technicalFallback = true;
              context.update({
                progress: 0.7,
                message:
                  "ตรวจภาพเชิงความหมายไม่ทันเวลา (Timeout 6s) จึงตัดเข้า Fallback ตรวจสอบขนาดและ Aspect Ratio ทางเทคนิค",
              });
            }
          } else {
            context.update({
              progress: 0.7,
              message:
                "ไม่มี hard semantic constraint จึงใช้การตรวจทางเทคนิคต่อ",
            });
          }
          const semanticGate = runGeneratedImageQualityGate({
            outputWidth: generated.width,
            outputHeight: generated.height,
            requestedAspectRatio: gateAspectRatio,
            requiredSubjects: task.requiredSubjects,
            requiredText: task.requiredText,
            referenceRequired: task.selectedImages.length > 0,
            referenceFacts: task.referenceFacts,
            outputAnalysis,
            technicalFallback,
          });
          if (!semanticGate.passed) {
            qualityRepairInstruction = buildQualityRepairInstruction(
              semanticGate.blockers,
            );
            throw new Error(
              `Generated image failed the semantic quality gate: ${semanticGate.blockers.join(" ")}`,
            );
          }
          if (task.reviewCriteria?.length) {
            if (outputAnalysis && options.reviewOutput) {
              const criteria = task.reviewCriteria ?? [];
              let directorReview: CreativeOutputReview | null = null;
              try {
                const REVIEW_TIMEOUT_MS = 3_500;
                let reviewTimer: ReturnType<typeof setTimeout> | undefined;
                const reviewTimeoutPromise = new Promise<never>((_, reject) => {
                  reviewTimer = setTimeout(() => {
                    reject(
                      new Error("Creative Director review pass timed out"),
                    );
                  }, REVIEW_TIMEOUT_MS);
                  executionSignal.addEventListener(
                    "abort",
                    () => clearTimeout(reviewTimer),
                    {
                      once: true,
                    },
                  );
                });
                const reviewExecutionPromise = (async () => {
                  try {
                    return await options.reviewOutput!({
                      prompt: task.prompt,
                      reviewCriteria: criteria,
                      outputAnalysis,
                      signal: executionSignal,
                    });
                  } finally {
                    if (reviewTimer) clearTimeout(reviewTimer);
                  }
                })();
                directorReview = await Promise.race([
                  reviewExecutionPromise,
                  reviewTimeoutPromise,
                ]);
              } catch (reviewError) {
                if (isAbortError(reviewError)) throw reviewError;
                console.warn(
                  "Creative Director review pass unavailable, continuing with validated output:",
                  reviewError,
                );
                task = appendAiTaskEvent(task, {
                  type: "director.reviewed",
                  passed: false,
                  status: "unavailable",
                  reason:
                    (reviewError as Error).message ||
                    "Creative Director review pass unavailable",
                  criteriaEvidence: criteria.map((criterion) => ({
                    criterion,
                    status: "unavailable" as CriterionEvidenceStatus,
                    notes: "Review service unavailable",
                  })),
                  attempt,
                });
              }
              if (directorReview) {
                task = appendAiTaskEvent(task, {
                  type: "director.reviewed",
                  passed: directorReview.passed,
                  status: directorReview.status ?? "reviewed",
                  criteriaEvidence:
                    directorReview.criteriaEvidence ??
                    criteria.map((criterion) => ({
                      criterion,
                      status: (directorReview!.passed
                        ? "passed"
                        : "failed") as CriterionEvidenceStatus,
                      notes: directorReview!.summary,
                    })),
                  attempt,
                });
                if (!directorReview.passed) {
                  qualityRepairInstruction = directorReview.repairInstruction;
                  throw new Error(
                    `Generated image failed the Creative Director review: ${directorReview.summary}`,
                  );
                }
              }
            }
          }
          task = appendAiTaskEvent(task, {
            type: "quality.checked",
            passed: true,
            attempt,
          });
          context.update({
            progress: 0.78,
            message: "ตรวจผลลัพธ์เทียบกับ brief แล้ว",
          });
          const preloaded = await preloadDataURL(generated.dataUrl);
          throwIfAborted(executionSignal);
          task = appendAiTaskEvent(task, {
            type: "preload.completed",
            attempt,
          });
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
          assertCommitTarget(
            state,
            targetSnapshot,
            refs,
            Boolean(task.imageRun),
          );
          if (!slide) throw new Error("ไม่พบ Canvas ที่กำลังใช้งาน");
          if (slide.layers.length === 0)
            throw new Error("ไม่พบ Layer สำหรับวางผลลัพธ์บน Canvas");
          const historyBeforeCommit = state.history.past.length;
          const currentPreview = getProcessingPreviewById(context.id);
          const currentViewport = getCanvasViewport() ?? viewport;
          const baseBounds = getGenerationPreviewBounds(
            {
              ...currentViewport,
              slideWidth: slide.width,
              slideHeight: slide.height,
            },
            { width: preloaded.width, height: preloaded.height },
          );
          const computedBounds = computeMultiImagePlacement(
            baseBounds,
            options.placement,
            slide.width,
            slide.height,
            previewLayout,
          );
          // Keep the committed image aligned with the stable generate preview.
          // Only re-size from the latest viewport when the user dragged the card.
          const finalBounds = currentPreview
            ? currentPreview.userDragged
              ? {
                  x: currentPreview.x,
                  y: currentPreview.y,
                  width: computedBounds.width,
                  height: computedBounds.height,
                }
              : {
                  x: currentPreview.x,
                  y: currentPreview.y,
                  width: currentPreview.width,
                  height: currentPreview.height,
                }
            : computedBounds;
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
          if (options.stageOnly) {
            task = appendAiTaskEvent(task, {
              type: "commit.completed",
              attempt,
            });
            task = appendAiTaskEvent(task, {
              type: "task.succeeded",
              summary:
                "Generated image passed quality, preload, and staged for user preview",
            });
            task = transition(task, { type: "succeeded" }, options, {
              stage: "succeeded",
              message: `สร้างตัวเลือกภาพสำเร็จ (${preloaded.width} × ${preloaded.height}px) พร้อมให้พรีวิว`,
              attempt,
              quality: task.quality,
            });
            context.update({
              progress: 1,
              message: "สร้างตัวเลือกภาพสำเร็จ พร้อมให้พรีวิว",
            });
            committed = {
              task,
              elementId: `staged-${preloaded.fileId}`,
              fileId: preloaded.fileId,
              dataUrl: preloaded.dataURL,
              width: preloaded.width,
              height: preloaded.height,
            };
            return;
          }

          const elementName = deriveGeneratedImageName(
            task.summary,
            task.prompt,
          );
          const element = createImage({
            x: finalBounds.x,
            y: finalBounds.y,
            width: finalBounds.width,
            height: finalBounds.height,
            fileId: preloaded.fileId,
            naturalWidth: preloaded.width,
            naturalHeight: preloaded.height,
            name: elementName,
            sourceName: elementName,
          });
          state.addElement(element, `AI task ${task.id} generate image`);
          const afterCommit = useEngine.getState();
          const inserted = afterCommit
            .currentSlide()
            ?.elements.some(
              (candidate) =>
                candidate.id === element.id && !candidate.isDeleted,
            );
          if (
            !inserted ||
            afterCommit.history.past.length !== historyBeforeCommit + 1
          ) {
            throw new Error("Canvas commit was not applied atomically");
          }
          task = appendAiTaskEvent(task, { type: "commit.completed", attempt });
          state.selectOnly([element.id]);
          task = appendAiTaskEvent(task, {
            type: "task.succeeded",
            summary:
              "Generated image passed quality, preload, and atomic commit checks",
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
            fileId: preloaded.fileId,
            dataUrl: preloaded.dataURL,
            width: preloaded.width,
            height: preloaded.height,
          };
          return;
        } catch (error) {
          lastError = error;
          if (isAbortError(error)) throw error;
          const kind = classifyFailure(error);
          if (kind === "quality" && !qualityRepairInstruction) {
            qualityRepairInstruction = buildQualityRepairInstruction([
              errorMessage(error),
            ]);
          }
          if (kind === "provider_error") {
            if (isAlreadyOrchestratedPrompt(task.prompt)) {
              // Preserves the refined 2D flat artwork prompt; attempt 2 drops inputImages to self-heal
              qualityRepairInstruction = undefined;
            } else if (attempt === 1) {
              const streamlined = streamlinePromptForImageGen(task.prompt);
              qualityRepairInstruction = `Streamlined prompt: ${streamlined}`;
            } else {
              const minimal =
                cleanImagePrompt(task.prompt) ||
                "flat 2D graphic design artwork";
              qualityRepairInstruction = `Streamlined prompt: ${minimal}`;
            }
          }
          if (kind === "quality") {
            task = appendAiTaskEvent(task, {
              type: "quality.checked",
              passed: false,
              attempt,
            });
          }
          const recovery = decideRecovery({
            kind,
            attempt,
            maxAttempts: task.maxAttempts,
          });
          task = appendAiTaskEvent(task, {
            type: "recovery.decided",
            action: recovery.action,
            reason: recovery.reason,
          });
          if (
            recovery.action === "outcome-unknown" ||
            recovery.action === "resume"
          ) {
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
              {
                type: "outcome-unknown",
                reason: "provider result could not be confirmed",
              },
              options,
              {
                stage: "outcome-unknown",
                message:
                  "ผลลัพธ์จาก AI provider ยังยืนยันไม่ได้ จึงไม่สร้างคำขอซ้ำ",
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
            task = transition(
              task,
              { type: "failed", reason: errorMessage(error) },
              options,
              {
                stage: "failed",
                message: `ครั้งที่ ${attempt} ไม่ผ่าน: ${recovery.reason}`,
                attempt,
                quality: task.quality,
              },
            );
            task = transition(
              task,
              { type: "retry", reason: recovery.reason },
              options,
              {
                stage: "retrying",
                message:
                  kind === "provider_error"
                    ? `รอบก่อนหน้าไม่สำเร็จ ระบบกำลังปรับปรุงคำขออัตโนมัติและสร้างภาพใหม่ (ครั้งที่ ${recovery.nextAttempt}/${task.maxAttempts})…`
                    : `กำลังแก้ปัญหาและลองใหม่: ${recovery.reason}`,
                attempt,
                quality: task.quality,
              },
            );
            context.update({
              progress: 0,
              message:
                kind === "provider_error"
                  ? `รอบก่อนหน้าไม่สำเร็จ ระบบกำลังปรับปรุงคำขออัตโนมัติและสร้างภาพใหม่ (ครั้งที่ ${recovery.nextAttempt}/${task.maxAttempts})…`
                  : `กำลังแก้ปัญหาและลองใหม่…`,
            });
            continue;
          }
          task = appendAiTaskEvent(task, {
            type: "task.failed",
            reason: "Task execution failed before commit",
          });
          task = transition(
            task,
            { type: "failed", reason: errorMessage(error) },
            options,
            {
              stage: "failed",
              message: `Task ไม่สำเร็จ: ${errorMessage(error)}`,
              attempt,
              quality: task.quality,
            },
          );
          throw attachTaskSnapshot(error, task);
        }
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
      task = transition(
        task,
        { type: "cancelled", reason: "ผู้ใช้ยกเลิก" },
        options,
        {
          stage: "cancelled",
          message: "ยกเลิก Task แล้ว และไม่มีการเปลี่ยนแปลงบน Canvas",
          attempt: task.attempt,
          quality: task.quality,
        },
      );
      throw attachTaskSnapshot(error, task);
    }
    throw error;
  }
  if (signal.aborted) {
    task = appendAiTaskEvent(task, {
      type: "task.cancelled",
      reason: "Task cancelled before queue execution",
    });
    task = transition(
      task,
      { type: "cancelled", reason: "ผู้ใช้ยกเลิกก่อนเริ่มงาน" },
      options,
      {
        stage: "cancelled",
        message: "ยกเลิก Task ที่รอคิวแล้ว และไม่มีการเปลี่ยนแปลงบน Canvas",
        attempt: task.attempt,
        quality: task.quality,
      },
    );
    throw attachTaskSnapshot(createAbortError(), task);
  }
  if (!committed)
    throw lastError instanceof Error
      ? lastError
      : new Error("AI Task ไม่ได้สร้างผลลัพธ์");
  return committed;
}

function resolveReferenceImages(
  refs: ReadonlyArray<ComposerImageRef | AiTask["selectedImages"][number]>,
): Array<{
  dataUrl: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}> {
  if (refs.length === 0) return [];
  const slide = useEngine.getState().currentSlide();
  return refs.map((ref) => {
    const element = slide?.elements.find(
      (candidate) => candidate.id === ref.objectId,
    );
    const elFileId =
      element && "fileId" in element
        ? (element as any).fileId
        : element && "imageFileId" in element
          ? (element as any).imageFileId
          : undefined;
    if (
      (element?.type !== "image" &&
        element?.type !== "bookMockup" &&
        element?.type !== "frame") ||
      element?.version !== ref.elementVersion ||
      elFileId !== ref.fileId
    ) {
      throw new Error(
        `selected image changed before execution: ${ref.displayName}`,
      );
    }
    const composerRef: ComposerImageRef =
      "sourceWidth" in ref
        ? ref
        : {
            objectId: ref.objectId,
            elementVersion: ref.elementVersion,
            fileId: ref.fileId,
            displayName: ref.displayName,
            sourceWidth: element.width,
            sourceHeight: element.height,
            width: element.width,
            height: element.height,
            angle: element.angle ?? 0,
          };
    const rendered = renderVisibleReference(composerRef);
    const mimeType = rendered.dataUrl.match(
      /^data:(image\/(?:png|jpeg|webp));base64,/u,
    )?.[1] as "image/png" | "image/jpeg" | "image/webp" | undefined;
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
  allowPeerDocRevision = false,
): void {
  if (
    state.doc.id !== snapshot.docId ||
    state.currentSlideId !== snapshot.slideId ||
    (!allowPeerDocRevision && state.doc.updatedAt !== snapshot.revision)
  ) {
    throw new Error(
      "Canvas target changed before commit; please resend the task",
    );
  }
  const slide = state.currentSlide();
  if (!slide) throw new Error("Canvas target disappeared before commit");
  for (const ref of refs) {
    const element = slide.elements.find(
      (candidate) => candidate.id === ref.objectId,
    );
    const elFileId =
      element && "fileId" in element
        ? (element as any).fileId
        : element && "imageFileId" in element
          ? (element as any).imageFileId
          : undefined;
    if (
      (element?.type !== "image" &&
        element?.type !== "bookMockup" &&
        element?.type !== "frame") ||
      element.version !== ref.elementVersion ||
      elFileId !== ref.fileId
    ) {
      throw new Error(
        `selected image changed before commit: ${ref.displayName}`,
      );
    }
  }
}

export function classifyFailure(error: unknown): RecoveryFailureKind {
  if (isOutcomeUnknownError(error)) return "polling";
  const message = errorMessage(error).toLocaleLowerCase();
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code).toUpperCase()
      : "";
  if (
    errorCode === "POLICY_DENIED" ||
    errorCode === "CONTENT_POLICY_VIOLATION" ||
    /safety|nsfw|sensitive|policy|flagged|copyright|trademark|content filter|violated|violation/i.test(
      message,
    )
  )
    return "safety";
  if (
    message.includes("provider") &&
    (message.includes("credential") ||
      message.includes("auth") ||
      message.includes("key"))
  )
    return "auth";
  if (
    message.includes("canvas target") ||
    message.includes("selected image changed") ||
    message.includes("commit was not applied")
  )
    return "invalid_input";
  if (message.includes("invalid") || message.includes("unsupported"))
    return "invalid_input";
  if (message.includes("budget") || message.includes("cost")) return "budget";
  if (
    message.includes("quality gate") ||
    message.includes("brief") ||
    message.includes("creative director review")
  )
    return "quality";
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("500") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("provider_unavailable") ||
    message.includes("failed with status 502") ||
    message.includes("failed with status 504") ||
    message.includes("image generation failed") ||
    message.includes("please try again") ||
    message.includes("generation failed") ||
    message.includes("replicate prediction failed") ||
    message.includes("ai image studio failed")
  )
    return "provider_error";
  if (
    message.includes("network") ||
    message.includes("reach") ||
    message.includes("timeout")
  )
    return "network";
  return "capability";
}

function buildQualityRepairInstruction(blockers: readonly string[]): string {
  const diagnosis = blockers
    .join(" ")
    .replace(
      /data:image\/[^\s]+|https?:\/\/[^\s]+|bearer\s+\S+/giu,
      "[REDACTED]",
    )
    .slice(0, 360);
  return `Regenerate with a materially different composition and correct the prior quality-gate finding: ${diagnosis}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

async function analyzeGeneratedOutput(
  dataURL: string,
  _fileId: string,
  _width: number,
  _height: number,
  signal: AbortSignal,
  taskContext?: {
    needDetection?: boolean;
    needOcr?: boolean;
  },
): Promise<GeneratedOutputAnalysis> {
  throwIfAborted(signal);

  const LOCAL_VISION_TIMEOUT_MS = 6_000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Local vision output analysis timed out"));
    }, LOCAL_VISION_TIMEOUT_MS);
    signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  });

  const analysisPromise = (async () => {
    try {
      const needDetection = taskContext?.needDetection ?? true;
      const needOcr = taskContext?.needOcr ?? true;

      const [caption, detection, visibleText] = await Promise.all([
        visionCaption(dataURL, "normal"),
        needDetection
          ? visionDetect(dataURL)
          : Promise.resolve({ objects: [] }),
        needOcr ? visionOcr(dataURL) : Promise.resolve(""),
      ]);
      throwIfAborted(signal);
      return {
        caption: caption.trim(),
        objects: detection.objects
          .map((object) => object.label.trim())
          .filter(Boolean)
          .slice(0, 50),
        visibleText: visibleText.trim(),
        limitations: [],
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  return Promise.race([analysisPromise, timeoutPromise]);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
  error.name = "AbortError";
  throw error;
}

function attachTaskSnapshot(error: unknown, task: AiTask): Error {
  const target = error instanceof Error ? error : new Error("AI task failed.");
  Object.defineProperty(target, "task", {
    value: task,
    enumerable: false,
    configurable: false,
  });
  return target;
}

function createOutcomeUnknownError(task: AiTask, predictionId?: string): Error {
  const error = new Error(
    "AI provider result is uncertain; no duplicate request was created.",
  );
  error.name = "OutcomeUnknownError";
  if (predictionId)
    Object.defineProperty(error, "predictionId", { value: predictionId });
  return attachTaskSnapshot(error, task);
}

function createAbortError(): Error {
  const error = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
  error.name = "AbortError";
  return error;
}

function isOutcomeUnknownError(
  error: unknown,
): error is Error & { predictionId?: string } {
  return error instanceof Error && error.name === "OutcomeUnknownError";
}

function predictionIdFromError(error: unknown): string | undefined {
  if (!isOutcomeUnknownError(error)) return undefined;
  return typeof error.predictionId === "string" &&
    error.predictionId.length <= 256
    ? error.predictionId
    : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function resolveSourceElementBounds(
  refs: ReadonlyArray<ComposerImageRef | AiTask["selectedImages"][number]>,
  slide: ReturnType<ReturnType<typeof useEngine.getState>["currentSlide"]> | null | undefined,
): { x: number; y: number; width: number; height: number } | null {
  const first = refs[0];
  if (!first || !slide) return null;
  const element = slide.elements.find(
    (candidate) => candidate.id === first.objectId && !candidate.isDeleted,
  );
  if (!element || element.width <= 0 || element.height <= 0) return null;
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

export function computeMultiImagePlacement(
  baseBounds: { x: number; y: number; width: number; height: number },
  placement: { outputIndex: number; requestedOutputCount: number } | undefined,
  slideWidth: number,
  slideHeight: number,
  layout: "center" | "anchor" = "center",
): { x: number; y: number; width: number; height: number } {
  if (!placement || placement.requestedOutputCount <= 1) {
    return baseBounds;
  }

  const count = Math.max(
    1,
    Math.min(5, Math.floor(placement.requestedOutputCount)),
  );
  const rawIndex = placement.outputIndex ?? 1;
  const zeroIndex = rawIndex >= 1 ? rawIndex - 1 : rawIndex;
  const index = Math.max(0, Math.min(count - 1, Math.floor(zeroIndex)));

  const aspectRatio =
    baseBounds.height > 0 ? baseBounds.width / baseBounds.height : 1;
  const padding = 32;
  const gap = count > 3 ? 20 : 28;

  const maxAvailW = Math.max(100, slideWidth - padding * 2);
  const maxAvailH = Math.max(100, slideHeight - padding * 2);

  let targetW = baseBounds.width;
  let targetH = baseBounds.height;

  const totalGap = (count - 1) * gap;
  const maxWPerItem = (maxAvailW - totalGap) / count;

  if (targetW > maxWPerItem) {
    targetW = maxWPerItem;
    targetH = targetW / aspectRatio;
  }

  if (targetH > maxAvailH * 0.85) {
    targetH = maxAvailH * 0.85;
    targetW = targetH * aspectRatio;
  }

  const totalRowW = count * targetW + totalGap;
  const startX =
    layout === "anchor"
      ? baseBounds.x
      : Math.max(padding, (slideWidth - totalRowW) / 2);
  const startY =
    layout === "anchor"
      ? baseBounds.y
      : Math.max(padding, (slideHeight - targetH) / 2);

  const x = Math.round(startX + index * (targetW + gap));
  const y = Math.round(startY);

  return {
    x,
    y,
    width: Math.round(targetW),
    height: Math.round(targetH),
  };
}
