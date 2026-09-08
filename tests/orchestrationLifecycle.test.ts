import { describe, expect, it, vi } from "vitest";
import type { SequentialExecutionPlan } from "@/lib/ai/orchestration/executionGraph";
import { advancePlanStep } from "@/lib/ai/orchestration/executionGraph";
import { runSequentialExecutionPlan } from "@/lib/ai/orchestration/turnOrchestrator";

describe("ORCH-03: Lifecycle, Approval Versioning & No-Op Safeguards", () => {
  it("advancePlanStep sets currentStepIndex to steps.length when final step completes", () => {
    const plan: SequentialExecutionPlan = {
      id: "plan-advance",
      planToken: "tok-1",
      originalPrompt: "Test plan",
      summary: "Testing advancePlanStep terminal index",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "copywriter",
          description: "Step 1",
          toolOrModelAlias: "copywriter",
          payload: {},
          attempt: 1,
          status: "running",
        },
      ],
      currentStepIndex: 0,
      overallStatus: "executing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: true,
    };

    const completed = advancePlanStep(plan, 0, {
      artifactKind: "text",
      data: { headline: "Done" },
      reviewStatus: "not_checked",
    });

    expect(completed.overallStatus).toBe("completed");
    // currentStepIndex must be steps.length (1), not 0!
    expect(completed.currentStepIndex).toBe(1);
  });

  it("runSequentialExecutionPlan is an idempotent no-op when plan is already completed", async () => {
    const completedPlan: SequentialExecutionPlan = {
      id: "plan-completed",
      planToken: "tok-completed",
      originalPrompt: "Completed task",
      summary: "Plan that already finished",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "copywriter",
          description: "Step 1",
          toolOrModelAlias: "copywriter",
          payload: {},
          attempt: 1,
          status: "completed",
          result: { artifactKind: "text", data: { headline: "Done" } },
        },
      ],
      currentStepIndex: 1,
      overallStatus: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: true,
    };

    const executeSpy = vi.fn();

    const result = await runSequentialExecutionPlan(completedPlan, {
      executeSpecialistStep: executeSpy,
    });

    // Must not execute any specialist steps
    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.overallStatus).toBe("completed");
    expect(result.currentStepIndex).toBe(1);
  });

  it("runSequentialExecutionPlan is an idempotent no-op when plan is aborted", async () => {
    const abortedPlan: SequentialExecutionPlan = {
      id: "plan-aborted",
      planToken: "tok-aborted",
      originalPrompt: "Aborted task",
      summary: "Plan cancelled by user",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "copywriter",
          description: "Step 1",
          toolOrModelAlias: "copywriter",
          payload: {},
          attempt: 1,
          status: "skipped",
        },
      ],
      currentStepIndex: 0,
      overallStatus: "aborted",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: false,
    };

    const executeSpy = vi.fn();

    const result = await runSequentialExecutionPlan(abortedPlan, {
      executeSpecialistStep: executeSpy,
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.overallStatus).toBe("aborted");
  });

  it("repeat resume does not re-execute already completed steps", async () => {
    const partiallyDonePlan: SequentialExecutionPlan = {
      id: "plan-partial",
      planToken: "tok-partial",
      originalPrompt: "Two step plan",
      summary: "Testing step skipping on resume",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "copywriter",
          description: "Step 1 already finished",
          toolOrModelAlias: "copywriter",
          payload: {},
          attempt: 1,
          status: "completed",
          result: { artifactKind: "text", data: { text: "Step 1 done" } },
        },
        {
          id: "step-2",
          name: "Step 2",
          specialist: "layout_designer",
          description: "Step 2 pending",
          toolOrModelAlias: "layout_designer",
          payload: {},
          attempt: 0,
          status: "pending",
        },
      ],
      currentStepIndex: 0, // Even if index wasn't advanced properly
      overallStatus: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: true,
    };

    const executedStepIds: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (step) => {
      executedStepIds.push(step.id);
      return {
        artifactKind: "layout_commands",
        data: {},
        reviewStatus: "not_checked",
      };
    });

    const result = await runSequentialExecutionPlan(partiallyDonePlan, {
      executeSpecialistStep: executeMock,
    });

    // Step 1 was completed, so ONLY Step 2 should be executed!
    expect(executedStepIds).toEqual(["step-2"]);
    expect(result.overallStatus).toBe("completed");
    expect(result.currentStepIndex).toBe(2);
  });
});
