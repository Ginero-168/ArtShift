export type AiImageQuality = "low" | "medium" | "high";

export type AiTaskStatus =
  | "planned"
  | "analyzing"
  | "clarifying"
  | "awaiting-consent"
  | "queued"
  | "running"
  | "quality-check"
  | "retrying"
  | "preloading"
  | "committing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "outcome-unknown";

export type AiTaskPlan = {
  id: string;
  prompt: string;
  subAgent: string;
  capability: string;
  quality: AiImageQuality;
  qualityRationale: string;
  maxAttempts: number;
  selectedImages: readonly {
    objectId: string;
    elementVersion: number;
    fileId: string;
    displayName: string;
  }[];
  analysisComplete: boolean;
  cloudConsentRequired: boolean;
  estimatedMaxCostUsd: number;
  requiredSubjects?: readonly string[];
  requiredText?: string;
};

export type AiTask = AiTaskPlan & {
  status: AiTaskStatus;
  attempt: number;
  history: readonly AiTaskEvent[];
};

export type AiTaskEvent =
  | { type: "consent-granted" }
  | { type: "queued" }
  | { type: "running" }
  | { type: "quality-check" }
  | { type: "preloading" }
  | { type: "committing" }
  | { type: "succeeded" }
  | { type: "cancelled"; reason?: string }
  | { type: "failed"; reason: string }
  | { type: "outcome-unknown"; reason: string }
  | { type: "retry"; reason: string }
  | { type: "task.started"; attempt: number };

export type AiTaskTransition = {
  task: AiTask;
  events: AiTaskEvent[];
};

const UNSAFE_TEXT = /data:image\/|replicate\.delivery|api[_-]?key|bearer\s+[a-z0-9._-]+/iu;

export function createAiTask(plan: AiTaskPlan): AiTask {
  if (!plan.analysisComplete) {
    throw new Error("analysis must complete before task creation");
  }
  if (
    !plan.prompt.trim() ||
    UNSAFE_TEXT.test(plan.prompt) ||
    UNSAFE_TEXT.test(plan.qualityRationale)
  ) {
    throw new Error("unsafe task text");
  }
  if (!Number.isInteger(plan.maxAttempts) || plan.maxAttempts < 1 || plan.maxAttempts > 2) {
    throw new Error("task attempt limit is invalid");
  }
  return {
    ...plan,
    status: plan.cloudConsentRequired ? "awaiting-consent" : "planned",
    attempt: 0,
    history: [],
  };
}

export function reduceAiTask(task: AiTask, event: AiTaskEvent): AiTaskTransition {
  if ("reason" in event && event.reason && UNSAFE_TEXT.test(event.reason)) {
    throw new Error("unsafe task text");
  }
  if (task.status === "outcome-unknown" && event.type === "retry") {
    throw new Error("cannot retry an unknown outcome");
  }
  const history = [...task.history, event];
  switch (event.type) {
    case "consent-granted":
      requireStatus(task, ["planned", "awaiting-consent"]);
      return { task: { ...task, status: "planned", history }, events: [event] };
    case "queued":
      requireStatus(task, ["planned", "retrying"]);
      return { task: { ...task, status: "queued", history }, events: [event] };
    case "running": {
      requireStatus(task, ["queued", "retrying"]);
      const attempt = task.attempt + 1;
      if (attempt > task.maxAttempts) throw new Error("task attempt limit exceeded");
      const started: AiTaskEvent = { type: "task.started", attempt };
      return {
        task: { ...task, status: "running", attempt, history: [...history, started] },
        events: [event, started],
      };
    }
    case "quality-check":
      requireStatus(task, ["running"]);
      return { task: { ...task, status: "quality-check", history }, events: [event] };
    case "preloading":
      requireStatus(task, ["quality-check"]);
      return { task: { ...task, status: "preloading", history }, events: [event] };
    case "committing":
      requireStatus(task, ["preloading"]);
      return { task: { ...task, status: "committing", history }, events: [event] };
    case "succeeded":
      requireStatus(task, ["committing"]);
      return { task: { ...task, status: "succeeded", history }, events: [event] };
    case "cancelled":
      if (["succeeded", "failed", "cancelled"].includes(task.status)) {
        throw new Error(`cannot cancel a terminal task: ${task.status}`);
      }
      return { task: { ...task, status: "cancelled", history }, events: [event] };
    case "failed":
      if (["succeeded", "failed", "cancelled"].includes(task.status)) {
        throw new Error(`cannot fail a terminal task: ${task.status}`);
      }
      return { task: { ...task, status: "failed", history }, events: [event] };
    case "outcome-unknown":
      if (!["running", "queued"].includes(task.status)) {
        throw new Error(`cannot mark ${task.status} outcome unknown`);
      }
      return { task: { ...task, status: "outcome-unknown", history }, events: [event] };
    case "retry":
      requireStatus(task, ["quality-check", "failed"]);
      if (task.attempt >= task.maxAttempts) throw new Error("task attempt limit exceeded");
      return { task: { ...task, status: "retrying", history }, events: [event] };
    case "task.started":
      throw new Error("task.started is an internal event");
  }
}

function requireStatus(task: AiTask, allowed: AiTaskStatus[]): void {
  if (!allowed.includes(task.status)) {
    throw new Error(`cannot transition ${task.status} with this event`);
  }
}
