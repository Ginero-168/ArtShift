import type { CreativeSpecialist } from "./creativeDirector";

/**
 * Execution status for each step in the sequential pipeline.
 */
export type StepExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "paused_on_gate"
  | "failed"
  | "skipped";

/**
 * Represents a single specialist action in the sequential execution pipeline.
 */
export type SequentialExecutionStep = {
  id: string;
  name: string;
  specialist: CreativeSpecialist;
  description: string;
  toolOrModelAlias: string;
  payload: Record<string, unknown>;
  /**
   * Reference to output of an earlier step in the linear pipeline.
   */
  dependsOnStepId?: string;
  /**
   * Quality gate threshold score (0.0 - 1.0). If evaluation drops below, execution pauses.
   */
  qualityThreshold?: number;
  status: StepExecutionStatus;
  result?: {
    artifactKind: "image" | "text" | "mask" | "layout_commands" | "brand_tokens";
    data: unknown;
    reviewScore?: number;
    notes?: string;
  };
  error?: string;
};

/**
 * Sequential Execution Plan for Complex Task Class.
 * Orchestrated directly by the client browser (Local-first data bus).
 */
export type SequentialExecutionPlan = {
  id: string;
  planToken: string;
  originalPrompt: string;
  summary: string;
  steps: readonly SequentialExecutionStep[];
  requiresApproval: boolean;
  isApproved: boolean;
  currentStepIndex: number;
  overallStatus: "draft" | "approved" | "executing" | "paused" | "completed" | "aborted";
  createdAt: number;
  updatedAt: number;
};

/**
 * Validates a proposed sequential execution plan from the Creative Director.
 */
export function validateSequentialExecutionPlan(
  raw: unknown,
): { ok: true; plan: SequentialExecutionPlan } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Plan must be an object" };
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id) {
    return { ok: false, error: "Plan id is missing or invalid" };
  }
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    return { ok: false, error: "Plan must contain at least one step" };
  }
  if (candidate.steps.length > 8) {
    return { ok: false, error: "Plan exceeds maximum allowable steps (8)" };
  }

  const validatedSteps: SequentialExecutionStep[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < candidate.steps.length; i++) {
    const rawStep = candidate.steps[i];
    if (!rawStep || typeof rawStep !== "object") {
      return { ok: false, error: `Step at index ${i} is not an object` };
    }
    const s = rawStep as Record<string, unknown>;
    const stepId = String(s.id ?? `step_${i + 1}`);
    if (seenIds.has(stepId)) {
      return { ok: false, error: `Duplicate step id: ${stepId}` };
    }
    seenIds.add(stepId);

    // In a strict linear pipeline, a step may only depend on an earlier step
    if (s.dependsOnStepId && !seenIds.has(String(s.dependsOnStepId))) {
      return {
        ok: false,
        error: `Step ${stepId} references forward or non-existent dependency: ${String(s.dependsOnStepId)}`,
      };
    }

    validatedSteps.push({
      id: stepId,
      name: String(s.name ?? `Step ${i + 1}`),
      specialist: s.specialist as CreativeSpecialist,
      description: String(s.description ?? ""),
      toolOrModelAlias: String(s.toolOrModelAlias ?? ""),
      payload: (s.payload as Record<string, unknown>) ?? {},
      dependsOnStepId: s.dependsOnStepId ? String(s.dependsOnStepId) : undefined,
      qualityThreshold: typeof s.qualityThreshold === "number" ? s.qualityThreshold : 0.7,
      status: "pending",
    });
  }

  return {
    ok: true,
    plan: {
      id: candidate.id,
      planToken: String(candidate.planToken ?? `token_${Date.now()}`),
      originalPrompt: String(candidate.originalPrompt ?? ""),
      summary: String(candidate.summary ?? "Multi-specialist design plan"),
      steps: validatedSteps,
      requiresApproval: true,
      isApproved: false,
      currentStepIndex: 0,
      overallStatus: "draft",
      createdAt: Number(candidate.createdAt ?? Date.now()),
      updatedAt: Date.now(),
    },
  };
}

/**
 * Transitions the plan to the next step, or pauses if quality threshold is not met.
 */
export function advancePlanStep(
  plan: SequentialExecutionPlan,
  stepIndex: number,
  result: SequentialExecutionStep["result"],
  error?: string,
): SequentialExecutionPlan {
  const steps = [...plan.steps];
  const step = { ...steps[stepIndex] };

  if (error) {
    step.status = "failed";
    step.error = error;
    steps[stepIndex] = step;
    return {
      ...plan,
      steps,
      overallStatus: "paused",
      updatedAt: Date.now(),
    };
  }

  const score = result?.reviewScore ?? 1.0;
  const threshold = step.qualityThreshold ?? 0.7;

  if (score < threshold) {
    step.status = "paused_on_gate";
    step.result = result;
    steps[stepIndex] = step;
    return {
      ...plan,
      steps,
      overallStatus: "paused",
      updatedAt: Date.now(),
    };
  }

  step.status = "completed";
  step.result = result;
  steps[stepIndex] = step;

  const nextIndex = stepIndex + 1;
  const isAllDone = nextIndex >= steps.length;

  return {
    ...plan,
    steps,
    currentStepIndex: isAllDone ? stepIndex : nextIndex,
    overallStatus: isAllDone ? "completed" : "executing",
    updatedAt: Date.now(),
  };
}
