import { describe, expect, it } from "vitest";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import {
  type ContextAwareTurnInput,
  createDirectedImageTask,
  isCanvasInventoryPrompt,
  prepareContextAwareTurn,
} from "@/lib/ai/orchestration/turnOrchestrator";
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

function directed(input: ContextAwareTurnInput) {
  const task = createDirectedImageTask(input, {
    kind: "image-task",
    outputCount: 1,
    summary: "Approved image",
    refinedPrompt: input.prompt,
    specialist: input.refs.length ? "image_editor" : "image_generator",
    capability: input.refs.length ? "IMAGE_EDIT" : "IMAGE_DEFAULT",
    modelAlias: "image-gpt-2",
    knowledgeSkillIds: [],
    reviewCriteria: ["Preserve the supplied brief"],
    search: { required: false, queries: [], sources: [] },
  });
  return { kind: "task" as const, task };
}

describe("context-aware turn orchestrator", () => {
  it("defers requested model decisions to the Director", () => {
    const result = prepareContextAwareTurn({
      prompt: "สร้างโปสเตอร์คอนเสิร์ตสีแดงจัดจ้าน ใช้ Flux",
      refs: [],
      analyses: [],
    });

    expect(result).toMatchObject({
      kind: "director-ready",
    });
  });

  it("answers Canvas inventory locally without creating a task", () => {
    const result = prepareContextAwareTurn({
      prompt: "บน Canvas มีอะไรอยู่บ้าง",
      refs: [],
      analyses: [],
      canvas: { slide, selectedIds: new Set() },
    });
    expect(result).toMatchObject({ kind: "answer", source: "canvas-local" });
  });

  it("does not classify a generation request as Canvas inventory", () => {
    expect(isCanvasInventoryPrompt("สร้างภาพแมวบน Canvas สำหรับโพสต์")).toBe(false);
  });

  it("creates an ordered canonical trace for context-aware planning", () => {
    const ref = {
      objectId: "image-trace",
      elementVersion: 1,
      fileId: "file-trace",
      displayName: "Reference",
      sourceWidth: 100,
      sourceHeight: 100,
      width: 100,
      height: 100,
      angle: 0,
    };
    const result = directed({
      prompt: "สร้างภาพโฆษณา product photo แบบสตูดิโอ สำหรับ Instagram อัตราส่วน 1:1",
      refs: [ref],
      analyses: [
        {
          ref: {
            objectId: ref.objectId,
            elementVersion: ref.elementVersion,
            displayName: ref.displayName,
          },
          caption: "a product",
          objects: ["product"],
          visibleText: "",
          dimensions: { width: 100, height: 100, aspectRatio: 1 },
          transparency: "none",
          appearanceNotes: [],
          limitations: [],
        },
      ],
      canvas: { slide, selectedIds: new Set([ref.objectId]) },
      clarification: { question: "เลือกทิศทางภาพ", optionIds: ["A", "B", "C", "OTHER"] },
    });
    expect(result.kind).toBe("task");
    if (result.kind !== "task") return;
    expect(result.task.history.map((event) => event.type)).toEqual([
      "context.inspected",
      "reference.analysis.started",
      "reference.analysis.completed",
      "clarification.requested",
      "intent.assessed",
      "task.created",
      "director.planned",
    ]);
    for (const event of result.task.history) {
      expect(event).toMatchObject({
        taskId: result.task.id,
        subAgent: result.task.subAgent,
        attempt: 0,
        harnessVersion: ARTSHIFT_HARNESS_VERSION,
        ruleIds: ARTSHIFT_HARNESS_RULE_IDS,
      });
    }
  });

  it("defers ambiguous image requests to the Director", async () => {
    const result = prepareContextAwareTurn({ prompt: "สร้างภาพแมว", refs: [], analyses: [] });
    expect(result.kind).toBe("director-ready");
    expect(result).not.toHaveProperty("task");
  });

  it.each(["ขอภาพแมว", "ทำภาพแมว", "draw a cat"])("keeps %s behind the Director gate", (prompt) => {
    const result = prepareContextAwareTurn({ prompt, refs: [], analyses: [] });
    expect(result.kind).toBe("director-ready");
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

  it("creates an image task with exact text requirements from the brief", () => {
    const result = directed({
      prompt:
        'สร้างภาพป้ายสินค้า product photo ในสตูดิโอ แบบ centered สำหรับ Instagram อัตราส่วน 1:1 พร้อมข้อความ "SALE 50%"',
      refs: [],
      analyses: [],
    });
    expect(result.kind).toBe("task");
    if (result.kind !== "task") return;
    expect(result.task.requiredText).toBe("SALE 50%");
    expect(result.task.requestedDimensions).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });
  });

  it("defers vector requests without creating a task", () => {
    const result = prepareContextAwareTurn({
      prompt: "สร้างภาพโลโก้เวกเตอร์แบบ minimal สำหรับแบรนด์สินค้า บนพื้นขาว อัตราส่วน 1:1 สำหรับ Instagram",
      refs: [],
      analyses: [],
    });
    expect(result).toMatchObject({ kind: "director-ready" });
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
    const result = directed({
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
      task: {
        subAgent: "image_editor",
        quality: "high",
        analysisComplete: true,
        requiredSubjects: ["bottle"],
      },
    });
  });
});
