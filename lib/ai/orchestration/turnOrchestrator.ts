import {
  GPT_IMAGE_2_ESTIMATED_COST_USD,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";
import { type CanvasInspection, inspectCanvas } from "./canvasInspector";
import {
  applyCreativeDirectionToTask,
  type CreativeDirection,
  parseCreativeDirection,
} from "./creativeDirector";
import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./harnessPolicy";
import { chooseImageQuality } from "./imageQualityPolicy";
import type { ComposerImageRef } from "./imageReferences";
import type { ClarificationOption } from "./intentCompleteness";
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
  | { kind: "director-ready"; input: ContextAwareTurnInput };

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

  if (input.refs.length !== input.analyses.length) {
    throw new Error("selected image analysis must complete before planning the task");
  }
  return { kind: "director-ready", input };
}

// Only the validated Director decision may cross the task-creation boundary.
export function createDirectedImageTask(
  input: ContextAwareTurnInput,
  direction: Extract<CreativeDirection, { kind: "image-task" }>,
): AiTask {
  const validated = parseCreativeDirection(
    direction,
    {
      prompt: input.prompt,
      canvasSummary: { objectCount: 0, selectedCount: input.refs.length, width: 1, height: 1 },
      referenceAnalyses: input.analyses,
      availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
    },
    direction.knowledgeSkillIds,
  );
  if (validated.kind !== "image-task" || validated.search.required) {
    throw new Error("Creative Director context search must complete before task creation");
  }
  if (input.refs.length !== input.analyses.length) {
    throw new Error("selected image analysis must complete before planning the task");
  }
  const canvasInspection = input.canvas ? inspectCanvas(input.canvas) : undefined;
  const taskClass = input.refs.length > 0 ? "complex" : "simple";
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
    capability: direction.capability,
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
  return applyCreativeDirectionToTask(task, validated);
}

function extractRequiredText(prompt: string): string | undefined {
  const quoted = prompt.match(
    /(?:ข้อความ|ตัวอักษร|headline|text|คำว่า|เขียนว่า)\s*[:：]?\s*["“”']([^"“”']{1,240})["“”']/iu,
  );
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const unquoted = prompt.match(/(?:headline|text|คำว่า|เขียนว่า)\s*[:：]\s*([^\n,]{1,240})/iu);
  return unquoted?.[1]?.trim() || undefined;
}
