import { describe, expect, it } from "vitest";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import {
  type ContextAwareTurnInput,
  createDirectedImageRun,
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

  it("preserves aspect ratio and dimensions (e.g. 60x20cm -> 3:1) during follow-up requests like 'ขอตัวเลือกเพิ่ม 3 แบบ'", () => {
    const input: ContextAwareTurnInput = {
      prompt: "ขอตัวเลือกเพิ่ม 3 แบบ",
      refs: [],
      analyses: [],
      conversationHistory: [
        {
          role: "user",
          content: "ออกแบบป้ายหมวดหนังสือ Welearn ป้ายขนาด 60x20cm",
        },
        {
          role: "assistant",
          content: "วางแผนสำเร็จ: ออกแบบป้ายหมวดหนังสือ Welearn ขนาด 60x20 ซม.",
        },
      ],
    };

    const task = createDirectedImageTask(input, {
      kind: "image-task",
      outputCount: 1,
      requestedOutputCount: 3,
      summary: "วางแผนสำเร็จ: ออกแบบป้ายหมวดหนังสือ Welearn ขนาด 60x20 ซม.",
      refinedPrompt: "Signboard 60x20cm, aspect ratio 3:1 (1536x512 pixels), Welearn publishing",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-precision",
      knowledgeSkillIds: [],
      reviewCriteria: ["Preserve 60x20cm aspect ratio"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(task.requestedDimensions).toEqual({
      width: 1536,
      height: 512,
      aspectRatio: "16:9", // closest API standard or panoramic
    });
  });

  it("inherits dimensions from direction.summary if refinedPrompt lacks dimensions and prompt is follow-up", () => {
    const input: ContextAwareTurnInput = {
      prompt: "ขอตัวเลือกเพิ่ม 3 แบบ",
      refs: [],
      analyses: [],
    };

    const task = createDirectedImageTask(input, {
      kind: "image-task",
      outputCount: 1,
      requestedOutputCount: 3,
      summary: "วางแผนสำเร็จ: ออกแบบป้ายหมวดหนังสือ Welearn ขนาด 60x20 ซม.",
      refinedPrompt: "Welearn bookshelf signage in minimalist modern style",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-precision",
      knowledgeSkillIds: [],
      reviewCriteria: ["Clean signage layout"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(task.requestedDimensions).toEqual({
      width: 1536,
      height: 512,
      aspectRatio: "16:9",
    });
  });

  it("creates a 3-task DirectedImageRun when user asks 'ขอตัวเลือก 3 แบบ ' even if direction has outputCount 1", () => {
    const input: ContextAwareTurnInput = {
      prompt: "ขอตัวเลือก 3 แบบ ",
      refs: [],
      analyses: [],
    };

    const run = createDirectedImageRun(input, {
      kind: "image-task",
      outputCount: 1,
      requestedOutputCount: 1,
      summary: "วางแผนสำเร็จ: ออกแบบป้ายหมวดหนังสือ Welearn",
      refinedPrompt: "Signboard 60x20cm, Welearn publishing",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-precision",
      knowledgeSkillIds: [],
      reviewCriteria: ["Preserve brief"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(run.requestedOutputCount).toBe(3);
    expect(run.tasks.length).toBe(3);
    expect(run.tasks[0].imageRun?.requestedOutputCount).toBe(3);
    expect(run.tasks[0].imageRun?.outputIndex).toBe(1);
    expect(run.tasks[2].imageRun?.outputIndex).toBe(3);
  });

  it("creates a 3-task DirectedImageRun when user asks 'สร้างมา 3 รูป'", () => {
    const input: ContextAwareTurnInput = {
      prompt: "สร้างมา 3 รูป",
      refs: [],
      analyses: [],
    };

    const run = createDirectedImageRun(input, {
      kind: "image-task",
      outputCount: 1,
      requestedOutputCount: 1,
      summary: "วางแผนสำเร็จ",
      refinedPrompt: "Welearn bookshelf sign",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-precision",
      knowledgeSkillIds: [],
      reviewCriteria: ["Preserve brief"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(run.requestedOutputCount).toBe(3);
    expect(run.tasks.length).toBe(3);
  });

  it("strictly defaults requestedDimensions to 1:1 (1024x1024) even if a 16:9 element is selected on canvas", () => {
    const wideRect = createRect({ x: 0, y: 0, width: 800, height: 400 });
    const slideWithWide = {
      ...slide,
      elements: [wideRect],
    };

    const input: ContextAwareTurnInput = {
      prompt: "สร้างรูปแมวน่ารัก",
      refs: [],
      analyses: [],
      canvas: { slide: slideWithWide, selectedIds: new Set([wideRect.id]) },
    };

    const task = createDirectedImageTask(input, {
      kind: "image-task",
      outputCount: 1,
      summary: "สร้างรูปแมวน่ารักในห้องนั่งเล่น",
      refinedPrompt: "An endearing domestic cat sitting in a cozy living room",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: ["Natural domestic cat"],
      search: { required: false, queries: [], sources: [] },
    });

    // Mandatory 1:1 baseline must NOT be overridden by selected canvas element aspect ratio
    expect(task.requestedDimensions).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });
  });

  it("respects explicit user-specified aspect ratio in turn prompt", () => {
    const input: ContextAwareTurnInput = {
      prompt: "สร้างรูปแมวน่ารัก สัดส่วน 16:9 แนวนอน",
      refs: [],
      analyses: [],
    };

    const task = createDirectedImageTask(input, {
      kind: "image-task",
      outputCount: 1,
      summary: "สร้างรูปแมวน่ารัก 16:9",
      refinedPrompt: "An endearing cat in landscape 16:9",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: ["Preserve 16:9 landscape aspect ratio"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(task.requestedDimensions).toEqual({
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
    });
  });
});

