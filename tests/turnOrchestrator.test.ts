import { describe, expect, it } from "vitest";
import { prepareContextAwareTurn } from "@/lib/ai/orchestration/turnOrchestrator";
import { createRect } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";

const slide = {
  id: "slide-1",
  name: "Hero",
  width: 1920,
  height: 1080,
  background: "#fff",
  layers: [createEngineLayer("free", { name: "Main" })],
  elements: [createRect({ x: 10, y: 10, width: 100, height: 100 })],
};

describe("context-aware turn orchestrator", () => {
  it("answers Canvas inventory locally without creating a task", () => {
    const result = prepareContextAwareTurn({
      prompt: "บน Canvas มีอะไรอยู่บ้าง",
      refs: [],
      analyses: [],
      canvas: { slide, selectedIds: new Set() },
    });
    expect(result).toMatchObject({ kind: "answer", source: "canvas-local" });
  });

  it("returns clarification for an ambiguous image request", () => {
    const result = prepareContextAwareTurn({ prompt: "สร้างภาพแมว", refs: [], analyses: [] });
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.pending.options.map((option) => option.id)).toEqual(["A", "B", "C", "OTHER"]);
  });

  it("refuses to plan a selected-image task before analysis completes", () => {
    const ref = {
      objectId: "image-1",
      elementVersion: 2,
      fileId: "file-1",
      displayName: "product.png",
      sourceWidth: 100,
      sourceHeight: 100,
      width: 100,
      height: 100,
      angle: 0,
    };
    expect(() =>
      prepareContextAwareTurn({ prompt: "สร้างภาพโฆษณา", refs: [ref], analyses: [] }),
    ).toThrow("selected image analysis must complete before planning the task");
  });

  it("creates an image task with automatic high quality for a selected reference", () => {
    const ref = {
      objectId: "image-1",
      elementVersion: 2,
      fileId: "file-1",
      displayName: "product.png",
      sourceWidth: 100,
      sourceHeight: 100,
      width: 100,
      height: 100,
      angle: 0,
    };
    const result = prepareContextAwareTurn({
      prompt: "สร้างภาพโฆษณา product photo แบบสตูดิโอ สำหรับ Instagram อัตราส่วน 1:1",
      refs: [ref],
      analyses: [
        {
          ref: {
            objectId: ref.objectId,
            elementVersion: ref.elementVersion,
            displayName: ref.displayName,
          },
          caption: "white bottle",
          objects: ["bottle"],
          visibleText: "",
          dimensions: { width: 100, height: 100, aspectRatio: 1 },
          transparency: "none",
          appearanceNotes: [],
          limitations: [],
        },
      ],
    });
    expect(result).toMatchObject({
      kind: "task",
      task: { subAgent: "image_editor", quality: "high", analysisComplete: true },
    });
  });
});
