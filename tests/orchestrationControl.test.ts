import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareRemoteTurnMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/orchestration/creativeDirectorClient", () => ({
  prepareRemoteOrchestratorTurn: prepareRemoteTurnMock,
  prepareRemoteCreativeDirection: prepareRemoteTurnMock,
}));

import type { SequentialExecutionPlan } from "@/lib/ai/orchestration/executionGraph";
import {
  controlRun,
  observeSession,
  submitTurn,
  useDirectorSession,
} from "@/lib/ai/orchestration/turnOrchestrator";

describe("ORCH-05: Single-Task Lifecycle & Control API", () => {
  beforeEach(() => {
    prepareRemoteTurnMock.mockReset();
    useDirectorSession.setState({
      sessionId: "session-test-01",
      turns: [],
      activeGhostVariationId: undefined,
      currentSnapshotId: undefined,
    });
  });

  it("handles canvas inventory locally without calling remote director", async () => {
    const response = await submitTurn({
      prompt: "สรุปสิ่งที่อยู่บน canvas",
      canvas: {
        slide: {
          id: "slide-1",
          name: "Main Slide",
          width: 1920,
          height: 1080,
          background: "#ffffff",
          layers: [],
          elements: [
            {
              id: "text-1",
              type: "text",
              name: "Title",
              x: 100,
              y: 100,
              width: 300,
              height: 50,
              opacity: 1,
              rotation: 0,
              isLocked: false,
              isDeleted: false,
              layerId: "layer-1",
              text: "Hello World",
              fontSize: 32,
              fontFamily: "Inter",
              fill: "#000000",
              align: "left",
            } as any,
          ],
        },
        selectedIds: new Set(),
      },
    });

    expect(response.kind).toBe("answer");
    if (response.kind === "answer") {
      expect(response.source).toBe("canvas-local");
      expect(response.reply).toContain("บน Canvas มี 1 Object");
      expect(response.reply).toContain("Hello World");
    }
    expect(prepareRemoteTurnMock).not.toHaveBeenCalled();
  });

  it("routes clarification from remote director into structured PendingClarification", async () => {
    prepareRemoteTurnMock.mockResolvedValueOnce({
      kind: "clarification",
      question: "ต้องการพื้นหลังแบบไหน?",
      options: ["ทุ่งหญ้า", "ในบ้าน"],
    });

    const response = await submitTurn({
      prompt: "วาดรูปหมู",
      refs: [],
    });

    expect(response.kind).toBe("clarification");
    if (response.kind === "clarification") {
      expect(response.question).toBe("ต้องการพื้นหลังแบบไหน?");
      expect(response.options).toEqual(["ทุ่งหญ้า", "ในบ้าน"]);
      expect(response.pendingClarification.originalPrompt).toBe("วาดรูปหมู");
      expect(response.pendingClarification.options).toHaveLength(2);
      expect(response.pendingClarification.round).toBe(1);
    }
  });

  it("routes image-task into a fully initialized DirectedImageRun", async () => {
    prepareRemoteTurnMock.mockResolvedValueOnce({
      kind: "image-task",
      summary: "สร้างภาพหมูในทุ่งหญ้า",
      refinedPrompt: "A cute pig standing in a lush green grass field, sunny day",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: ["Animal anatomy is realistic", "Lighting is natural"],
      requiredSubjects: ["pig"],
      requestedOutputCount: 3,
      search: { required: false, queries: [], sources: [] },
    });

    const response = await submitTurn({
      prompt: "สร้างรูปหมู 3 รูป",
    });

    expect(response.kind).toBe("image-task");
    if (response.kind === "image-task") {
      expect(response.imageRun.requestedOutputCount).toBe(3);
      expect(response.imageRun.tasks[0]?.capability).toBe("IMAGE_DEFAULT");
      expect(response.direction.modelAlias).toBe("image-gpt-2");
    }
  });

  it("controls sequential plan execution: cancel aborts plan idempotently", async () => {
    const plan: SequentialExecutionPlan = {
      id: "plan-cancel",
      planToken: "tok-1",
      originalPrompt: "Multi-step plan",
      summary: "Multi-step plan",
      requiresApproval: true,
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          specialist: "image_generator",
          description: "Create hero image",
          toolOrModelAlias: "image-gpt-2",
          payload: {},
          attempt: 1,
          status: "pending",
        },
      ],
      currentStepIndex: 0,
      overallStatus: "executing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isApproved: true,
    };

    const result = await controlRun({
      runId: plan.id,
      action: "cancel",
      plan,
    });

    expect(result.status).toBe("aborted");
    expect(result.plan?.overallStatus).toBe("aborted");
  });

  it("observes current session state cleanly", () => {
    useDirectorSession.setState({
      sessionId: "session-active-42",
      turns: [
        {
          id: "turn-1",
          role: "user",
          content: "สร้างรูป",
          timestamp: 1000,
        },
      ],
      activeGhostVariationId: "ghost-99",
      currentSnapshotId: "snap-1",
    });

    const obs = observeSession("session-active-42");
    expect(obs.sessionId).toBe("session-active-42");
    expect(obs.turns).toHaveLength(1);
    expect(obs.activeGhostVariationId).toBe("ghost-99");
    expect(obs.currentSnapshotId).toBe("snap-1");
  });
});
