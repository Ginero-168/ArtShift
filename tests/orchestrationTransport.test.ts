import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareRemoteOrchestratorTurn } from "@/lib/ai/orchestration/creativeDirectorClient";
import type { ArtworkExecutionContext } from "@/lib/designAgent/contracts";

describe("ORCH-01: Orchestration Transport & Normalization", () => {
  const originalFetch = globalThis.fetch;

  const mockDesignContext: ArtworkExecutionContext = {
    docId: "doc-123",
    baseRevision: 1,
    artworkId: "art-123",
    artworkWidth: 1920,
    artworkHeight: 1080,
    hasSelection: false,
    selectedObjectIds: [],
    snapshot: {},
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes and returns a valid design-plan when designContext is present", async () => {
    const validProposal = {
      protocolVersion: 1,
      planId: "plan-1",
      executionToken: "token-1",
      baseRevision: 1,
      summary: "Add banner and heading",
      commands: [
        {
          id: "cmd-1",
          kind: "insert_shape" as const,
          target: { docId: "doc-123", artworkId: "art-123", baseRevision: 1, layerId: "layer-1" },
          payload: {
            shape: "rect" as const,
            x: 10,
            y: 10,
            width: 200,
            height: 100,
          },
        },
      ],
      estimatedRemoteCostUsd: 0.001,
      requiresApproval: true,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        direction: {
          kind: "design-plan",
          proposal: validProposal,
        },
      }),
    });

    const result = await prepareRemoteOrchestratorTurn({
      prompt: "Adjust banner",
      canvasSummary: { objectCount: 1, selectedCount: 0, width: 1920, height: 1080 },
      designContext: mockDesignContext,
      referenceAnalyses: [],
    });

    expect(result.kind).toBe("design-plan");
    if (result.kind === "design-plan") {
      expect(result.proposal.planId).toBe("plan-1");
      expect(result.proposal.requiresApproval).toBe(true);
      expect(result.proposal.commands.length).toBe(1);
    }
  });

  it("fails validation when design-plan is returned but designContext is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        direction: {
          kind: "design-plan",
          proposal: {
            protocolVersion: 1,
            planId: "plan-1",
            executionToken: "token-1",
            baseRevision: 1,
            summary: "Add banner",
            commands: [
              {
                id: "cmd-1",
                kind: "insert_shape" as const,
                target: {
                  docId: "doc-123",
                  artworkId: "art-123",
                  baseRevision: 1,
                  layerId: "layer-1",
                },
                payload: {
                  shape: "rect" as const,
                  x: 10,
                  y: 10,
                  width: 200,
                  height: 100,
                },
              },
            ],
            estimatedRemoteCostUsd: 0,
            requiresApproval: true,
          },
        },
      }),
    });

    await expect(
      prepareRemoteOrchestratorTurn({
        prompt: "Add banner",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
        referenceAnalyses: [],
      }),
    ).rejects.toThrow(/missing designContext/i);
  });

  it("normalizes sequential-plan and validates steps", async () => {
    const validSequentialPlan = {
      id: "seq-plan-1",
      planToken: "tok-123",
      originalPrompt: "Create logo and vectorize",
      rationale: "Image generation then vector conversion",
      steps: [
        {
          id: "s1",
          specialist: "image_generator",
          toolOrModelAlias: "image-gpt-2",
          title: "Generate logo",
          description: "Generate minimal logo",
          prompt: "minimal coffee logo",
        },
        {
          id: "s2",
          specialist: "vectorizer",
          toolOrModelAlias: "vtracer",
          title: "Vectorize logo",
          description: "Convert bitmap logo to vector curves",
          dependsOnStepId: "s1",
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        direction: {
          kind: "sequential-plan",
          plan: validSequentialPlan,
        },
      }),
    });

    const result = await prepareRemoteOrchestratorTurn({
      prompt: "Create logo and vectorize",
      canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
      referenceAnalyses: [],
    });

    expect(result.kind).toBe("sequential-plan");
    if (result.kind === "sequential-plan") {
      expect(result.plan.steps.length).toBe(2);
      expect(result.plan.steps[0].status).toBe("pending");
      expect(result.plan.steps[1].dependsOnStepId).toBe("s1");
    }
  });

  it("normalizes image-task and sets default count and modelAlias", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        direction: {
          kind: "image-task",
          summary: "Create cute pig",
          refinedPrompt: "A high quality photo of a cute pig",
          specialist: "image_generator",
          capability: "IMAGE_DEFAULT",
          requestedOutputCount: 3,
          knowledgeSkillIds: [],
          reviewCriteria: [
            "Anatomy is accurate and natural",
            "Fur texture and lighting look realistic",
          ],
          search: { required: false, queries: [], sources: [] },
        },
      }),
    });

    const result = await prepareRemoteOrchestratorTurn({
      prompt: "Create cute pig",
      canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
      referenceAnalyses: [],
    });

    expect(result.kind).toBe("image-task");
    if (result.kind === "image-task") {
      expect(result.requestedOutputCount).toBe(3);
      expect(result.modelAlias).toBe("image-gpt-2");
      expect(result.specialist).toBe("image_generator");
    }
  });

  it("extracts embedded JSON direction wrapped in an answer text block", async () => {
    const rawEmbedded = JSON.stringify({
      kind: "clarification",
      question: "Which style of coffee cup do you prefer?",
      options: ["Minimal ceramic", "Paper takeaway", "Glass mug"],
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        direction: {
          kind: "answer",
          text: `   ${rawEmbedded}   `,
        },
      }),
    });

    const result = await prepareRemoteOrchestratorTurn({
      prompt: "Draw coffee cup",
      canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
      referenceAnalyses: [],
    });

    expect(result.kind).toBe("clarification");
    if (result.kind === "clarification") {
      expect(result.options.length).toBe(3);
      expect(result.question).toContain("coffee cup");
    }
  });

  it("throws clear error when HTTP response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "AI service temporarily overloaded" }),
    });

    await expect(
      prepareRemoteOrchestratorTurn({
        prompt: "Draw logo",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
        referenceAnalyses: [],
      }),
    ).rejects.toThrow("AI service temporarily overloaded");
  });
});
