import { describe, expect, it } from "vitest";
import {
  advancePlanStep,
  validateSequentialExecutionPlan,
} from "@/lib/ai/orchestration/executionGraph";

describe("Sequential Execution Plan & Pipeline Gating", () => {
  it("validates a well-formed sequential plan", () => {
    const rawPlan = {
      id: "plan-compound-1",
      originalPrompt: "Create sci-fi book promo",
      summary: "Generate background, extract title, format layout",
      steps: [
        {
          id: "step-1",
          name: "Background Image",
          specialist: "image_generator",
          description: "Generate deep space background",
          toolOrModelAlias: "image-gpt-2",
        },
        {
          id: "step-2",
          name: "Catchy Slogan",
          specialist: "copywriter",
          description: "Generate Thai sci-fi slogan",
          toolOrModelAlias: "gemini-2.0-flash",
          dependsOnStepId: "step-1",
        },
      ],
    };

    const validation = validateSequentialExecutionPlan(rawPlan);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    expect(validation.plan.steps).toHaveLength(2);
    expect(validation.plan.steps[0].status).toBe("pending");
    expect(validation.plan.requiresApproval).toBe(true);
    expect(validation.plan.isApproved).toBe(false);
  });

  it("rejects forward dependencies in a linear pipeline", () => {
    const invalidPlan = {
      id: "plan-bad-deps",
      steps: [
        {
          id: "step-1",
          specialist: "layout_designer",
          dependsOnStepId: "step-2", // Cannot depend on future step
        },
        {
          id: "step-2",
          specialist: "image_generator",
        },
      ],
    };

    const validation = validateSequentialExecutionPlan(invalidPlan);
    expect(validation.ok).toBe(false);
  });

  it("advances step when quality gate passes", () => {
    const rawPlan = {
      id: "plan-test",
      steps: [
        {
          id: "step-1",
          specialist: "image_generator",
          toolOrModelAlias: "image-gpt-2",
          qualityThreshold: 0.7,
        },
        {
          id: "step-2",
          specialist: "copywriter",
          toolOrModelAlias: "local-copywriter",
        },
      ],
    };

    const parsed = validateSequentialExecutionPlan(rawPlan);
    if (!parsed.ok) throw new Error("Should parse");

    const advanced = advancePlanStep(parsed.plan, 0, {
      artifactKind: "image",
      data: { url: "https://example.com/bg.png" },
      reviewScore: 0.95,
    });

    expect(advanced.steps[0].status).toBe("completed");
    expect(advanced.currentStepIndex).toBe(1);
    expect(advanced.overallStatus).toBe("executing");
  });

  it("pauses execution when quality gate falls below threshold", () => {
    const rawPlan = {
      id: "plan-test",
      steps: [
        {
          id: "step-1",
          specialist: "image_generator",
          toolOrModelAlias: "image-gpt-2",
          qualityThreshold: 0.8,
        },
        {
          id: "step-2",
          specialist: "copywriter",
          toolOrModelAlias: "local-copywriter",
        },
      ],
    };

    const parsed = validateSequentialExecutionPlan(rawPlan);
    if (!parsed.ok) throw new Error("Should parse");

    const paused = advancePlanStep(parsed.plan, 0, {
      artifactKind: "image",
      data: { url: "https://example.com/bg.png" },
      reviewScore: 0.5, // Low score
    });

    expect(paused.steps[0].status).toBe("paused_on_gate");
    expect(paused.overallStatus).toBe("paused");
    expect(paused.currentStepIndex).toBe(0);
  });

  it("pauses when a specialist returns no artifact", () => {
    const parsed = validateSequentialExecutionPlan({
      id: "plan-empty-result",
      steps: [
        {
          id: "step-1",
          specialist: "layout_designer",
          toolOrModelAlias: "local-layout",
        },
      ],
    });
    if (!parsed.ok) throw new Error("Should parse");

    const paused = advancePlanStep(parsed.plan, 0, undefined);

    expect(paused.overallStatus).toBe("paused");
    expect(paused.steps[0]).toMatchObject({
      status: "failed",
      error: "Specialist returned no result",
    });
  });
});
