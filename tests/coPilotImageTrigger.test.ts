import { beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());
const preloadDataURLMock = vi.hoisted(() => vi.fn());
const prepareDirectionMock = vi.hoisted(() => vi.fn());
const reviewOutputMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/imageGeneration")>();
  return { ...actual, generateAIImage: generateImageMock };
});

vi.mock("@/lib/engine/imageCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine/imageCache")>();
  return { ...actual, preloadDataURL: preloadDataURLMock };
});

vi.mock("@/lib/ai/orchestration/creativeDirectorClient", () => ({
  prepareRemoteCreativeDirection: prepareDirectionMock,
  reviewRemoteCreativeOutput: reviewOutputMock,
}));

vi.mock("@/lib/vision/visionEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vision/visionEngine")>();
  return {
    ...actual,
    visionCaption: vi.fn().mockResolvedValue("a cat in a studio portrait"),
    visionDetect: vi.fn().mockResolvedValue({
      objects: [{ label: "cat", score: 0.99, box: [0, 0, 10, 10] }],
    }),
    visionOcr: vi.fn().mockResolvedValue(""),
  };
});

import { executeCoPilotInstruction } from "@/lib/ai/coPilot";
import { createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";

describe("AI Co-Pilot image commands", () => {
  beforeEach(() => {
    generateImageMock.mockClear();
    generateImageMock.mockResolvedValue({
      dataUrl: "data:image/png;base64,AA==",
      fileId: "generated-image",
      width: 1024,
      height: 1024,
      seed: 1,
      model: "openai/gpt-image-2",
      prompt: "แมว",
    });
    preloadDataURLMock.mockReset();
    preloadDataURLMock.mockResolvedValue({
      fileId: "generated-image",
      dataURL: "data:image/png;base64,AA==",
      img: {} as HTMLImageElement,
      width: 1024,
      height: 1024,
    });
    prepareDirectionMock.mockReset();
    reviewOutputMock.mockReset();
    prepareDirectionMock.mockResolvedValue({
      kind: "image-task",
      summary: "Studio profile image",
      refinedPrompt: "Studio portrait of a cat for a square profile image",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: ["instagram-post"],
      reviewCriteria: ["cat is the clear subject"],
      search: { required: false, queries: [], sources: [] },
    });
    reviewOutputMock.mockResolvedValue({
      passed: true,
      summary: "Matches the approved direction.",
    });

    const layer = createEngineLayer("free", { name: "Test Layer" });
    useEngine.setState({
      doc: {
        id: "doc-1",
        title: "Test Doc",
        width: 1920,
        height: 1080,
        slides: [
          {
            id: "slide-1",
            name: "Slide 1",
            width: 1920,
            height: 1080,
            background: "#ffffff",
            layers: [layer],
            elements: [createText({ x: 100, y: 100, width: 400, height: 80, text: "Title" })],
          },
        ],
        snapGrid: null,
        workspaceStrictness: 1,
        strictnessLevel: 1,
        strictnessValues: { 2: 1, 3: 2 },
        updatedAt: Date.now(),
        schemaVersion: 2,
      },
      currentSlideId: "slide-1",
      selectedIds: new Set(),
    });
  });

  it("returns the explicit unavailable-model reason without calling the Director or image provider", async () => {
    const result = await executeCoPilotInstruction(
      "สร้างภาพโปสเตอร์คอนเสิร์ตสีแดงจัดจ้าน ใช้ Flux",
      undefined,
      { cloudConsent: true },
    );

    expect(result.reply).toContain("Model flux-2-max ยังไม่พร้อม");
    expect(prepareDirectionMock).not.toHaveBeenCalled();
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it("clarifies a short Thai image request before generation", async () => {
    const result = await executeCoPilotInstruction("ขอภาพแมว");

    expect(result.actions[0]?.agent).toBe("orchestrator");
    expect(result.reply).toContain("direction");
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it("uses one validated image path without exposing an execution mode", async () => {
    const result = await executeCoPilotInstruction(
      "ขอภาพแมวในสตูดิโอสำหรับโปรไฟล์ อัตราส่วน 1:1",
      undefined,
      {
        contextAwareValidated: true,
        imageQuality: "medium",
        cloudConsent: true,
      },
    );

    expect(result.actions[0]).not.toHaveProperty("mode");
    expect(result.reply).not.toMatch(/Eco|Fast/);
    expect(prepareDirectionMock).toHaveBeenCalledTimes(1);
    expect(generateImageMock).toHaveBeenCalledTimes(1);
  });

  it("preloads the generated image before committing it to the canvas", async () => {
    let releasePreload: (value: {
      fileId: string;
      dataURL: string;
      img: HTMLImageElement;
      width: number;
      height: number;
    }) => void = () => {};
    preloadDataURLMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePreload = resolve;
        }),
    );

    const execution = executeCoPilotInstruction(
      "ขอภาพแมวในสตูดิโอสำหรับโปรไฟล์ อัตราส่วน 1:1",
      undefined,
      {
        contextAwareValidated: true,
        imageQuality: "medium",
        cloudConsent: true,
      },
    );
    await vi.waitFor(() =>
      expect(preloadDataURLMock).toHaveBeenCalledWith("data:image/png;base64,AA=="),
    );

    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.some((element) => element.type === "image"),
    ).toBe(false);

    releasePreload({
      fileId: "generated-image",
      dataURL: "data:image/png;base64,AA==",
      img: {} as HTMLImageElement,
      width: 1024,
      height: 1024,
    });
    await execution;

    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.some((element) => element.type === "image"),
    ).toBe(true);
  });

  it("does not commit an image when generated image preload fails", async () => {
    preloadDataURLMock.mockRejectedValue(new Error("generated image decode failed"));

    const result = await executeCoPilotInstruction(
      "ขอภาพแมวในสตูดิโอสำหรับโปรไฟล์ อัตราส่วน 1:1",
      undefined,
      {
        contextAwareValidated: true,
        imageQuality: "medium",
        cloudConsent: true,
      },
    );

    expect(result.reply).toContain("generated image decode failed");
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.some((element) => element.type === "image"),
    ).toBe(false);
  });
});
