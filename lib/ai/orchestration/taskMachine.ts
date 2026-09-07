import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./harnessPolicy";

export type AiImageQuality = "low" | "medium" | "high";

export type AiTaskDimensions = {
  width: number;
  height: number;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
};

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
  requestedDimensions?: AiTaskDimensions;
  requiredSubjects?: readonly string[];
  requiredText?: string;
  harnessVersion: typeof ARTSHIFT_HARNESS_VERSION;
  harnessRuleIds: readonly string[];
  preTaskTrace?: readonly AiTaskTracePayload[];
  referenceFacts?: readonly {
    objectId: string;
    caption: string;
    objects: readonly string[];
    visibleText: string;
    limitations: readonly string[];
  }[];
};

export type AiTask = AiTaskPlan & {
  status: AiTaskStatus;
  attempt: number;
  history: readonly AiTaskEvent[];
};

export type AiTaskTracePayload =
  | { type: "context.inspected"; objectCount: number; selectedCount: number }
  | { type: "reference.analysis.started"; count: number }
  | { type: "reference.analysis.completed"; count: number }
  | { type: "intent.assessed"; complete: boolean }
  | { type: "clarification.requested"; question: string; optionIds: readonly string[] }
  | { type: "task.created"; capability: string }
  | { type: "provider.requested"; attempt: number }
  | { type: "quality.checked"; passed: boolean; attempt: number }
  | { type: "preload.completed"; attempt: number }
  | { type: "commit.started"; attempt: number }
  | { type: "commit.completed"; attempt: number }
  | { type: "task.succeeded"; summary: string }
  | { type: "task.failed"; reason: string }
  | { type: "task.cancelled"; reason?: string }
  | { type: "task.outcome-unknown"; reason: string; predictionId?: string }
  | {
      type: "recovery.decided";
      action: "retry" | "resume" | "stop" | "outcome-unknown";
      reason: string;
    };

export type AiTaskTraceEvent = AiTaskTracePayload & {
  taskId: string;
  subAgent: string;
  stage: AiTaskStatus;
  attempt: number;
  harnessVersion: typeof ARTSHIFT_HARNESS_VERSION;
  ruleIds: readonly string[];
};

export type AiTaskEvent =
  | AiTaskTraceEvent
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

const UNSAFE_TEXT =
  /data:image\/|https?:\/\/|replicate\.delivery|api[_-]?key|bearer\s+\S+|(?:secret|token|credential)\s*[:=]/iu;
const LONG_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const TRACE_EVENT_TYPES = new Set<AiTaskTracePayload["type"]>([
  "context.inspected",
  "reference.analysis.started",
  "reference.analysis.completed",
  "intent.assessed",
  "clarification.requested",
  "task.created",
  "provider.requested",
  "quality.checked",
  "preload.completed",
  "commit.started",
  "commit.completed",
  "task.succeeded",
  "task.failed",
  "task.cancelled",
  "task.outcome-unknown",
  "recovery.decided",
]);
const taskRegistry = new Map<string, AiTask>();
const TASK_REGISTRY_LIMIT = 256;

export function getAiTask(taskId: string): AiTask | undefined {
  return taskRegistry.get(taskId);
}

export function registerAiTask(task: AiTask): void {
  taskRegistry.set(task.id, task);
  while (taskRegistry.size > TASK_REGISTRY_LIMIT) {
    const oldest = taskRegistry.keys().next().value;
    if (oldest === undefined) break;
    taskRegistry.delete(oldest);
  }
}

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
  assertAiTaskHarness(plan);
  if (
    plan.preTaskTrace?.some((event) => event.type === "task.created") ||
    plan.preTaskTrace?.some((event) => containsUnsafeTraceText(event))
  ) {
    throw new Error("task pre-trace is invalid");
  }
  const baseTask: AiTask = {
    ...plan,
    harnessRuleIds: [...plan.harnessRuleIds],
    status: plan.cloudConsentRequired ? "awaiting-consent" : "planned",
    attempt: 0,
    history: [],
  };
  const history: AiTaskEvent[] = [
    ...(plan.preTaskTrace ?? []).map((event) => normalizeTraceEvent(baseTask, event)),
    normalizeTraceEvent(baseTask, {
      type: "task.created",
      capability: plan.capability,
    }),
  ];
  const task = { ...baseTask, history };
  registerAiTask(task);
  return task;
}

export function assertAiTaskHarness(task: {
  harnessVersion: string;
  harnessRuleIds: readonly string[];
}): void {
  if (
    task.harnessVersion !== ARTSHIFT_HARNESS_VERSION ||
    !hasExactHarnessRules(task.harnessRuleIds)
  ) {
    throw new Error("task Harness contract is invalid");
  }
}

function hasExactHarnessRules(ruleIds: readonly string[]): boolean {
  return (
    ruleIds.length === ARTSHIFT_HARNESS_RULE_IDS.length &&
    ARTSHIFT_HARNESS_RULE_IDS.every((ruleId) => ruleIds.includes(ruleId))
  );
}

function normalizeTraceEvent(
  task: AiTask,
  event: AiTaskTracePayload | AiTaskTraceEvent,
): AiTaskTraceEvent {
  if (containsUnsafeTraceText(event)) throw new Error("unsafe task text");
  if (
    ("taskId" in event && event.taskId !== task.id) ||
    ("subAgent" in event && event.subAgent !== task.subAgent) ||
    ("harnessVersion" in event && event.harnessVersion !== task.harnessVersion) ||
    ("ruleIds" in event && !hasExactHarnessRules(event.ruleIds))
  ) {
    throw new Error("task trace contract is invalid");
  }
  return {
    ...event,
    taskId: task.id,
    subAgent: task.subAgent,
    stage: traceStage(event),
    attempt: "attempt" in event ? event.attempt : task.attempt,
    harnessVersion: task.harnessVersion,
    ruleIds: [...task.harnessRuleIds],
  } as AiTaskTraceEvent;
}

function traceStage(event: AiTaskTracePayload): AiTaskStatus {
  switch (event.type) {
    case "context.inspected":
    case "reference.analysis.started":
    case "reference.analysis.completed":
    case "intent.assessed":
    case "clarification.requested":
      return "analyzing";
    case "task.created":
      return "awaiting-consent";
    case "provider.requested":
      return "running";
    case "quality.checked":
      return "quality-check";
    case "preload.completed":
      return "preloading";
    case "commit.started":
    case "commit.completed":
      return "committing";
    case "task.succeeded":
      return "succeeded";
    case "task.failed":
      return "failed";
    case "task.cancelled":
      return "cancelled";
    case "task.outcome-unknown":
      return "outcome-unknown";
    case "recovery.decided":
      return event.action === "outcome-unknown" ? "outcome-unknown" : "retrying";
  }
}

export function reduceAiTask(
  task: AiTask,
  event: AiTaskEvent | AiTaskTracePayload,
): AiTaskTransition {
  const normalizedEvent = isTraceEvent(event) ? normalizeTraceEvent(task, event) : event;
  if (
    "reason" in normalizedEvent &&
    normalizedEvent.reason &&
    UNSAFE_TEXT.test(normalizedEvent.reason)
  ) {
    throw new Error("unsafe task text");
  }
  if (task.status === "outcome-unknown" && normalizedEvent.type === "retry") {
    throw new Error("cannot retry an unknown outcome");
  }
  const history = [...task.history, normalizedEvent];
  if (isTraceEvent(normalizedEvent)) {
    if (["succeeded", "failed", "cancelled", "outcome-unknown"].includes(task.status)) {
      throw new Error(`cannot append trace to terminal task: ${task.status}`);
    }
    return { task: { ...task, history }, events: [normalizedEvent] };
  }
  switch (normalizedEvent.type) {
    case "consent-granted":
      requireStatus(task, ["planned", "awaiting-consent"]);
      return { task: { ...task, status: "planned", history }, events: [normalizedEvent] };
    case "queued":
      requireStatus(task, ["planned", "retrying"]);
      return { task: { ...task, status: "queued", history }, events: [normalizedEvent] };
    case "running": {
      requireStatus(task, ["queued", "retrying"]);
      const attempt = task.attempt + 1;
      if (attempt > task.maxAttempts) throw new Error("task attempt limit exceeded");
      const started: AiTaskEvent = { type: "task.started", attempt };
      return {
        task: { ...task, status: "running", attempt, history: [...history, started] },
        events: [normalizedEvent, started],
      };
    }
    case "quality-check":
      requireStatus(task, ["running"]);
      return { task: { ...task, status: "quality-check", history }, events: [normalizedEvent] };
    case "preloading":
      requireStatus(task, ["quality-check"]);
      return { task: { ...task, status: "preloading", history }, events: [normalizedEvent] };
    case "committing":
      requireStatus(task, ["preloading"]);
      return { task: { ...task, status: "committing", history }, events: [normalizedEvent] };
    case "succeeded":
      requireStatus(task, ["committing"]);
      return { task: { ...task, status: "succeeded", history }, events: [normalizedEvent] };
    case "cancelled":
      if (["succeeded", "failed", "cancelled"].includes(task.status)) {
        throw new Error(`cannot cancel a terminal task: ${task.status}`);
      }
      return { task: { ...task, status: "cancelled", history }, events: [normalizedEvent] };
    case "failed":
      if (["succeeded", "failed", "cancelled"].includes(task.status)) {
        throw new Error(`cannot fail a terminal task: ${task.status}`);
      }
      return { task: { ...task, status: "failed", history }, events: [normalizedEvent] };
    case "outcome-unknown":
      if (!["running", "queued"].includes(task.status)) {
        throw new Error(`cannot mark ${task.status} outcome unknown`);
      }
      return { task: { ...task, status: "outcome-unknown", history }, events: [normalizedEvent] };
    case "retry":
      requireStatus(task, ["quality-check", "failed"]);
      if (task.attempt >= task.maxAttempts) throw new Error("task attempt limit exceeded");
      return { task: { ...task, status: "retrying", history }, events: [normalizedEvent] };
    case "task.started":
      throw new Error("task.started is an internal event");
  }
}

export function appendAiTaskEvent(
  task: AiTask,
  event: AiTaskTracePayload | AiTaskTraceEvent,
): AiTask {
  if (["succeeded", "failed", "cancelled", "outcome-unknown"].includes(task.status)) {
    throw new Error(`cannot append trace to terminal task: ${task.status}`);
  }
  const canonical = normalizeTraceEvent(task, event);
  if ("reason" in canonical && canonical.reason && UNSAFE_TEXT.test(canonical.reason)) {
    throw new Error("unsafe task text");
  }
  const next = { ...task, history: [...task.history, canonical] };
  registerAiTask(next);
  return next;
}

function containsUnsafeTraceText(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return UNSAFE_TEXT.test(value) || (value.length >= 128 && LONG_BASE64.test(value));
  }
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsUnsafeTraceText(item, seen));
  return Object.values(value).some((item) => containsUnsafeTraceText(item, seen));
}

function isTraceEvent(event: { type: string }): event is AiTaskTracePayload {
  return TRACE_EVENT_TYPES.has(event.type as AiTaskTracePayload["type"]);
}

function requireStatus(task: AiTask, allowed: AiTaskStatus[]): void {
  if (!allowed.includes(task.status)) {
    throw new Error(`cannot transition ${task.status} with this event`);
  }
}
