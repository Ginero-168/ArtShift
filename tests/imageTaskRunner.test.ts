import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());
const preloadDataURLMock = vi.hoisted(() => vi.fn());
const getCachedMock = vi.hoisted(() => vi.fn());
const visionCaptionMock = vi.hoisted(() => vi.fn());
const visionDetectMock = vi.hoisted(() => vi.fn());
const visionOcrMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageGeneration", () => ({
  generateAIImage: generateImageMock,
  GPT_IMAGE_2_ESTIMATED_COST_USD: 0.05,
  resolveImageGenerationDimensions: () => ({
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
  }),
}));
vi.mock("@/lib/engine/imageCache", () => ({
  getCached: getCachedMock,
  preloadDataURL: preloadDataURLMock,
}));
vi.mock("@/lib/vision/visionEngine", () => ({
  visionCaption: visionCaptionMock,
  visionDetect: visionDetectMock,
  visionOcr: visionOcrMock,
}));

import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import type { AiTaskPlan } from "@/lib/ai/orchestration/taskMachine";
import { createAiTask, getAiTask } from "@/lib/ai/orchestration/taskMachine";
import {
  clearCanvasViewport,
  getCanvasViewport,
  publishCanvasViewport,
} from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { getGenerationPreviewBounds } from "@/lib/engine/generationPlacement";
import { createHistory } from "@/lib/engine/history";
import { createEngineLayer } from "@/lib/engine/layers";
import { getProcessingPreviews } from "@/lib/engine/processingPreview";
import { useEngine } from "@/lib/engine/store";

const plan: AiTaskPlan = {
  id: "task-runner-1",
  prompt: "สร้างภาพ product photo แบบสตูดิโอ",
  subAgent: "image_generator",
  capability: "IMAGE_DEFAULT",
  quality: "medium",
  qualityRationale: "standard",
  maxAttempts: 2,
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
      id: "doc-runner",
      title: "Runner",
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "slide-runner",
          name: "Slide",
          width: 1920,
          height: 1080,
          background: "#fff",
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
    currentSlideId: "slide-runner",
    history: createHistory(),
    selectedIds: new Set(),
  });
}

describe("context-aware image task runner", () => {
  beforeEach(() => {
    clearCanvasViewport();
    resetEngine();
    generateImageMock.mockReset();
    preloadDataURLMock.mockReset();
    getCachedMock.mockReset();
    getCachedMock.mockReturnValue(undefined);
    visionCaptionMock.mockReset();
    visionDetectMock.mockReset();
    visionOcrMock.mockReset();
    visionCaptionMock.mockResolvedValue("a usable generated image");
    visionDetectMock.mockResolvedValue({ objects: [] });
    visionOcrMock.mockResolvedValue("");
    generateImageMock.mockResolvedValue({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "generated-file",
      width: 1024,
      height: 1024,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: plan.prompt,
    });
    preloadDataURLMock.mockResolvedValue({
      dataURL: "data:image/png;base64,AA==",
      fileId: "generated-file",
      img: {} as HTMLImageElement,
      width: 1024,
      height: 1024,
    });
  });

  afterEach(() => {
    expect(getProcessingPreviews()).toHaveLength(0);
  });

  it("keeps the document unchanged until preload, then commits once", async () => {
    const events: string[] = [];
    const result = await runContextAwareImageTask(createAiTask(plan), [], {
      cloudConsent: true,
      onUpdate: (update) => events.push(update.stage),
    });

    expect(result.width).toBe(1024);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
    expect(events).toEqual(
      expect.arrayContaining([
        "queued",
        "generating",
        "quality-check",
        "preloading",
        "committing",
        "succeeded",
      ]),
    );
    expect(new Set(events).size).toBeGreaterThan(4);
    expect(useEngine.getState().history.past).toHaveLength(1);
    expect(result.task.harnessVersion).toBe("2.2");
    expect(result.task.history.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "task.created",
        "intent.assessed",
        "provider.requested",
        "quality.checked",
        "preload.completed",
        "commit.started",
        "commit.completed",
        "task.succeeded",
      ]),
    );
    expect(getAiTask(result.task.id)).toMatchObject({ status: "succeeded" });
  });

  it("commits at the latest viewport after a pan or zoom during generation", async () => {
    const latestViewport = {
      width: 400,
      height: 300,
      scale: 1,
      tx: -800,
      ty: -400,
      slideWidth: 1920,
      slideHeight: 1080,
    } as const;
    publishCanvasViewport({
      width: 400,
      height: 300,
      scale: 1,
      tx: 0,
      ty: 0,
      slideWidth: 1920,
      slideHeight: 1080,
    });
    generateImageMock.mockImplementationOnce(async () => {
      publishCanvasViewport(latestViewport);
      return {
        dataUrl: "data:image/png;base64,AA==",
        fileId: "generated-latest-viewport",
        width: 1024,
        height: 1024,
        seed: 0,
        model: "openai/gpt-image-2",
        prompt: plan.prompt,
      };
    });

    await runContextAwareImageTask(createAiTask(plan), [], { cloudConsent: true });

    const inserted = useEngine.getState().currentSlide()?.elements[0];
    expect(inserted).toMatchObject(
      getGenerationPreviewBounds(getCanvasViewport() ?? latestViewport, {
        width: 1024,
        height: 1024,
      }),
    );
  });

  it("uses the Creative Director review to diagnose and repair a generated result", async () => {
    const reviewOutput = vi
      .fn()
      .mockResolvedValueOnce({
        passed: false,
        summary: "The product is too small in the frame.",
        repairInstruction: "Make the product the dominant subject with clearer hierarchy.",
      })
      .mockResolvedValueOnce({
        passed: true,
        summary: "The product is now dominant and the hierarchy is clear.",
      });
    const directorTask = createAiTask({
      ...plan,
      id: "director-review-task",
      reviewCriteria: ["product is the dominant subject", "hierarchy is clear"],
    });

    const result = await runContextAwareImageTask(directorTask, [], {
      cloudConsent: true,
      analyzeOutput: async () => ({
        caption: "a product bottle in a studio",
        objects: ["product bottle"],
        visibleText: "",
        limitations: [],
      }),
      reviewOutput,
    });

    expect(reviewOutput).toHaveBeenCalledTimes(2);
    expect(generateImageMock).toHaveBeenCalledTimes(2);
    expect(generateImageMock.mock.calls[1]?.[0]?.prompt).toContain(
      "Make the product the dominant subject",
    );
    expect(result.task.history.filter((event) => event.type === "director.reviewed")).toHaveLength(
      2,
    );
  });

  it("performs one diagnosed quality retry and no more", async () => {
    generateImageMock
      .mockRejectedValueOnce(new Error("Generated image failed the visual quality gate"))
      .mockResolvedValueOnce({
        dataUrl: "data:image/png;base64,AA==",
        fileId: "generated-file-2",
        width: 1024,
        height: 1024,
        seed: 0,
        model: "openai/gpt-image-2",
        prompt: plan.prompt,
      });
    preloadDataURLMock.mockResolvedValue({
      dataURL: "data:image/png;base64,AA==",
      fileId: "generated-file-2",
      img: {} as HTMLImageElement,
      width: 1024,
      height: 1024,
    });

    const events: string[] = [];
    await runContextAwareImageTask(createAiTask(plan), [], {
      cloudConsent: true,
      onUpdate: (update) => events.push(update.stage),
    });

    expect(generateImageMock).toHaveBeenCalledTimes(2);
    const firstPrompt = generateImageMock.mock.calls[0]?.[0]?.prompt;
    const retryPrompt = generateImageMock.mock.calls[1]?.[0]?.prompt;
    expect(retryPrompt).toBeTypeOf("string");
    expect(retryPrompt).not.toBe(firstPrompt);
    expect(generateImageMock.mock.calls[0]?.[0]).not.toHaveProperty("maxCostUsd");
    expect(generateImageMock.mock.calls[1]?.[0]).not.toHaveProperty("maxCostUsd");
    expect(events).toContain("retrying");
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
  });

  it("continues a quality retry without applying the legacy task cost estimate", async () => {
    generateImageMock.mockRejectedValueOnce(
      new Error("Generated image failed the visual quality gate"),
    );

    await expect(
      runContextAwareImageTask(
        createAiTask({ ...plan, id: "quality-first", estimatedMaxCostUsd: 0 }),
        [],
        { cloudConsent: true },
      ),
    ).resolves.toMatchObject({ task: { status: "succeeded" } });
    expect(generateImageMock).toHaveBeenCalledTimes(2);
  });

  it("passes a verified selected-image reference to the provider and preserves the source", async () => {
    const source = {
      ...createImage({
        x: 40,
        y: 40,
        width: 300,
        height: 200,
        fileId: "source-file",
        naturalWidth: 600,
        naturalHeight: 400,
      }),
      id: "source-image",
      version: 1,
      name: "Product",
    };
    useEngine.setState((state) => ({
      doc: {
        ...state.doc,
        slides: state.doc.slides.map((slide) => ({ ...slide, elements: [source] })),
      },
    }));
    getCachedMock.mockReturnValue({
      dataURL: "data:image/png;base64,REF",
      width: 600,
      height: 400,
    });
    const selectedRef = {
      objectId: source.id,
      elementVersion: source.version,
      fileId: source.fileId,
      displayName: "Product",
      sourceWidth: 600,
      sourceHeight: 400,
      width: 300,
      height: 200,
      angle: 0,
    };
    const selectedPlan: AiTaskPlan = {
      ...plan,
      id: "task-with-reference",
      subAgent: "image_editor",
      quality: "high",
      selectedImages: [selectedRef],
      referenceFacts: [
        {
          objectId: selectedRef.objectId,
          caption: "a usable generated image",
          objects: [],
          visibleText: "",
          limitations: [],
        },
      ],
    };

    await runContextAwareImageTask(createAiTask(selectedPlan), [selectedRef], {
      cloudConsent: true,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImages: [{ dataUrl: "data:image/png;base64,REF", mimeType: "image/png" }],
        quality: "high",
      }),
      expect.any(AbortSignal),
    );
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(2);
    expect(useEngine.getState().currentSlide()?.elements[0]?.id).toBe("source-image");
  });

  it("fails closed when the selected element version changes before execution", async () => {
    const source = {
      ...createImage({
        x: 40,
        y: 40,
        width: 300,
        height: 200,
        fileId: "source-file",
        naturalWidth: 600,
        naturalHeight: 400,
      }),
      id: "source-image",
      version: 2,
      name: "Product",
    };
    useEngine.setState((state) => ({
      doc: {
        ...state.doc,
        slides: state.doc.slides.map((slide) => ({ ...slide, elements: [source] })),
      },
    }));
    const staleRef = {
      objectId: source.id,
      elementVersion: 1,
      fileId: source.fileId,
      displayName: "Product",
      sourceWidth: 600,
      sourceHeight: 400,
      width: 300,
      height: 200,
      angle: 0,
    };

    await expect(
      runContextAwareImageTask(
        createAiTask({ ...plan, id: "stale-reference", selectedImages: [staleRef] }),
        [staleRef],
        { cloudConsent: true },
      ),
    ).rejects.toThrow("selected image changed");
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
  });

  it("fails closed when the Canvas target changes before commit", async () => {
    generateImageMock.mockImplementation(async () => {
      useEngine.setState((state) => ({
        doc: { ...state.doc, updatedAt: state.doc.updatedAt + 1 },
      }));
      return {
        dataUrl: "data:image/png;base64,AA==",
        fileId: "generated-file",
        width: 1024,
        height: 1024,
        seed: 0,
        model: "openai/gpt-image-2",
        prompt: plan.prompt,
      };
    });

    let failure: unknown;
    try {
      await runContextAwareImageTask(createAiTask(plan), [], { cloudConsent: true });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      message: expect.stringContaining("Canvas target changed"),
      task: { status: "failed" },
    });

    expect(generateImageMock).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(0);
    expect(useEngine.getState().history.past).toHaveLength(0);
  });

  it("publishes a terminal task when a reference is stale before queueing", async () => {
    const staleRef = {
      objectId: "stale-image",
      elementVersion: 1,
      fileId: "stale-file",
      displayName: "stale-image.png",
      sourceWidth: 256,
      sourceHeight: 256,
      width: 256,
      height: 256,
      angle: 0,
    };
    const staleTask = createAiTask({
      ...plan,
      id: "stale-reference-task",
      selectedImages: [
        {
          objectId: staleRef.objectId,
          elementVersion: staleRef.elementVersion,
          fileId: staleRef.fileId,
          displayName: staleRef.displayName,
        },
      ],
    });

    await expect(
      runContextAwareImageTask(staleTask, [staleRef], { cloudConsent: true }),
    ).rejects.toMatchObject({ task: { status: "failed" } });
    expect(getAiTask(staleTask.id)?.status).toBe("failed");
    expect(getAiTask(staleTask.id)?.history.some((event) => event.type === "task.failed")).toBe(
      true,
    );
  });

  it("preserves a typed provider outcome-unknown without retrying", async () => {
    const outcomeUnknown = new Error(
      "AI provider result is uncertain; no duplicate request was created.",
    );
    outcomeUnknown.name = "OutcomeUnknownError";
    generateImageMock.mockRejectedValueOnce(outcomeUnknown);

    await expect(
      runContextAwareImageTask(createAiTask(plan), [], { cloudConsent: true }),
    ).rejects.toMatchObject({
      name: "OutcomeUnknownError",
      task: { status: "outcome-unknown" },
    });

    expect(generateImageMock).toHaveBeenCalledTimes(1);
    expect(getAiTask(plan.id)?.status).toBe("outcome-unknown");
    expect(getAiTask(plan.id)?.history.some((event) => event.type === "task.outcome-unknown")).toBe(
      true,
    );
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(0);
    expect(useEngine.getState().history.past).toHaveLength(0);
  });

  it("requires explicit consent before queueing a cloud task", async () => {
    await expect(runContextAwareImageTask(createAiTask(plan), [])).rejects.toThrow("consent");

    expect(generateImageMock).not.toHaveBeenCalled();
    expect(getProcessingPreviews()).toHaveLength(0);
  });

  it("does not commit when local semantic output evidence fails the brief", async () => {
    visionCaptionMock.mockResolvedValue("a landscape photograph");
    visionDetectMock.mockResolvedValue({ objects: [{ label: "tree" }] });
    visionOcrMock.mockResolvedValue("");

    await expect(
      runContextAwareImageTask(
        createAiTask({ ...plan, id: "semantic-failure", requiredSubjects: ["mug"] }),
        [],
        { cloudConsent: true },
      ),
    ).rejects.toThrow("quality gate");

    expect(generateImageMock).toHaveBeenCalledTimes(2);
    expect(preloadDataURLMock).not.toHaveBeenCalled();
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(0);
    expect(useEngine.getState().history.past).toHaveLength(0);
  });

  it("clears the transient preview and document when the provider is cancelled", async () => {
    const controller = new AbortController();
    generateImageMock.mockImplementation(async () => {
      controller.abort();
      const error = new Error("cancelled by user");
      error.name = "AbortError";
      throw error;
    });

    await expect(
      runContextAwareImageTask(createAiTask(plan), [], {
        cloudConsent: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(getAiTask(plan.id)?.status).toBe("cancelled");
    expect(getAiTask(plan.id)?.history.some((event) => event.type === "task.cancelled")).toBe(true);
    expect(getProcessingPreviews()).toHaveLength(0);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(0);
    expect(useEngine.getState().history.past).toHaveLength(0);
  });
});
