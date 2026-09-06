import { type CanvasInspection, inspectCanvas } from "./canvasInspector";
import { chooseImageQuality } from "./imageQualityPolicy";
import type { ComposerImageRef } from "./imageReferences";
import {
  assessImageIntent,
  type ClarificationOption,
  type IntentAnalysis,
} from "./intentCompleteness";
import type { ImageReferenceAnalysis } from "./referenceAnalysis";
import { type AiTask, type AiTaskPlan, createAiTask } from "./taskMachine";

export type PendingClarification = {
  id: string;
  originalPrompt: string;
  selectedImages: ComposerImageRef[];
  analyses: ImageReferenceAnalysis[];
  question: string;
  options: ClarificationOption[];
  round: number;
};

export type ContextAwareTurnInput = {
  prompt: string;
  refs: readonly ComposerImageRef[];
  analyses: readonly ImageReferenceAnalysis[];
  selectedIds?: ReadonlySet<string>;
  canvas?: Parameters<typeof inspectCanvas>[0];
  clarificationRound?: number;
};

export type ContextAwareTurnResult =
  | { kind: "answer"; reply: string; source: "canvas-local" }
  | { kind: "continue"; analyses: ImageReferenceAnalysis[] }
  | { kind: "clarification"; pending: PendingClarification }
  | { kind: "task"; task: AiTask };

export function isCanvasInventoryPrompt(prompt: string): boolean {
  const value = prompt.toLocaleLowerCase();
  return (
    value.includes("บน canvas") ||
    value.includes("ใน canvas") ||
    value.includes("canvas มีอะไร") ||
    value.includes("what is on the canvas") ||
    value.includes("canvas inventory") ||
    value.includes("object บน")
  );
}

export function prepareContextAwareTurn(input: ContextAwareTurnInput): ContextAwareTurnResult {
  if (isCanvasInventoryPrompt(input.prompt) && input.canvas) {
    const inspection: CanvasInspection = inspectCanvas(input.canvas);
    return { kind: "answer", reply: inspection.reply, source: "canvas-local" };
  }

  if (!isImageGenerationRequest(input.prompt) && input.refs.length === 0) {
    return { kind: "continue", analyses: [] };
  }
  if (input.refs.length > 0 && input.analyses.length !== input.refs.length) {
    throw new Error("selected image analysis must complete before planning the task");
  }

  const analyses: IntentAnalysis[] = input.analyses.map((analysis) => ({
    caption: analysis.caption,
    objects: analysis.objects,
    visibleText: analysis.visibleText,
  }));
  const assessment = assessImageIntent({
    prompt: input.prompt,
    analyses,
    hasSelection: input.refs.length > 0,
  });
  const round = input.clarificationRound ?? 0;
  if (assessment.kind === "clarification" && round < 2) {
    return {
      kind: "clarification",
      pending: {
        id: crypto.randomUUID(),
        originalPrompt: input.prompt,
        selectedImages: input.refs.map((ref) => ({ ...ref })),
        analyses: input.analyses.map((analysis) => ({ ...analysis, ref: { ...analysis.ref } })),
        question: assessment.question,
        options: assessment.options,
        round: round + 1,
      },
    };
  }

  const taskClass = input.refs.length > 0 || input.prompt.length > 100 ? "complex" : "simple";
  const quality = chooseImageQuality({
    prompt: input.prompt,
    taskClass,
    hasReference: input.refs.length > 0,
    requiresExactText: /(?:ข้อความ|ตัวอักษร|headline|typography)/iu.test(input.prompt),
    finalUse: /(?:final|production|print|พิมพ์|ใช้งานจริง)/iu.test(input.prompt),
  });
  const plan: AiTaskPlan = {
    id: crypto.randomUUID(),
    prompt: input.prompt,
    subAgent: input.refs.length > 0 ? "image_editor" : "image_generator",
    capability: "IMAGE_DEFAULT",
    quality: quality.quality,
    qualityRationale: quality.rationale,
    maxAttempts: quality.maxAttempts,
    selectedImages: input.refs.map((ref) => ({
      objectId: ref.objectId,
      elementVersion: ref.elementVersion,
      fileId: ref.fileId,
      displayName: ref.displayName,
    })),
    analysisComplete: input.refs.length === 0 || input.analyses.length === input.refs.length,
    cloudConsentRequired: true,
    estimatedMaxCostUsd: quality.quality === "high" ? 0.05 : 0.02,
  };
  return { kind: "task", task: createAiTask(plan) };
}

function isImageGenerationRequest(prompt: string): boolean {
  const value = prompt.toLocaleLowerCase();
  return (
    value.includes("สร้างรูป") ||
    value.includes("สร้างภาพ") ||
    value.includes("วาดรูป") ||
    value.includes("วาดภาพ") ||
    value.includes("generate image") ||
    value.includes("create image") ||
    value.includes("picture of") ||
    value.includes("image of")
  );
}
