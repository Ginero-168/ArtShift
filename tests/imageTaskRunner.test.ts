import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());
const preloadDataURLMock = vi.hoisted(() => vi.fn());
const getCachedMock = vi.hoisted(() => vi.fn());
const visionCaptionMock = vi.hoisted(() => vi.fn());
const visionDetectMock = vi.hoisted(() => vi.fn());
const visionOcrMock = vi.hoisted(() => vi.fn());
const expandImageMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/ai/orchestration/imageExpand", () => ({
  expandImageToAspectRatio: expandImageMock,
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
import { clearCanvasViewport, publishCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { createHistory } from "@/lib/engine/history";
import { createEngineLayer } from "@/lib/engine/layers";
import { getProcessingPreviewById, getProcessingPreviews } from "@/lib/engine/processingPreview";
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
    expandImageMock.mockReset();
    preloadDataURLMock.mockReset();
    getCachedMock.mockReset();
    getCachedMock.mockReturnValue(undefined);
    visionCaptionMock.mockReset();
    visionDetectMock.mockReset();
    visionOcrMock.mockReset();
    visionCaptionMock.mockResolvedValue("a usable generated image");
    visionDetectMock.mockResolvedValue({ objects: [] });
    visionOcrMock.mockResolvedValue("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("vision api not mocked");
      }),
    );
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
    vi.unstubAllGlobals();
    expect(getProcessingPreviews()).toHaveLength(0);
  });

  it("keeps the document unchanged until preload, then commits once", async () => {
    const events: string[] = [];
    const result = await runContextAwareImageTask(createAiTask(plan), [], {
      cloudConsent: true,
      onUpdate: (update) => events.push(update.stage),
    });

    expect(result.width).toBe(1024);
    expect(result.model).toBe("openai/gpt-image-2");
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

  it("places the generate preview beside the source image like other preloads", async () => {
    publishCanvasViewport({
      width: 800,
      height: 600,
      scale: 1,
      tx: 0,
      ty: 0,
      slideWidth: 1920,
      slideHeight: 1080,
    });
    const source = createImage({
      x: 120,
      y: 90,
      width: 300,
      height: 450,
      fileId: "source-file",
      naturalWidth: 900,
      naturalHeight: 1350,
    });
    useEngine.getState().addElements([source]);
    const ref = {
      objectId: source.id,
      elementVersion: source.version,
      fileId: source.fileId,
      displayName: "Source",
      sourceWidth: 900,
      sourceHeight: 1350,
      width: source.width,
      height: source.height,
      angle: 0,
    };
    getCachedMock.mockReturnValue({
      dataURL: "data:image/png;base64,AA==",
      fileId: "source-file",
      img: { naturalWidth: 900, naturalHeight: 1350, width: 900, height: 1350 } as HTMLImageElement,
      width: 900,
      height: 1350,
    });

    let previewDuringGeneration: ReturnType<typeof getProcessingPreviewById> | undefined;
    generateImageMock.mockImplementationOnce(async () => {
      previewDuringGeneration = getProcessingPreviews()[0];
      return {
        dataUrl: "data:image/png;base64,AA==",
        fileId: "generated-beside",
        width: 768,
        height: 1024,
        seed: 0,
        model: "openai/gpt-image-2",
        prompt: plan.prompt,
      };
    });

    try {
      await runContextAwareImageTask(createAiTask(plan), [ref], { cloudConsent: true });
    } catch {
      // Placement is asserted from the live preview; later gates may still fail in this stub.
    }

    expect(previewDuringGeneration).toBeDefined();
    expect(previewDuringGeneration!.x).toBeGreaterThan(source.x + source.width);
    expect(previewDuringGeneration!.y).toBe(source.y);
  });

  it("keeps the generate preview fixed when the Canvas pans during generation", async () => {
    const initialViewport = {
      width: 400,
      height: 300,
      scale: 1,
      tx: 0,
      ty: 0,
      slideWidth: 1920,
      slideHeight: 1080,
    } as const;
    const pannedAwayViewport = {
      ...initialViewport,
      tx: -800,
      ty: -400,
    } as const;
    publishCanvasViewport(initialViewport);

    let previewDuringGeneration: ReturnType<typeof getProcessingPreviewById> | undefined;
    generateImageMock.mockImplementationOnce(async () => {
      const previews = getProcessingPreviews();
      expect(previews).toHaveLength(1);
      const locked = { ...previews[0]! };
      publishCanvasViewport(pannedAwayViewport);
      // Allow any viewport listeners a turn to run (regression guard).
      await Promise.resolve();
      previewDuringGeneration = getProcessingPreviewById(locked.id);
      expect(previewDuringGeneration).toMatchObject({
        x: locked.x,
        y: locked.y,
        width: locked.width,
        height: locked.height,
      });
      expect(previewDuringGeneration!.width).toBeGreaterThan(40);
      expect(previewDuringGeneration!.height).toBeGreaterThan(40);
      return {
        dataUrl: "data:image/png;base64,AA==",
        fileId: "generated-stable-preview",
        width: 1024,
        height: 1024,
        seed: 0,
        model: "openai/gpt-image-2",
        prompt: plan.prompt,
      };
    });

    await runContextAwareImageTask(createAiTask(plan), [], {
      cloudConsent: true,
    });

    const inserted = useEngine.getState().currentSlide()?.elements[0];
    expect(previewDuringGeneration).toBeDefined();
    expect(inserted).toMatchObject({
      x: previewDuringGeneration!.x,
      y: previewDuringGeneration!.y,
      width: previewDuringGeneration!.width,
      height: previewDuringGeneration!.height,
    });
    // Panned-away visible area must not be used for a tiny commit.
    expect(inserted!.width).toBeGreaterThan(40);
    expect(inserted!.height).toBeGreaterThan(40);
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
        slides: state.doc.slides.map((slide) => ({
          ...slide,
          elements: [source],
        })),
      },
    }));
    getCachedMock.mockReturnValue({
      dataURL: "data:image/png;base64,REF",
      width: 600,
      height: 400,
    });
    generateImageMock.mockResolvedValue({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "generated-file",
      width: 2048,
      height: 1360,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: plan.prompt,
    });
    preloadDataURLMock.mockResolvedValue({
      dataURL: "data:image/png;base64,AA==",
      fileId: "generated-file",
      img: {} as HTMLImageElement,
      width: 2048,
      height: 1360,
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
        slides: state.doc.slides.map((slide) => ({
          ...slide,
          elements: [source],
        })),
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
        createAiTask({
          ...plan,
          id: "stale-reference",
          selectedImages: [staleRef],
        }),
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
      await runContextAwareImageTask(createAiTask(plan), [], {
        cloudConsent: true,
      });
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
        createAiTask({
          ...plan,
          id: "semantic-failure",
          requiredSubjects: ["mug"],
        }),
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

  it("falls back to technical dimensions and aspect ratio when local vision output analysis times out or fails", async () => {
    const taskWithSubject = createAiTask({
      ...plan,
      id: "timeout-guard-task",
      requiredSubjects: ["pig"],
    });

    const result = await runContextAwareImageTask(taskWithSubject, [], {
      cloudConsent: true,
      analyzeOutput: async () => {
        throw new Error("Local vision output analysis timed out");
      },
    });

    expect(result.dataUrl).toBe("data:image/png;base64,AA==");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
  });

  it("continues with validated output to canvas when Creative Director review times out", async () => {
    const directorTask = createAiTask({
      ...plan,
      id: "director-timeout-task",
      reviewCriteria: ["mood is energetic"],
    });

    const result = await runContextAwareImageTask(directorTask, [], {
      cloudConsent: true,
      analyzeOutput: async () => ({
        caption: "a vibrant energetic poster",
        objects: ["poster"],
        visibleText: "",
        limitations: [],
      }),
      reviewOutput: async () => {
        throw new Error("Creative Director review pass timed out");
      },
    });

    expect(result.dataUrl).toBe("data:image/png;base64,AA==");
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
    const reviewEvent = result.task.history.find((e) => e.type === "director.reviewed");
    expect(reviewEvent).toBeDefined();
    expect(reviewEvent?.status).toBe("unavailable");
  });

  it("requests native custom aspect and commits an image (never Frame-crops)", async () => {
    generateImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "native-3x1",
      width: 2048,
      height: 688,
      seed: 0,
      model: "openai/gpt-image-2.5-sunburst",
      prompt: "Signboard 60x20cm Welearn native 3:1",
    });
    preloadDataURLMock.mockResolvedValueOnce({
      dataURL: "data:image/png;base64,AA==",
      fileId: "native-3x1",
      img: {} as HTMLImageElement,
      width: 2048,
      height: 688,
    });

    const nativeTask = createAiTask({
      ...plan,
      id: "native-3x1-task",
      requestedDimensions: {
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
      },
    });

    const result = await runContextAwareImageTask(nativeTask, [], {
      cloudConsent: true,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
      }),
      expect.any(AbortSignal),
    );
    expect(result.width).toBe(2048);
    expect(result.height).toBe(688);
    const inserted = useEngine.getState().currentSlide()?.elements[0];
    expect(inserted?.type).toBe("image");
  });

  it("expands clamped >3:1 generations (e.g. 29×7) to the print canvas after quality gates", async () => {
    generateImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "center-3x1",
      width: 2048,
      height: 688,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: "Shelftalk 29x7 cm",
    });
    expandImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,EXPANDED==",
      fileId: "expanded-29x7",
      width: 2848,
      height: 688,
      layout: {
        axis: "horizontal",
        targetWidth: 2848,
        targetHeight: 688,
        center: { x: 400, y: 0, width: 2048, height: 688 },
        leftGap: 400,
        rightGap: 400,
        topGap: 0,
        bottomGap: 0,
      },
    });
    preloadDataURLMock.mockResolvedValueOnce({
      dataURL: "data:image/png;base64,EXPANDED==",
      fileId: "expanded-29x7",
      img: {} as HTMLImageElement,
      width: 2848,
      height: 688,
    });

    const ultraWideTask = createAiTask({
      ...plan,
      id: "ultra-wide-29x7-task",
      prompt: "สร้าง shelftalk 29x7 cm",
      requestedDimensions: {
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
        ratioClamped: true,
        printWidth: 2848,
        printHeight: 688,
      },
    });

    const result = await runContextAwareImageTask(ultraWideTask, [], {
      cloudConsent: true,
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 2048,
        height: 688,
      }),
      expect.any(AbortSignal),
    );
    expect(expandImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ratioWidth: 2848,
        ratioHeight: 688,
        sourceDataUrl: "data:image/png;base64,AA==",
      }),
    );
    expect(result.width).toBe(2848);
    expect(result.height).toBe(688);
    expect(result.width / result.height).toBeCloseTo(29 / 7, 1);
  });

  it("does not expand when ratio is within the 3:1 model cap", async () => {
    generateImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "native-3x1-b",
      width: 2048,
      height: 688,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: "ป้าย 60x20cm",
    });
    preloadDataURLMock.mockResolvedValueOnce({
      dataURL: "data:image/png;base64,AA==",
      fileId: "native-3x1-b",
      img: {} as HTMLImageElement,
      width: 2048,
      height: 688,
    });

    const withinCapTask = createAiTask({
      ...plan,
      id: "within-cap-3x1-task",
      requestedDimensions: {
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
        ratioClamped: false,
        printWidth: 2048,
        printHeight: 688,
      },
    });

    await runContextAwareImageTask(withinCapTask, [], { cloudConsent: true });
    expect(expandImageMock).not.toHaveBeenCalled();
  });

  it("expands clamped ultra-tall generations (e.g. 7×29) to the print canvas", async () => {
    generateImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "center-1x3",
      width: 688,
      height: 2048,
      seed: 0,
      model: "openai/gpt-image-2",
      prompt: "ป้ายแนวตั้ง 7x29 cm",
    });
    expandImageMock.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,EXPANDED-TALL==",
      fileId: "expanded-7x29",
      width: 688,
      height: 2848,
      layout: {
        axis: "vertical",
        targetWidth: 688,
        targetHeight: 2848,
        center: { x: 0, y: 400, width: 688, height: 2048 },
        leftGap: 0,
        rightGap: 0,
        topGap: 400,
        bottomGap: 400,
      },
    });
    preloadDataURLMock.mockResolvedValueOnce({
      dataURL: "data:image/png;base64,EXPANDED-TALL==",
      fileId: "expanded-7x29",
      img: {} as HTMLImageElement,
      width: 688,
      height: 2848,
    });

    const ultraTallTask = createAiTask({
      ...plan,
      id: "ultra-tall-7x29-task",
      prompt: "สร้างป้ายแนวตั้ง 7x29 cm",
      requestedDimensions: {
        width: 688,
        height: 2048,
        aspectRatio: "688x2048",
        ratioClamped: true,
        printWidth: 688,
        printHeight: 2848,
      },
    });

    const result = await runContextAwareImageTask(ultraTallTask, [], {
      cloudConsent: true,
    });

    expect(expandImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ratioWidth: 688,
        ratioHeight: 2848,
      }),
    );
    expect(result.width).toBe(688);
    expect(result.height).toBe(2848);
    expect(result.height / result.width).toBeCloseTo(29 / 7, 1);
  });

  it("prefers Gemini cloud vision over Florence for post-generate understanding", async () => {
    const callOrder: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/ai/vision-analyze")) {
          callOrder.push("cloud-api");
          return {
            ok: true,
            json: async () => ({
              success: true,
              result: {
                caption: "a studio product mug",
                objects: ["mug"],
                visibleText: "",
              },
              model: "google/gemini-3-flash",
            }),
          };
        }
        throw new Error(`unexpected fetch: ${String(input)}`);
      }),
    );
    visionCaptionMock.mockImplementation(async () => {
      callOrder.push("local-florence");
      return "florence caption";
    });

    const events: string[] = [];
    const result = await runContextAwareImageTask(
      createAiTask({
        ...plan,
        id: "cloud-vision-first",
        requiredSubjects: ["mug"],
      }),
      [],
      {
        cloudConsent: true,
        onUpdate: (update) => events.push(`${update.stage}:${update.message}`),
      },
    );

    expect(result.width).toBe(1024);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/ai/vision-analyze",
      expect.objectContaining({ method: "POST" }),
    );
    expect(visionCaptionMock).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["cloud-api"]);
    expect(events.some((event) => event.includes("Gemini 3 Flash"))).toBe(true);
    expect(events.some((event) => /florence/i.test(event))).toBe(false);
  });

  it("falls back to local Florence only after the cloud vision API misses", async () => {
    const callOrder: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callOrder.push("cloud-api");
        throw new Error("vision api down");
      }),
    );
    visionCaptionMock.mockImplementation(async () => {
      callOrder.push("local-florence");
      return "a usable generated mug";
    });
    visionDetectMock.mockResolvedValue({ objects: [{ label: "mug" }] });

    await runContextAwareImageTask(
      createAiTask({
        ...plan,
        id: "vision-local-fallback",
        requiredSubjects: ["mug"],
      }),
      [],
      { cloudConsent: true },
    );

    expect(callOrder[0]).toBe("cloud-api");
    expect(callOrder).toContain("local-florence");
    expect(callOrder.indexOf("local-florence")).toBeGreaterThan(callOrder.indexOf("cloud-api"));
  });
});
