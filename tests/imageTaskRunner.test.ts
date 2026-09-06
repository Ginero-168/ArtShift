import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());
const preloadDataURLMock = vi.hoisted(() => vi.fn());
const getCachedMock = vi.hoisted(() => vi.fn());
const visionCaptionMock = vi.hoisted(() => vi.fn());
const visionDetectMock = vi.hoisted(() => vi.fn());
const visionOcrMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageGeneration", () => ({ generateAIImage: generateImageMock }));
vi.mock("@/lib/engine/imageCache", () => ({
  getCached: getCachedMock,
  preloadDataURL: preloadDataURLMock,
}));
vi.mock("@/lib/vision/visionEngine", () => ({
  visionCaption: visionCaptionMock,
  visionDetect: visionDetectMock,
  visionOcr: visionOcrMock,
}));

import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import type { AiTaskPlan } from "@/lib/ai/orchestration/taskMachine";
import { createAiTask } from "@/lib/ai/orchestration/taskMachine";
import { createImage } from "@/lib/engine/factory";
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
  estimatedMaxCostUsd: 0.05,
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
    expect(events).toContain("retrying");
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
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

    expect(getProcessingPreviews()).toHaveLength(0);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(0);
    expect(useEngine.getState().history.past).toHaveLength(0);
  });
});
