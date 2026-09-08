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
  /** Number of times this step has been started, including resumed attempts. */
  attempt: number;
  /**
   * Quality gate threshold score (0.0 - 1.0). If evaluation drops below, execution pauses.
   */
  qualityThreshold?: number;
  status: StepExecutionStatus;
  result?: {
    artifactKind: "image" | "text" | "mask" | "layout_commands" | "brand_tokens";
    data: unknown;
    reviewScore?: number;
    reviewStatus?: "passed" | "failed" | "not_checked" | "unavailable";
    criteriaEvidence?: readonly {
      criterion: string;
      status: "passed" | "failed" | "not_checked" | "unavailable";
      notes?: string;
    }[];
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

const ALLOWED_SPECIALISTS: ReadonlySet<CreativeSpecialist> = new Set([
  "image_generator",
  "image_editor",
  "vectorizer",
  "layout_designer",
  "copywriter",
  "brand_stylist",
]);

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
    if (
      typeof s.specialist !== "string" ||
      !ALLOWED_SPECIALISTS.has(s.specialist as CreativeSpecialist)
    ) {
      return {
        ok: false,
        error: `Step ${stepId} references an unsupported specialist: ${String(s.specialist)}`,
      };
    }
    if (typeof s.toolOrModelAlias !== "string" || !s.toolOrModelAlias.trim()) {
      return { ok: false, error: `Step ${stepId} is missing toolOrModelAlias` };
    }
    if (s.payload !== undefined && !isRecord(s.payload)) {
      return { ok: false, error: `Step ${stepId} payload must be an object` };
    }
    const payload = isRecord(s.payload) ? s.payload : {};
    if (containsUnsafePayload(payload)) {
      return { ok: false, error: `Step ${stepId} payload contains unsafe provider data` };
    }
    if (
      s.qualityThreshold !== undefined &&
      (typeof s.qualityThreshold !== "number" ||
        !Number.isFinite(s.qualityThreshold) ||
        s.qualityThreshold < 0 ||
        s.qualityThreshold > 1)
    ) {
      return { ok: false, error: `Step ${stepId} qualityThreshold must be between 0 and 1` };
    }

    validatedSteps.push({
      id: stepId,
      name: String(s.name ?? `Step ${i + 1}`),
      specialist: s.specialist as CreativeSpecialist,
      description: String(s.description ?? ""),
      toolOrModelAlias: s.toolOrModelAlias.trim(),
      payload,
      dependsOnStepId: s.dependsOnStepId ? String(s.dependsOnStepId) : undefined,
      attempt: 0,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsUnsafePayload(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return /data:image\/|replicate\.delivery|api[_-]?key|bearer\s+\S+|(?:secret|token|credential)\s*[:=]/iu.test(
      value,
    );
  }
  if (!value || typeof value !== "object" || seen.has(value as object)) return false;
  seen.add(value as object);
  if (Array.isArray(value)) return value.some((item) => containsUnsafePayload(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) =>
    containsUnsafePayload(item, seen),
  );
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

  if (!result) {
    step.status = "failed";
    step.error = "Specialist returned no result";
    steps[stepIndex] = step;
    return {
      ...plan,
      steps,
      overallStatus: "paused",
      updatedAt: Date.now(),
    };
  }

  const score = result.reviewScore;
  const threshold = step.qualityThreshold ?? 0.7;

  if (typeof score === "number" && score < threshold) {
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

  if (result.reviewStatus === "failed") {
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
    currentStepIndex: isAllDone ? steps.length : nextIndex,
    overallStatus: isAllDone ? "completed" : "executing",
    updatedAt: Date.now(),
  };
}
