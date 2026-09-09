import {
  GPT_IMAGE_2_ESTIMATED_COST_USD,
  generateAIImage,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";
import { getActiveBrandKit } from "@/lib/brand/brandKit";
import { compute603010AutoLayout } from "@/lib/engine/autoLayout603010";
import { createImage, createText } from "@/lib/engine/factory";
import { getCached } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { vectorizeImage } from "@/lib/vectorize/vectorizer";
import { type CanvasInspection, inspectCanvas } from "./canvasInspector";
import {
  applyCreativeDirectionToTask,
  type CreativeDirection,
  parseCreativeDirection,
} from "./creativeDirector";
import { prepareRemoteOrchestratorTurn } from "./creativeDirectorClient";
import {
  advancePlanStep,
  type SequentialExecutionPlan,
  type SequentialExecutionStep,
} from "./executionGraph";

export { useDirectorSession } from "./sessionState";

import type { ArtworkExecutionContext, PlanProposal } from "@/lib/designAgent/contracts";
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
import { useDirectorSession } from "./sessionState";
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
    /^(?:ช่วย|กรุณา)?\s*(?:บอก|แสดง|ตรวจสอบ|เช็ค|ดู|สรุป)?\s*(?:ว่า)?\s*(?:บน|ใน|สิ่งที่อยู่บน)\s*canvas\s*(?:มีอะไร|มี object|มีอ็อบเจ็กต์|มีอะไรอยู่)?/iu.test(
      value,
    ) ||
    /(?:มีอะไรอยู่บน|มีอะไรใน|สรุป.*(?:บน|ใน))\s*canvas/iu.test(value) ||
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
      canvasSummary: {
        objectCount: input.canvas?.slide.elements.length ?? 0,
        selectedCount: input.refs.length,
        width: input.canvas?.slide.width ?? 1920,
        height: input.canvas?.slide.height ?? 1080,
      },
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
    subAgent: direction.specialist,
    capability: direction.capability,
    quality: quality.quality,
    qualityRationale: quality.rationale,
    maxAttempts: quality.maxAttempts,
    modelAlias: direction.modelAlias,
    reasonCodes: quality.reasonCodes,
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

type SequentialStepResult = NonNullable<SequentialExecutionStep["result"]>;

/**
 * Execute a specialist using the real ArtShift capability seams.
 *
 * The sequential runner is intentionally provider agnostic, but it still needs
 * a safe default for the client-owned execution path. Returning fabricated
 * artifacts here would make the plan look complete while leaving the Artwork
 * untouched, so every supported specialist either performs a real operation or
 * fails with a repairable error.
 */
async function executeDefaultSpecialistStep(
  plan: SequentialExecutionPlan,
  step: SequentialExecutionStep,
  dependencyOutput: unknown,
  options: { signal?: AbortSignal; cloudConsent?: boolean },
): Promise<SequentialStepResult> {
  const signal = options.signal;
  const payload = step.payload;

  switch (step.specialist) {
    case "image_generator":
    case "image_editor": {
      if (options.cloudConsent !== true) {
        throw new Error("Cloud consent is required before running an image specialist step");
      }
      const prompt =
        readStepText(payload, "prompt") || `${step.description}\n${plan.originalPrompt}`;
      if (!prompt.trim()) throw new Error("Image specialist step has no executable prompt");
      const dimensions = resolveImageGenerationDimensions(prompt);
      const dependencyImage = extractImageDataUrl(dependencyOutput);
      const generated = await generateAIImage(
        {
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          aspectRatio: dimensions.aspectRatio,
          quality: "high",
          cloudConsent: true,
          ...(step.specialist === "image_editor" && dependencyImage
            ? { inputImages: [{ dataUrl: dependencyImage }] }
            : {}),
        },
        signal,
      );
      const state = useEngine.getState();
      const slide = state.currentSlide();
      if (!slide) throw new Error("Image specialist step could not find the active Artwork");
      const placement = nextArtifactPlacement(
        slide.width,
        slide.height,
        generated.width,
        generated.height,
      );
      const element = createImage({
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        fileId: generated.fileId,
        naturalWidth: generated.width,
        naturalHeight: generated.height,
      });
      state.addElement(element, `orchestrator ${step.specialist}: ${step.id}`);
      state.selectOnly([element.id]);
      return {
        artifactKind: "image",
        data: { ...generated, elementId: element.id },
        reviewStatus: "not_checked",
        notes: `${step.specialist} completed through the ArtShift image route`,
      };
    }
    case "vectorizer": {
      const imageDataUrl = extractImageDataUrl(dependencyOutput);
      if (!imageDataUrl) {
        throw new Error("Vectorizer step requires an image output from an earlier step");
      }
      const state = useEngine.getState();
      const slide = state.currentSlide();
      if (!slide) throw new Error("Vectorizer step could not find the active Artwork");
      const result = await vectorizeImage(
        imageDataUrl,
        {
          x: Number(payload.x ?? slide.width * 0.1),
          y: Number(payload.y ?? slide.height * 0.1),
          width: Number(payload.width ?? slide.width * 0.8),
          height: Number(payload.height ?? slide.height * 0.8),
        },
        {
          preset: "highFidelity",
          colors: boundedNumber(payload.colors, 16, 2, 32),
          detailLevel: boundedDetailLevel(payload.detailLevel),
        },
        { signal },
      );
      if (result.elements.length === 0) {
        throw new Error("Vectorizer returned no editable paths");
      }
      state.addElements(result.elements, `orchestrator vectorizer: ${step.id}`);
      state.selectOnly(result.elements.map((element) => element.id));
      return {
        artifactKind: "mask",
        data: { elements: result.elements, totalNodes: result.totalNodes, backend: result.backend },
        reviewStatus: "not_checked",
        notes: `Vectorizer produced ${result.elements.length} editable paths`,
      };
    }
    case "copywriter": {
      const state = useEngine.getState();
      const slide = state.currentSlide();
      if (!slide) throw new Error("Copywriter step could not find the active Artwork");
      const headline = readStepText(payload, "headline", "text", "copy");
      if (!headline) {
        throw new Error("Copywriter step requires payload.headline or payload.text");
      }
      const subheading = readStepText(payload, "subheading", "body");
      const elements = [
        createText({
          x: Number(payload.x ?? slide.width * 0.08),
          y: Number(payload.y ?? slide.height * 0.14),
          width: Number(payload.width ?? slide.width * 0.84),
          height: Number(payload.height ?? 96),
          text: headline,
          fontSize: Number(payload.fontSize ?? 52),
          fontFamily: String(payload.fontFamily ?? "Noto Sans Thai, sans-serif"),
        }),
        ...(subheading
          ? [
              createText({
                x: Number(payload.x ?? slide.width * 0.1),
                y: Number(payload.subheadingY ?? slide.height * 0.28),
                width: Number(payload.width ?? slide.width * 0.8),
                height: Number(payload.subheadingHeight ?? 56),
                text: subheading,
                fontSize: Number(payload.subheadingFontSize ?? 24),
                fontFamily: String(payload.fontFamily ?? "Noto Sans Thai, sans-serif"),
              }),
            ]
          : []),
      ];
      state.addElements(elements, `orchestrator copywriter: ${step.id}`);
      state.selectOnly(elements.map((element) => element.id));
      return {
        artifactKind: "text",
        data: {
          headline,
          ...(subheading ? { subheading } : {}),
          elementIds: elements.map((e) => e.id),
        },
        reviewStatus: "not_checked",
        notes: "Copywriter text committed to the active Artwork",
      };
    }
    case "layout_designer": {
      const state = useEngine.getState();
      const slide = state.currentSlide();
      if (!slide || slide.elements.length === 0) {
        throw new Error("Layout step requires at least one Object on the active Artwork");
      }
      const patches = compute603010AutoLayout(slide);
      if (patches.length > 0) state.updateElements(patches, `orchestrator layout: ${step.id}`);
      return {
        artifactKind: "layout_commands",
        data: { patches, updatedCount: patches.length },
        reviewStatus: "not_checked",
        notes: `Layout applied to ${patches.length} Objects`,
      };
    }
    case "brand_stylist": {
      const brand = getActiveBrandKit();
      const state = useEngine.getState();
      const slide = state.currentSlide();
      if (!slide) throw new Error("Brand stylist step could not find the active Artwork");
      const targets = slide.elements.filter(
        (element) =>
          !element.isDeleted && (state.selectedIds.size === 0 || state.selectedIds.has(element.id)),
      );
      const patches = targets.map((element) => ({
        id: element.id,
        patch:
          element.type === "text"
            ? { strokeColor: brand.colors.text, fontFamily: brand.typography.headerFont }
            : { backgroundColor: brand.colors.surface, strokeColor: brand.colors.primary },
      }));
      if (patches.length > 0)
        state.updateElements(patches, `orchestrator brand stylist: ${step.id}`);
      return {
        artifactKind: "brand_tokens",
        data: {
          brandId: brand.id,
          brandName: brand.name,
          colors: brand.colors,
          typography: brand.typography,
          rules: brand.rules,
          appliedTo: patches.map((patch) => patch.id),
        },
        reviewStatus: "not_checked",
        notes: `Brand Kit ${brand.name} applied to ${patches.length} Objects`,
      };
    }
    default:
      throw new Error(`No executable specialist is registered for ${String(step.specialist)}`);
  }
}

function readStepText(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boundedDetailLevel(value: unknown): 1 | 2 | 3 | 4 | 5 {
  return boundedNumber(value, 3, 1, 5) as 1 | 2 | 3 | 4 | 5;
}

function extractImageDataUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.dataUrl === "string" && record.dataUrl.startsWith("data:image/")) {
    return record.dataUrl;
  }
  if (typeof record.fileId === "string") {
    return getCached(record.fileId)?.dataURL;
  }
  return undefined;
}

function nextArtifactPlacement(
  slideWidth: number,
  slideHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number; width: number; height: number } {
  const maxWidth = Math.max(160, slideWidth * 0.7);
  const maxHeight = Math.max(160, slideHeight * 0.7);
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  return {
    x: Math.max(0, Math.round((slideWidth - width) / 2)),
    y: Math.max(0, Math.round((slideHeight - height) / 2)),
    width,
    height,
  };
}

/**
 * Runs a SequentialExecutionPlan through its specialist steps sequentially.
 * Handled directly on the client (Local-First Data Bus) with Exception Gating.
 */
export async function runSequentialExecutionPlan(
  initialPlan: SequentialExecutionPlan,
  options: SequentialPlanExecutionOptions = {},
): Promise<SequentialExecutionPlan> {
  // Guard against completed or aborted plan or all steps already executed
  if (
    initialPlan.overallStatus === "completed" ||
    initialPlan.overallStatus === "aborted" ||
    initialPlan.currentStepIndex >= initialPlan.steps.length ||
    initialPlan.steps.every((step) => step.status === "completed" || step.status === "skipped")
  ) {
    return {
      ...initialPlan,
      overallStatus: initialPlan.overallStatus === "aborted" ? "aborted" : "completed",
    };
  }

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

    if (currentPlan.steps[i].status === "completed" || currentPlan.steps[i].status === "skipped") {
      continue;
    }

    const currentStep = {
      ...currentPlan.steps[i],
      status: "running" as const,
      attempt: (currentPlan.steps[i].attempt ?? 0) + 1,
      error: undefined,
      result: undefined,
    };
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
      if (dependencyOutput === undefined) {
        currentPlan = advancePlanStep(
          currentPlan,
          i,
          undefined,
          `Dependency ${currentStep.dependsOnStepId} has no completed output`,
        );
        options.onStepProgress?.(currentPlan, currentPlan.steps[i]);
        return currentPlan;
      }
    }

    try {
      const stepResult = options.executeSpecialistStep
        ? await options.executeSpecialistStep(currentStep, dependencyOutput, {
            signal: options.signal,
          })
        : await executeDefaultSpecialistStep(currentPlan, currentStep, dependencyOutput, options);

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

/**
 * Unified Orchestration Entry Point (ORCH-05).
 * UI callers use submitTurn to send user prompts with session and artwork context.
 */
export type SubmitTurnRequest = {
  sessionId?: string;
  prompt: string;
  refs?: readonly ComposerImageRef[];
  analyses?: readonly ImageReferenceAnalysis[];
  canvas?: Parameters<typeof inspectCanvas>[0];
  designContext?: ArtworkExecutionContext;
  cloudConsent?: boolean;
  signal?: AbortSignal;
};

export type SubmitTurnResponse =
  | { kind: "answer"; reply: string; source: "canvas-local" | "director" }
  | {
      kind: "clarification";
      question: string;
      options: string[];
      pendingClarification: PendingClarification;
    }
  | { kind: "design-plan"; proposal: PlanProposal }
  | { kind: "sequential-plan"; plan: SequentialExecutionPlan }
  | {
      kind: "image-task";
      imageRun: DirectedImageRun;
      direction: Extract<CreativeDirection, { kind: "image-task" }>;
    };

export async function submitTurn(request: SubmitTurnRequest): Promise<SubmitTurnResponse> {
  const signal = request.signal ?? new AbortController().signal;

  // 1. Check local-only canvas inventory first
  if (isCanvasInventoryPrompt(request.prompt) && request.canvas) {
    const inspection = inspectCanvas(request.canvas);
    return { kind: "answer", reply: inspection.reply, source: "canvas-local" };
  }

  // 2. Prepare caller context
  const refs = request.refs ?? [];
  const analyses = request.analyses ?? [];

  const canvasSummary = request.canvas?.slide
    ? {
        objectCount: request.canvas.slide.elements.length,
        selectedCount: request.canvas.selectedIds.size,
        width: request.canvas.slide.width,
        height: request.canvas.slide.height,
      }
    : { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 };

  const direction = await prepareRemoteOrchestratorTurn(
    {
      prompt: request.prompt,
      canvasSummary,
      designContext: request.designContext,
      referenceAnalyses: analyses,
    },
    { signal, cloudConsent: request.cloudConsent ?? true },
  );

  if (direction.kind === "answer") {
    return { kind: "answer", reply: direction.text, source: "director" };
  }

  if (direction.kind === "clarification") {
    const pendingClarification: PendingClarification = {
      id: crypto.randomUUID(),
      originalPrompt: request.prompt,
      selectedImages: [...refs],
      analyses: [...analyses],
      question: direction.question,
      options: direction.options.map((label, index) => ({ id: String(index), label })),
      round: 1,
    };
    return {
      kind: "clarification",
      question: direction.question,
      options: direction.options,
      pendingClarification,
    };
  }

  if (direction.kind === "design-plan") {
    return { kind: "design-plan", proposal: direction.proposal };
  }

  if (direction.kind === "sequential-plan") {
    return { kind: "sequential-plan", plan: direction.plan };
  }

  if (direction.kind === "image-task") {
    const imageRun = createDirectedImageRun(
      {
        prompt: request.prompt,
        refs,
        analyses,
        canvas: request.canvas,
      },
      direction,
    );
    return { kind: "image-task", imageRun, direction };
  }

  throw new Error(`Unexpected creative direction: ${JSON.stringify(direction)}`);
}

/**
 * Control an ongoing run or plan version (ORCH-05).
 */
export type ControlRunRequest = {
  sessionId?: string;
  runId: string;
  action: "approve" | "cancel" | "resume";
  plan?: SequentialExecutionPlan;
  signal?: AbortSignal;
};

export async function controlRun(
  request: ControlRunRequest,
  options?: SequentialPlanExecutionOptions,
): Promise<{ status: "completed" | "paused" | "aborted"; plan?: SequentialExecutionPlan }> {
  if (request.action === "cancel") {
    if (request.plan) {
      return {
        status: "aborted",
        plan: {
          ...request.plan,
          overallStatus: "aborted",
          updatedAt: Date.now(),
        },
      };
    }
    return { status: "aborted" };
  }

  if (request.action === "approve" || request.action === "resume") {
    if (!request.plan) {
      throw new Error("Sequential plan is required to approve or resume execution");
    }
    const executed = await runSequentialExecutionPlan(request.plan, options);
    return {
      status:
        executed.overallStatus === "completed"
          ? "completed"
          : executed.overallStatus === "aborted"
            ? "aborted"
            : "paused",
      plan: executed,
    };
  }

  throw new Error(`Unsupported control action: ${String(request.action)}`);
}

/**
 * Observe session state and progress events (ORCH-05).
 */
export function observeSession(sessionId: string) {
  const state = useDirectorSession.getState();
  return {
    sessionId: state.sessionId || sessionId,
    turns: state.turns,
    activeGhostVariationId: state.activeGhostVariationId,
    currentSnapshotId: state.currentSnapshotId,
  };
}
