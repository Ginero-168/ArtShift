import { beforeEach, describe, expect, it, vi } from "vitest";

const generateImageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageGeneration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/imageGeneration")>();
  return { ...actual, generateAIImage: generateImageMock };
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

  it("dispatches common Thai request phrasing to image generation", async () => {
    const result = await executeCoPilotInstruction("ขอภาพแมว");

    expect(result.actions[0]?.agent).toBe("image_gen");
    expect(generateImageMock).toHaveBeenCalledWith(expect.objectContaining({ prompt: "แมว" }));
  });

  it("uses one image path without exposing an execution mode", async () => {
    const result = await executeCoPilotInstruction("ขอภาพแมว");

    expect(result.actions[0]).not.toHaveProperty("mode");
    expect(result.reply).not.toMatch(/Eco|Fast/);
    expect(generateImageMock).toHaveBeenCalledTimes(1);
  });
});
