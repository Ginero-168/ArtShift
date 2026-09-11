import { describe, expect, it, vi } from "vitest";
import type { SequentialExecutionPlan } from "@/lib/ai/orchestration/executionGraph";
import { advancePlanStep } from "@/lib/ai/orchestration/executionGraph";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import { createAiTask } from "@/lib/ai/orchestration/taskMachine";
import { useEngine } from "@/lib/engine/store";

vi.mock("@/lib/ai/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/imageGeneration")>();
  return {
    ...actual,
    generateAIImage: vi.fn().mockResolvedValue({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "file-evidence-1",
      width: 1024,
      height: 1024,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: "Create a realistic pig",
    }),
    resolveImageGenerationDimensions: vi.fn().mockReturnValue({ width: 1024, height: 1024 }),
  };
});

vi.mock("@/lib/engine/imageCache", () => ({
  preloadDataURL: vi.fn().mockResolvedValue({
    fileId: "file-evidence-1",
    dataURL: "data:image/png;base64,AA==",
    width: 1024,
    height: 1024,
  }),
}));

vi.mock("@/lib/vision/visionEngine", () => ({
  visionCaption: vi.fn().mockResolvedValue("A photo of a pig"),
  visionDetect: vi.fn().mockResolvedValue(["pig"]),
  visionOcr: vi.fn().mockResolvedValue(""),
}));

describe("ORCH-02: Truthful Evidence & Review Contract", () => {
  it("records status: 'unavailable' and passed: false when reviewer service fails", async () => {
    // Setup clean engine state
    useEngine.setState((s) => ({
      ...s,
      slides: [
        {
          id: "slide-evidence",
          title: "Slide",
          elements: [],
          width: 1920,
          height: 1080,
          background: "#ffffff",
        },
      ],
      activeSlideId: "slide-evidence",
    }));

    const basePlan = {
      id: "task-evidence-fail",
      prompt: "Create a realistic pig",
      subAgent: "image_generator",
      capability: "IMAGE_DEFAULT",
      quality: "medium" as const,
      qualityRationale: "standard",
      maxAttempts: 2,
      selectedImages: [],
      analysisComplete: true,
      cloudConsentRequired: true,
      estimatedMaxCostUsd: 0.1,
      harnessVersion: ARTSHIFT_HARNESS_VERSION,
      harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
      reviewCriteria: ["Accurate pig anatomy", "Natural daylight"],
    };

    const task = createAiTask(basePlan);

    const failingReview = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

    const result = await runContextAwareImageTask(task, [], {
      cloudConsent: true,
      analyzeOutput: async () => ({
        caption: "a pig in grass",
        objects: ["pig"],
        visibleText: "",
        limitations: [],
      }),
      reviewOutput: failingReview,
    });

    // Verify task succeeded because image was valid, but the review pass was truthfully recorded as unavailable
    expect(result.task.status).toBe("succeeded");

    const reviewEvent = result.task.history.find((e) => e.type === "director.reviewed");
    expect(reviewEvent).toBeDefined();
    if (reviewEvent && reviewEvent.type === "director.reviewed") {
      // Must NOT be passed: true!
      expect(reviewEvent.passed).toBe(false);
      expect(reviewEvent.status).toBe("unavailable");
      expect(reviewEvent.reason).toContain("503 Service Unavailable");
      expect(reviewEvent.criteriaEvidence?.length).toBe(2);
      expect(reviewEvent.criteriaEvidence?.[0].status).toBe("unavailable");
    }
  });

  it("records status: 'reviewed' and criteria evidence when review passes", async () => {
    useEngine.setState((s) => ({
      ...s,
      slides: [
        {
          id: "slide-evidence-pass",
          title: "Slide",
          elements: [],
          width: 1920,
          height: 1080,
          background: "#ffffff",
        },
      ],
      activeSlideId: "slide-evidence-pass",
    }));

    const task = createAiTask({
      id: "task-evidence-pass",
      prompt: "Create a realistic pig",
      subAgent: "image_generator",
      capability: "IMAGE_DEFAULT",
      quality: "medium" as const,
      qualityRationale: "standard",
      maxAttempts: 2,
      selectedImages: [],
      analysisComplete: true,
      cloudConsentRequired: true,
      estimatedMaxCostUsd: 0.1,
      harnessVersion: ARTSHIFT_HARNESS_VERSION,
      harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
      reviewCriteria: ["Accurate pig anatomy"],
    });

    const passingReview = vi.fn().mockResolvedValue({
      passed: true,
      status: "reviewed" as const,
      summary: "Pig anatomy is realistic and well-proportioned",
      criteriaEvidence: [
        {
          criterion: "Accurate pig anatomy",
          status: "passed" as const,
          notes: "Realistic anatomy",
        },
      ],
    });

    const result = await runContextAwareImageTask(task, [], {
      cloudConsent: true,
      analyzeOutput: async () => ({
        caption: "a pig in grass",
        objects: ["pig"],
        visibleText: "",
        limitations: [],
      }),
      reviewOutput: passingReview,
    });

    expect(result.task.status).toBe("succeeded");

    const reviewEvent = result.task.history.find((e) => e.type === "director.reviewed");
    expect(reviewEvent).toBeDefined();
    if (reviewEvent && reviewEvent.type === "director.reviewed") {
      expect(reviewEvent.passed).toBe(true);
      expect(reviewEvent.status).toBe("reviewed");
      expect(reviewEvent.criteriaEvidence?.[0].status).toBe("passed");
    }
  });

  it("does not fabricate a 1.0 reviewScore when step result has no review", () => {
    const mockPlan: SequentialExecutionPlan = {
      id: "plan-no-score",
      planToken: "tok-1",
      originalPrompt: "Do task",
      summary: "Plan with no score",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "copywriter",
          description: "Generate copy",
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

    const advanced = advancePlanStep(mockPlan, 0, {
      artifactKind: "text",
      data: { headline: "Hello" },
      reviewStatus: "not_checked",
    });

    expect(advanced.steps[0].status).toBe("completed");
    expect(advanced.steps[0].result?.reviewScore).toBeUndefined();
    expect(advanced.steps[0].result?.reviewStatus).toBe("not_checked");
  });

  it("pauses on gate when reviewStatus is explicitly failed", () => {
    const mockPlan: SequentialExecutionPlan = {
      id: "plan-failed-review",
      planToken: "tok-2",
      originalPrompt: "Do task",
      summary: "Plan with failed review",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "image_generator",
          description: "Generate image",
          toolOrModelAlias: "image-gpt-2",
          payload: {},
          attempt: 1,
          status: "running",
          qualityThreshold: 0.7,
        },
      ],
      currentStepIndex: 0,
      overallStatus: "executing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: true,
    };

    const advanced = advancePlanStep(mockPlan, 0, {
      artifactKind: "image",
      data: {},
      reviewStatus: "failed",
    });

    expect(advanced.steps[0].status).toBe("paused_on_gate");
    expect(advanced.overallStatus).toBe("paused");
  });
});
