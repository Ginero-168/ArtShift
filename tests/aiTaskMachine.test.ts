import { describe, expect, it } from "vitest";
import {
  type AiTaskEvent,
  type AiTaskPlan,
  appendAiTaskEvent,
  assertAiTaskHarness,
  createAiTask,
  reduceAiTask,
} from "@/lib/ai/orchestration/taskMachine";

const plan: AiTaskPlan = {
  id: "task-1",
  prompt: "สร้างภาพแมวในบ้าน",
  subAgent: "image_generator",
  capability: "IMAGE_DEFAULT",
  quality: "medium",
  qualityRationale: "งานทั่วไปที่ intent ครบ",
  maxAttempts: 2,
  selectedImages: [],
  analysisComplete: true,
  cloudConsentRequired: true,
  estimatedMaxCostUsd: 0.02,
};

describe("AI task state machine", () => {
  it("creates a task only after analysis is complete", () => {
    expect(() => createAiTask({ ...plan, analysisComplete: false })).toThrow(
      "analysis must complete before task creation",
    );
    expect(createAiTask(plan)).toMatchObject({ status: "awaiting-consent", attempt: 0 });
    expect(createAiTask(plan).history[0]).toMatchObject({
      type: "task.created",
      subAgent: "image_generator",
      capability: "IMAGE_DEFAULT",
    });
  });

  it("accepts the execution lifecycle and records attempt events", () => {
    let task = createAiTask(plan);
    const events: AiTaskEvent[] = [];
    for (const event of [
      { type: "consent-granted" },
      { type: "queued" },
      { type: "running" },
      { type: "quality-check" },
      { type: "preloading" },
      { type: "committing" },
      { type: "succeeded" },
    ] as const) {
      const next = reduceAiTask(task, event);
      task = next.task;
      events.push(...next.events);
    }
    expect(task.status).toBe("succeeded");
    expect(task.attempt).toBe(1);
    expect(events.some((event) => event.type === "task.started")).toBe(true);
  });

  it("records typed orchestration events without exposing image data", () => {
    let task = createAiTask(plan);
    task = appendAiTaskEvent(task, { type: "reference.analysis.started", count: 1 });
    task = appendAiTaskEvent(task, { type: "reference.analysis.completed", count: 1 });
    task = appendAiTaskEvent(task, { type: "intent.assessed", complete: true });
    task = appendAiTaskEvent(task, {
      type: "provider.requested",
      attempt: 1,
      subAgent: "image_generator",
    });
    task = appendAiTaskEvent(task, { type: "quality.checked", passed: true, attempt: 1 });
    task = appendAiTaskEvent(task, { type: "preload.completed", attempt: 1 });
    task = appendAiTaskEvent(task, { type: "commit.started", attempt: 1 });
    task = appendAiTaskEvent(task, { type: "commit.completed", attempt: 1 });

    expect(task.history.map((event) => event.type)).toEqual([
      "task.created",
      "reference.analysis.started",
      "reference.analysis.completed",
      "intent.assessed",
      "provider.requested",
      "quality.checked",
      "preload.completed",
      "commit.started",
      "commit.completed",
    ]);
    expect(JSON.stringify(task.history)).not.toMatch(
      /data:image|replicate\.delivery|api[_-]?key/iu,
    );
  });

  it("does not allow outcome-unknown to become an automatic retry", () => {
    let task = createAiTask(plan);
    task = reduceAiTask(task, { type: "consent-granted" }).task;
    task = reduceAiTask(task, { type: "queued" }).task;
    task = reduceAiTask(task, { type: "running" }).task;
    task = reduceAiTask(task, { type: "outcome-unknown", reason: "network timeout" }).task;
    expect(task.status).toBe("outcome-unknown");
    expect(() => reduceAiTask(task, { type: "retry", reason: "blind retry" })).toThrow(
      "cannot retry an unknown outcome",
    );
  });

  it("rejects data URLs and provider URLs from task descriptions", () => {
    expect(() => createAiTask({ ...plan, prompt: "data:image/png;base64,secret" })).toThrow(
      "unsafe task text",
    );
    expect(() =>
      reduceAiTask(createAiTask(plan), {
        type: "failed",
        reason: "https://replicate.delivery/p/secret",
      }),
    ).toThrow("unsafe task text");
  });

  it("rejects a task whose Harness trace is forged", () => {
    const task = createAiTask(plan);
    expect(() =>
      assertAiTaskHarness({
        harnessVersion: "1.0",
        harnessRuleIds: task.harnessRuleIds,
      }),
    ).toThrow("task Harness contract is invalid");
  });
});
