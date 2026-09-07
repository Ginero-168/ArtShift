import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./harnessPolicy";

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
  harnessVersion?: string;
  harnessRuleIds?: readonly string[];
  preTaskTrace?: readonly AiTaskTraceEvent[];
  referenceFacts?: readonly {
    objectId: string;
    caption: string;
    objects: readonly string[];
    visibleText: string;
    limitations: readonly string[];
  }[];
};

export type AiTask = AiTaskPlan & {
  harnessVersion: typeof ARTSHIFT_HARNESS_VERSION;
  harnessRuleIds: readonly string[];
  status: AiTaskStatus;
  attempt: number;
  history: readonly AiTaskEvent[];
};

export type AiTaskEvent =
  | {
      type: "task.created";
      subAgent: string;
      capability: string;
      harnessVersion: typeof ARTSHIFT_HARNESS_VERSION;
      ruleIds: readonly string[];
    }
  | { type: "reference.analysis.started"; count: number }
  | { type: "reference.analysis.completed"; count: number }
  | { type: "intent.assessed"; complete: boolean }
  | { type: "provider.requested"; attempt: number; subAgent: string }
  | { type: "quality.checked"; passed: boolean; attempt: number }
  | { type: "preload.completed"; attempt: number }
  | { type: "commit.started"; attempt: number }
  | { type: "commit.completed"; attempt: number }
  | {
      type: "recovery.decided";
      action: "retry" | "resume" | "stop" | "outcome-unknown";
      reason: string;
    }
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

export type AiTaskTraceEvent = Extract<
  AiTaskEvent,
  {
    type:
      | "task.created"
      | "reference.analysis.started"
      | "reference.analysis.completed"
      | "intent.assessed"
      | "provider.requested"
      | "quality.checked"
      | "preload.completed"
      | "commit.started"
      | "commit.completed"
      | "recovery.decided";
  }
>;

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
  const harnessVersion = plan.harnessVersion ?? ARTSHIFT_HARNESS_VERSION;
  const harnessRuleIds = plan.harnessRuleIds ?? ARTSHIFT_HARNESS_RULE_IDS;
  if (
    harnessVersion !== ARTSHIFT_HARNESS_VERSION ||
    ARTSHIFT_HARNESS_RULE_IDS.some((ruleId) => !harnessRuleIds.includes(ruleId))
  ) {
    throw new Error("task Harness contract is invalid");
  }
  if (
    plan.preTaskTrace?.some((event) => event.type === "task.created") ||
    plan.preTaskTrace?.some((event) => "reason" in event && UNSAFE_TEXT.test(event.reason))
  ) {
    throw new Error("task pre-trace is invalid");
  }
  return {
    ...plan,
    harnessVersion: ARTSHIFT_HARNESS_VERSION,
    harnessRuleIds: [...harnessRuleIds],
    status: plan.cloudConsentRequired ? "awaiting-consent" : "planned",
    attempt: 0,
    history: [
      ...(plan.preTaskTrace ?? []),
      {
        type: "task.created",
        subAgent: plan.subAgent,
        capability: plan.capability,
        harnessVersion: ARTSHIFT_HARNESS_VERSION,
        ruleIds: [...harnessRuleIds],
      },
    ],
  };
}

export function assertAiTaskHarness(task: {
  harnessVersion: string;
  harnessRuleIds: readonly string[];
}): void {
  if (
    task.harnessVersion !== ARTSHIFT_HARNESS_VERSION ||
    ARTSHIFT_HARNESS_RULE_IDS.some((ruleId) => !task.harnessRuleIds.includes(ruleId))
  ) {
    throw new Error("task Harness contract is invalid");
  }
}

export function reduceAiTask(task: AiTask, event: AiTaskEvent): AiTaskTransition {
  if ("reason" in event && event.reason && UNSAFE_TEXT.test(event.reason)) {
    throw new Error("unsafe task text");
  }
  if (task.status === "outcome-unknown" && event.type === "retry") {
    throw new Error("cannot retry an unknown outcome");
  }
  const history = [...task.history, event];
  if (isTraceEvent(event)) {
    if (["succeeded", "failed", "cancelled", "outcome-unknown"].includes(task.status)) {
      throw new Error(`cannot append trace to terminal task: ${task.status}`);
    }
    return { task: { ...task, history }, events: [event] };
  }
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

export function appendAiTaskEvent(task: AiTask, event: AiTaskTraceEvent): AiTask {
  if ("reason" in event && event.reason && UNSAFE_TEXT.test(event.reason)) {
    throw new Error("unsafe task text");
  }
  if (["succeeded", "failed", "cancelled", "outcome-unknown"].includes(task.status)) {
    throw new Error(`cannot append trace to terminal task: ${task.status}`);
  }
  return { ...task, history: [...task.history, event] };
}

function isTraceEvent(event: AiTaskEvent): event is AiTaskTraceEvent {
  return (
    event.type === "task.created" ||
    event.type === "reference.analysis.started" ||
    event.type === "reference.analysis.completed" ||
    event.type === "intent.assessed" ||
    event.type === "provider.requested" ||
    event.type === "quality.checked" ||
    event.type === "preload.completed" ||
    event.type === "commit.started" ||
    event.type === "commit.completed" ||
    event.type === "recovery.decided"
  );
}

function requireStatus(task: AiTask, allowed: AiTaskStatus[]): void {
  if (!allowed.includes(task.status)) {
    throw new Error(`cannot transition ${task.status} with this event`);
  }
}
