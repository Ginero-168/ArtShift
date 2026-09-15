import { beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());
const preloadDataURLMock = vi.hoisted(() => vi.fn());
const getCachedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/imageGeneration")>();
  return {
    ...actual,
    generateAIImage: generateImageMock,
    GPT_IMAGE_2_ESTIMATED_COST_USD: 0.05,
    resolveImageGenerationDimensions: () => ({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    }),
  };
});
vi.mock("@/lib/engine/imageCache", () => ({
  getCached: getCachedMock,
  preloadDataURL: preloadDataURLMock,
}));

import type { CreativeDirection } from "@/lib/ai/orchestration/creativeDirector";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import { runContextAwareImageRun } from "@/lib/ai/orchestration/imageBatchRunner";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import type { AiTaskPlan } from "@/lib/ai/orchestration/taskMachine";
import { createAiTask } from "@/lib/ai/orchestration/taskMachine";
import { createDirectedImageRun } from "@/lib/ai/orchestration/turnOrchestrator";
import { clearCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { createHistory } from "@/lib/engine/history";
import { createEngineLayer } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";
import {
  calculateGhostBounds,
  drawGhostVariationOverlay,
  type GhostVariationOverlay,
} from "@/lib/renderer/ghostOverlay";

const basePlan: AiTaskPlan = {
  id: "staged-task-1",
  prompt: "สร้างภาพร้านอาหารญี่ปุ่น minimalist",
  subAgent: "image_generator",
  capability: "IMAGE_DEFAULT",
  quality: "medium",
  qualityRationale: "standard",
  maxAttempts: 1,
  selectedImages: [],
  analysisComplete: true,
  cloudConsentRequired: true,
  estimatedMaxCostUsd: 0.1,
  harnessVersion: ARTSHIFT_HARNESS_VERSION,
  harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
};

function resetEngine() {
  const layer = createEngineLayer("free", { name: "Main" });
  useEngine.setState({
    doc: {
      id: "doc-staged",
      title: "Staged Flow",
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "slide-staged",
          name: "Slide 1",
          width: 1920,
          height: 1080,
          background: "#ffffff",
          layers: [layer],
          elements: [],
        },
      ],
      snapGrid: null,
      workspaceStrictness: 1,
      strictnessLevel: 1,
      strictnessValues: { 2: 1, 3: 2 },
      updatedAt: Date.now(),
      schemaVersion: 2,
    },
    currentSlideId: "slide-staged",
    history: createHistory(),
    selectedIds: new Set(),
    activeGhostOverlay: null,
  });
}

describe("Staged Candidate Variations & Ghost Overlay Flow (BUILD-05)", () => {
  beforeEach(() => {
    clearCanvasViewport();
    resetEngine();
    generateImageMock.mockReset();
    preloadDataURLMock.mockReset();
    getCachedMock.mockReset();
    getCachedMock.mockReturnValue(undefined);

    generateImageMock.mockResolvedValue({
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileId: "file-staged-1",
      width: 1024,
      height: 1024,
      costUsd: 0.05,
    });
    preloadDataURLMock.mockResolvedValue({
      dataURL:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileId: "file-staged-1",
      width: 1024,
      height: 1024,
    });
  });

  it("executes task with stageOnly: true without mutating canvas elements", async () => {
    const task = createAiTask(basePlan);
    const initialElementCount = useEngine.getState().currentSlide()?.elements.length ?? 0;

    const result = await runContextAwareImageTask(task, [], {
      cloudConsent: true,
      stageOnly: true,
    });

    expect(result.fileId).toBe("file-staged-1");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.task.status).toBe("succeeded");

    // Verified: No elements added to the slide
    const slideElements = useEngine.getState().currentSlide()?.elements ?? [];
    expect(slideElements.length).toBe(initialElementCount);
  });

  it("runs image run batch with stageOnly: true forwarding into all tasks", async () => {
    const direction: CreativeDirection = {
      kind: "image-task",
      outputCount: 1,
      requestedOutputCount: 2,
      outputBriefs: ["แบบที่ 1 มุมกว้าง", "แบบที่ 2 โคลสอัพ"],
      summary: "ภาพร้านซูชิ 2 แบบ",
      refinedPrompt: "Japanese sushi restaurant aesthetic",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: ["Professional sushi presentation"],
      search: { required: false, queries: [], sources: [] },
    };

    const run = createDirectedImageRun(
      {
        prompt: "สร้างภาพร้านซูชิ 2 แบบ",
        refs: [],
        analyses: [],
      },
      direction,
    );

    const initialElementCount = useEngine.getState().currentSlide()?.elements.length ?? 0;

    const runResult = await runContextAwareImageRun(run, [], {
      cloudConsent: true,
      stageOnly: true,
    });

    expect(runResult.completedCount).toBe(2);
    expect(runResult.status).toBe("succeeded");

    // Verified: Slide remains untouched
    const slideElements = useEngine.getState().currentSlide()?.elements ?? [];
    expect(slideElements.length).toBe(initialElementCount);
  });

  it("handles Ghost Overlay activation and non-destructive preview rendering", () => {
    const state = useEngine.getState();
    expect(state.activeGhostOverlay).toBeNull();

    const slide = state.currentSlide()!;
    const ghostBounds = calculateGhostBounds(slide.width, slide.height, 1024, 1024, "center");

    const overlay: GhostVariationOverlay = {
      variationId: "var-1",
      image: {} as HTMLImageElement,
      x: ghostBounds.x,
      y: ghostBounds.y,
      width: ghostBounds.width,
      height: ghostBounds.height,
      opacity: 0.85,
      label: "Candidate Variation 1",
    };

    state.setGhostOverlay(overlay);
    expect(useEngine.getState().activeGhostOverlay).toEqual(overlay);

    // Verify drawing on Canvas Context
    const ctxMock = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 100 }),
      setLineDash: vi.fn(),
      globalAlpha: 1.0,
      strokeStyle: "",
      lineWidth: 1,
      fillStyle: "",
      font: "",
      textBaseline: "",
    };

    drawGhostVariationOverlay(overlay, { ctx: ctxMock as unknown as CanvasRenderingContext2D });
    expect(ctxMock.save).toHaveBeenCalled();
    expect(ctxMock.strokeRect).toHaveBeenCalledWith(
      ghostBounds.x,
      ghostBounds.y,
      ghostBounds.width,
      ghostBounds.height,
    );
    expect(ctxMock.fillText).toHaveBeenCalledWith(
      "✨ Candidate Variation 1",
      expect.any(Number),
      expect.any(Number),
    );

    // Clearing ghost overlay
    state.clearGhostOverlay();
    expect(useEngine.getState().activeGhostOverlay).toBeNull();
  });

  it("commits a staged variation cleanly to the canvas with history snapshot", () => {
    const state = useEngine.getState();
    const slide = state.currentSlide()!;
    const bounds = calculateGhostBounds(slide.width, slide.height, 1024, 1024, "center");

    // User chooses to commit Candidate 1
    const element = createImage({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fileId: "file-staged-1",
      naturalWidth: 1024,
      naturalHeight: 1024,
      name: "ร้านอาหารญี่ปุ่น (ตัวเลือกที่ 1)",
    });

    state.addElement(element, "Apply candidate variation 1");
    state.selectOnly([element.id]);

    const updatedSlide = useEngine.getState().currentSlide()!;
    expect(updatedSlide.elements.length).toBe(1);
    expect(updatedSlide.elements[0].id).toBe(element.id);
    expect(useEngine.getState().selectedIds.has(element.id)).toBe(true);
    expect(useEngine.getState().history.past.length).toBe(1);
  });
});
