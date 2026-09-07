import {
  GPT_IMAGE_2_ESTIMATED_COST_USD,
  isImageGenerationPrompt,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";
import { planVisualRequest } from "@/lib/ai/visualOrchestrator";
import { type CanvasInspection, inspectCanvas } from "./canvasInspector";
import {
  CREATING_MODEL_CATALOG,
  detectRequestedCreatingModel,
  resolveCreatingModel,
} from "./creatingModelCatalog";
import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./harnessPolicy";
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
  clarification?: {
    originalPrompt?: string;
    question: string;
    optionIds: readonly string[];
  };
  clarificationRound?: number;
};

export type ContextAwareTurnResult =
  | { kind: "answer"; reply: string; source: "canvas-local" }
  | { kind: "continue"; analyses: ImageReferenceAnalysis[] }
  | { kind: "clarification"; pending: PendingClarification }
  | { kind: "capability-unavailable"; capability: string; reason: string; reply: string }
  | { kind: "task"; task: AiTask };

export function isCanvasInventoryPrompt(prompt: string): boolean {
  const value = prompt.trim().toLocaleLowerCase();
  return (
    /^(?:ช่วย|กรุณา)?\s*(?:บอก|แสดง|ตรวจสอบ|เช็ค|ดู)?\s*(?:ว่า)?\s*(?:บน|ใน)\s*canvas\s*(?:มีอะไร|มี object|มีอ็อบเจ็กต์|มีอะไรอยู่)/iu.test(
      value,
    ) ||
    /(?:มีอะไรอยู่บน|มีอะไรใน)\s*canvas/iu.test(value) ||
    /^(?:what(?:\s+is|'s)|list|show|count)\b.*\b(?:on|in)\s+the\s+canvas\b/iu.test(value) ||
    /^(?:canvas inventory|inventory of the canvas)\b/iu.test(value)
  );
}

export function prepareContextAwareTurn(input: ContextAwareTurnInput): ContextAwareTurnResult {
  if (isCanvasInventoryPrompt(input.prompt) && input.canvas) {
    const inspection: CanvasInspection = inspectCanvas(input.canvas);
    return { kind: "answer", reply: inspection.reply, source: "canvas-local" };
  }

  const requestedModel = detectRequestedCreatingModel(input.prompt);
  const requestsModelExecution =
    requestedModel !== undefined &&
    /(?:สร้าง|วาด|ออกแบบ|generate|create|edit|แก้(?:ไข)?(?:ภาพ|รูป)?)/iu.test(input.prompt);
  if (requestedModel && requestsModelExecution) {
    const requestedCapability = input.refs.length > 0 ? "edit" : "generate";
    const modelResolution = resolveCreatingModel(requestedCapability, requestedModel);
    if (!modelResolution.ok) {
      const model = CREATING_MODEL_CATALOG.find((entry) => entry.alias === requestedModel);
      return {
        kind: "capability-unavailable",
        capability: requestedModel,
        reason: model?.notes ?? modelResolution.reason,
        reply: `ยังไม่สร้าง Task ครับ เพราะ Model ${requestedModel} ยังไม่พร้อมสำหรับงานนี้ และ ArtShift จะไม่เปลี่ยนไปใช้ Model อื่นโดยไม่บอก`,
      };
    }
  }

  if (!isImageGenerationPrompt(input.prompt) && input.refs.length === 0) {
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
  const canvasInspection = input.canvas ? inspectCanvas(input.canvas) : undefined;
  const assessment = assessImageIntent({
    prompt: input.prompt,
    analyses,
    hasSelection: input.refs.length > 0 || Boolean(input.selectedIds?.size),
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

  const visualPlan = planVisualRequest(input.prompt, {
    hasSelection: input.refs.length > 0,
    selectedObjectCount: input.refs.length,
    hasReference: input.refs.length > 0,
  });
  if (!visualPlan.capabilityAvailable) {
    return {
      kind: "capability-unavailable",
      capability: visualPlan.capabilityAlias,
      reason: visualPlan.reason,
      reply: `ยังไม่สร้าง Task ครับ เพราะความสามารถ ${visualPlan.capabilityAlias} ยังไม่พร้อมใช้งานใน runtime นี้`,
    };
  }

  const taskBriefPrompt = input.clarification?.originalPrompt ?? input.prompt;
  const taskClass = input.refs.length > 0 || taskBriefPrompt.length > 100 ? "complex" : "simple";
  const quality = chooseImageQuality({
    prompt: input.prompt,
    taskClass,
    hasReference: input.refs.length > 0,
    requiresExactText: /(?:ข้อความ|ตัวอักษร|headline|typography)/iu.test(input.prompt),
    finalUse: /(?:final|production|print|พิมพ์|ใช้งานจริง)/iu.test(input.prompt),
  });
  const requiredText = extractRequiredText(input.prompt);
  const requestedDimensions = resolveImageGenerationDimensions(input.prompt);
  const requiredSubjects = [
    ...new Set(input.analyses.flatMap((analysis) => analysis.objects)),
  ].slice(0, 3);
  const plan: AiTaskPlan = {
    id: crypto.randomUUID(),
    prompt: input.prompt,
    subAgent: input.refs.length > 0 ? "image_editor" : "image_generator",
    capability: visualPlan.capabilityAlias,
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
    estimatedMaxCostUsd: GPT_IMAGE_2_ESTIMATED_COST_USD * quality.maxAttempts,
    requestedDimensions,
    harnessVersion: ARTSHIFT_HARNESS_VERSION,
    harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
    ...(requiredSubjects.length > 0 ? { requiredSubjects } : {}),
    ...(requiredText ? { requiredText } : {}),
    ...(input.analyses.length > 0
      ? {
          referenceFacts: input.analyses.map((analysis) => ({
            objectId: analysis.ref.objectId,
            caption: analysis.caption,
            objects: analysis.objects,
            visibleText: analysis.visibleText,
            limitations: analysis.limitations,
          })),
        }
      : {}),
  };
  const task = createAiTask({
    ...plan,
    preTaskTrace: [
      ...(canvasInspection
        ? [
            {
              type: "context.inspected" as const,
              objectCount: canvasInspection.objectCount,
              selectedCount: canvasInspection.selectedCount,
            },
          ]
        : []),
      ...(input.refs.length > 0
        ? [
            { type: "reference.analysis.started" as const, count: input.refs.length },
            { type: "reference.analysis.completed" as const, count: input.analyses.length },
          ]
        : []),
      ...(input.clarification
        ? [
            {
              type: "clarification.requested" as const,
              question: input.clarification.question,
              optionIds: [...input.clarification.optionIds],
            },
          ]
        : []),
      { type: "intent.assessed" as const, complete: true },
    ],
  });
  return { kind: "task", task };
}

function extractRequiredText(prompt: string): string | undefined {
  const quoted = prompt.match(
    /(?:ข้อความ|ตัวอักษร|headline|text|คำว่า|เขียนว่า)\s*[:：]?\s*["“”']([^"“”']{1,240})["“”']/iu,
  );
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const unquoted = prompt.match(/(?:headline|text|คำว่า|เขียนว่า)\s*[:：]\s*([^\n,]{1,240})/iu);
  return unquoted?.[1]?.trim() || undefined;
}
