import { describe, expect, it, vi } from "vitest";
import { validateSequentialExecutionPlan } from "@/lib/ai/orchestration/executionGraph";
import { runSequentialExecutionPlan } from "@/lib/ai/orchestration/turnOrchestrator";

describe("Sequential Multi-Specialist Execution Pipeline (BUILD-03)", () => {
  const samplePlanRaw = {
    id: "plan-test-1",
    planToken: "tok-123",
    originalPrompt: "Create a coffee badge and vector icon with marketing copy",
    summary: "Multi-specialist coffee badge creation",
    steps: [
      {
        id: "step-gen-1",
        name: "Generate Coffee Illustration",
        specialist: "image_generator",
        description: "Generate minimal flat coffee cup art",
        toolOrModelAlias: "image-gpt-2",
        payload: { prompt: "minimalist coffee cup icon" },
        qualityThreshold: 0.8,
      },
      {
        id: "step-vec-2",
        name: "Vectorize Artwork",
        specialist: "vectorizer",
        description: "Trace raster image into SVG curves",
        toolOrModelAlias: "local-vtracer",
        dependsOnStepId: "step-gen-1",
        payload: { filterSpeckle: 4 },
        qualityThreshold: 0.85,
      },
      {
        id: "step-copy-3",
        name: "Generate Thai Headline",
        specialist: "copywriter",
        description: "Generate punchy Thai brand copy",
        toolOrModelAlias: "gemini-2.0-flash",
        payload: { tone: "modern" },
        qualityThreshold: 0.75,
      },
    ],
  };

  it("executes all steps sequentially to completion", async () => {
    const validated = validateSequentialExecutionPlan(samplePlanRaw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const onProgress = vi.fn();
    const finalPlan = await runSequentialExecutionPlan(validated.plan, {
      onStepProgress: onProgress,
    });

    expect(finalPlan.overallStatus).toBe("completed");
    expect(finalPlan.steps).toHaveLength(3);
    expect(finalPlan.steps[0].status).toBe("completed");
    expect(finalPlan.steps[1].status).toBe("completed");
    expect(finalPlan.steps[2].status).toBe("completed");

    // Verify artifact outputs
    expect(finalPlan.steps[0].result?.artifactKind).toBe("image");
    expect(finalPlan.steps[1].result?.artifactKind).toBe("mask");
    expect(finalPlan.steps[2].result?.artifactKind).toBe("text");

    expect(onProgress).toHaveBeenCalled();
  });

  it("passes upstream dependency output into downstream step executor", async () => {
    const validated = validateSequentialExecutionPlan(samplePlanRaw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const receivedDeps: Record<string, unknown> = {};

    const finalPlan = await runSequentialExecutionPlan(validated.plan, {
      executeSpecialistStep: async (step, depOutput) => {
        receivedDeps[step.id] = depOutput;
        if (step.id === "step-gen-1") {
          return {
            artifactKind: "image",
            data: { url: "https://asset.artshift.io/coffee.png" },
            reviewScore: 0.95,
          };
        }
        if (step.id === "step-vec-2") {
          return {
            artifactKind: "mask",
            data: { svg: "<svg></svg>", sourceImage: depOutput },
            reviewScore: 0.9,
          };
        }
        return {
          artifactKind: "text",
          data: { headline: "กาแฟเพื่อวันใหม่" },
          reviewScore: 0.9,
        };
      },
    });

    expect(finalPlan.overallStatus).toBe("completed");
    expect(receivedDeps["step-gen-1"]).toBeUndefined();
    expect(receivedDeps["step-vec-2"]).toEqual({
      url: "https://asset.artshift.io/coffee.png",
    });
  });

  it("pauses execution when a step fails its quality threshold (Exception Gating)", async () => {
    const validated = validateSequentialExecutionPlan(samplePlanRaw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const finalPlan = await runSequentialExecutionPlan(validated.plan, {
      executeSpecialistStep: async (step) => {
        if (step.id === "step-gen-1") {
          // Low score triggers gate
          return {
            artifactKind: "image",
            data: { url: "https://asset.artshift.io/poor.png" },
            reviewScore: 0.55, // Under 0.8 threshold
            notes: "Composition blurry",
          };
        }
        return {
          artifactKind: "text",
          data: {},
          reviewScore: 1.0,
        };
      },
    });

    expect(finalPlan.overallStatus).toBe("paused");
    expect(finalPlan.currentStepIndex).toBe(0);
    expect(finalPlan.steps[0].status).toBe("paused_on_gate");
    // Steps 2 and 3 should still be pending
    expect(finalPlan.steps[1].status).toBe("pending");
    expect(finalPlan.steps[2].status).toBe("pending");
  });

  it("handles abort signal gracefully and marks overall status as aborted", async () => {
    const validated = validateSequentialExecutionPlan(samplePlanRaw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const controller = new AbortController();
    controller.abort(); // Pre-aborted

    const finalPlan = await runSequentialExecutionPlan(validated.plan, {
      signal: controller.signal,
    });

    expect(finalPlan.overallStatus).toBe("aborted");
  });

  it("records error and transitions to paused when a specialist throws an exception", async () => {
    const validated = validateSequentialExecutionPlan(samplePlanRaw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const finalPlan = await runSequentialExecutionPlan(validated.plan, {
      executeSpecialistStep: async (step) => {
        if (step.id === "step-gen-1") {
          throw new Error("Provider rate limit reached");
        }
        return { artifactKind: "text", data: {}, reviewScore: 1.0 };
      },
    });

    expect(finalPlan.overallStatus).toBe("paused");
    expect(finalPlan.steps[0].status).toBe("failed");
    expect(finalPlan.steps[0].error).toBe("Provider rate limit reached");
    expect(finalPlan.steps[1].status).toBe("pending");
  });
});
