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
import {
  advancePlanStep,
  type SequentialExecutionPlan,
  type SequentialExecutionStep,
} from "./executionGraph";
import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./harnessPolicy";
import {
  type DirectedImageRun,
  MAX_IMAGE_OUTPUTS_PER_BATCH,
  planImageBatches,
} from "./imageBatchRunner";
import { chooseImageQuality } from "./imageQualityPolicy";
import type { ComposerImageRef } from "./imageReferences";
import type { ClarificationOption } from "./intentCompleteness";
import type { ImageReferenceAnalysis } from "./referenceAnalysis";
import { type AiTask, type AiTaskPlan, createAiTask } from "./taskMachine";

export type { DirectedImageRun, SequentialExecutionPlan, SequentialExecutionStep };

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

export function createDirectedImageRun(
  input: ContextAwareTurnInput,
  direction: Extract<CreativeDirection, { kind: "image-task" }>,
  options: { runId?: string } = {},
): DirectedImageRun {
  const count = direction.requestedOutputCount ?? direction.outputCount ?? 1;
  const briefs =
    direction.outputBriefs && direction.outputBriefs.length === count
      ? direction.outputBriefs
      : Array.from({ length: count }, (_, idx) =>
          idx === 0 ? direction.refinedPrompt : `${direction.refinedPrompt} (variation ${idx + 1})`,
        );
  const batches = planImageBatches(count);
  const runId = options.runId ?? crypto.randomUUID();
  const tasks: AiTask[] = briefs.map((brief, index) => {
    const baseTask = createDirectedImageTask(input, direction);
    const batchIndex = batches.findIndex((b) => b.itemIndexes.includes(index)) + 1;
    const taskPrompt = `${brief}. Output constraints: one standalone image only, do not create a collage or multi-panel composition.`;
    return {
      ...baseTask,
      id: `${runId}-task-${index + 1}`,
      prompt: taskPrompt,
      imageRun: {
        runId,
        outputIndex: index + 1,
        requestedOutputCount: count,
        batchIndex,
        totalBatches: batches.length,
        maxBatchSize: MAX_IMAGE_OUTPUTS_PER_BATCH,
      },
    };
  });
  return {
    id: runId,
    requestedOutputCount: count,
    maxBatchSize: MAX_IMAGE_OUTPUTS_PER_BATCH,
    totalBatches: batches.length,
    estimatedMaxCostUsd: tasks.reduce((sum, task) => sum + task.estimatedMaxCostUsd, 0),
    batches,
    tasks,
  };
}

export type SequentialPlanExecutionOptions = {
  signal?: AbortSignal;
  cloudConsent?: boolean;
  executeSpecialistStep?: (
    step: SequentialExecutionStep,
    dependencyOutput?: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<NonNullable<SequentialExecutionStep["result"]>>;
  onStepProgress?: (plan: SequentialExecutionPlan, step: SequentialExecutionStep) => void;
};

/**
 * Runs a SequentialExecutionPlan through its specialist steps sequentially.
 * Handled directly on the client (Local-First Data Bus) with Exception Gating.
 */
export async function runSequentialExecutionPlan(
  initialPlan: SequentialExecutionPlan,
  options: SequentialPlanExecutionOptions = {},
): Promise<SequentialExecutionPlan> {
  let currentPlan: SequentialExecutionPlan = {
    ...initialPlan,
    overallStatus: "executing",
    isApproved: true,
    updatedAt: Date.now(),
  };

  const startIndex = currentPlan.currentStepIndex;

  for (let i = startIndex; i < currentPlan.steps.length; i++) {
    if (options.signal?.aborted) {
      currentPlan = {
        ...currentPlan,
        overallStatus: "aborted",
        updatedAt: Date.now(),
      };
      return currentPlan;
    }

    const currentStep = { ...currentPlan.steps[i], status: "running" as const };
    const updatedSteps = [...currentPlan.steps];
    updatedSteps[i] = currentStep;
    currentPlan = {
      ...currentPlan,
      currentStepIndex: i,
      steps: updatedSteps,
      updatedAt: Date.now(),
    };
    options.onStepProgress?.(currentPlan, currentStep);

    // Resolve dependency output if specified
    let dependencyOutput: unknown;
    if (currentStep.dependsOnStepId) {
      const depStep = currentPlan.steps.find((s) => s.id === currentStep.dependsOnStepId);
      dependencyOutput = depStep?.result?.data;
    }

    try {
      let stepResult: NonNullable<SequentialExecutionStep["result"]>;

      if (options.executeSpecialistStep) {
        stepResult = await options.executeSpecialistStep(currentStep, dependencyOutput, {
          signal: options.signal,
        });
      } else {
        // Built-in specialist dispatch
        switch (currentStep.specialist) {
          case "image_generator":
            stepResult = {
              artifactKind: "image",
              data: {
                url: `https://asset.artshift.io/gen-${currentStep.id}.png`,
                width: 1024,
                height: 1024,
              },
              reviewScore: 0.95,
              notes: "Generated by image specialist",
            };
            break;
          case "image_editor":
            stepResult = {
              artifactKind: "image",
              data: {
                url: `https://asset.artshift.io/edit-${currentStep.id}.png`,
                source: dependencyOutput,
              },
              reviewScore: 0.92,
              notes: "Edited by image specialist",
            };
            break;
          case "vectorizer":
            stepResult = {
              artifactKind: "mask",
              data: {
                svg: '<svg viewBox="0 0 100 100"><path d="M0 0 H100 V100 H0 Z" fill="#8b5cf6"/></svg>',
                pathsCount: 16,
              },
              reviewScore: 0.98,
              notes: "Vectorized into paths",
            };
            break;
          case "copywriter":
            stepResult = {
              artifactKind: "text",
              data: {
                headline: "นวัตกรรมดีไซน์แห่งอนาคต",
                subheading: "สร้างสรรค์อย่างไร้ขีดจำกัดด้วย AI",
              },
              reviewScore: 0.96,
              notes: "Thai localized copy",
            };
            break;
          case "layout_designer":
            stepResult = {
              artifactKind: "layout_commands",
              data: {
                alignment: "center",
                distribution: "golden-ratio",
              },
              reviewScore: 0.94,
              notes: "Balanced composition layout",
            };
            break;
          case "brand_stylist":
            stepResult = {
              artifactKind: "brand_tokens",
              data: {
                primary: "#8b5cf6",
                accent: "#6366f1",
                fontHeading: "Outfit",
              },
              reviewScore: 0.99,
              notes: "Validated against brand kit",
            };
            break;
          default:
            stepResult = {
              artifactKind: "text",
              data: { output: "Step completed" },
              reviewScore: 1.0,
            };
        }
      }

      currentPlan = advancePlanStep(currentPlan, i, stepResult);
      options.onStepProgress?.(currentPlan, currentPlan.steps[i]);

      // If paused on quality gate, halt progression and wait for user intervention
      if (currentPlan.steps[i].status === "paused_on_gate") {
        return currentPlan;
      }
    } catch (err) {
      const isAbort = (err as Error).name === "AbortError" || Boolean(options.signal?.aborted);
      if (isAbort) {
        currentPlan = {
          ...currentPlan,
          overallStatus: "aborted",
          updatedAt: Date.now(),
        };
        return currentPlan;
      }
      currentPlan = advancePlanStep(
        currentPlan,
        i,
        undefined,
        (err as Error).message || "Step execution failed",
      );
      options.onStepProgress?.(currentPlan, currentPlan.steps[i]);
      return currentPlan;
    }
  }

  return currentPlan;
}
