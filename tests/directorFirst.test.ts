import { describe, expect, it, vi } from "vitest";
import {
  parseCreativeDirection,
  prepareCreativeDirection,
} from "@/lib/ai/orchestration/creativeDirector";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";
import {
  createDirectedImageTask,
  prepareContextAwareTurn,
} from "@/lib/ai/orchestration/turnOrchestrator";

describe("Director owns readiness", () => {
  it("uses conversation and Artwork context without a cost ceiling", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: "",
        toolCalls: [
          {
            name: "propose_creative_direction",
            input: { kind: "answer", text: "จะรักษาปกเดิมและปรับพื้นหลังให้เข้มขึ้น" },
          },
        ],
      },
    });
    await prepareCreativeDirection(
      {
        prompt: "ทำให้เข้มขึ้นแต่ปกเหมือนเดิม",
        conversationHistory: [
          { role: "user", content: "สร้างภาพโฆษณาหนังสือเล่มนี้" },
          { role: "assistant", content: "ต้องการแก้อะไรต่อครับ" },
        ],
        artworkContext: { selection: [{ id: "cover-1", type: "image", name: "Book cover" }] },
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute },
    );

    const [task, request, options] = execute.mock.calls[0];
    expect(task).toBe("assistant.chat");
    expect(request.maxTokens).toBeGreaterThanOrEqual(8_192);
    expect(JSON.stringify(request.messages)).toContain("สร้างภาพโฆษณาหนังสือเล่มนี้");
    expect(JSON.stringify(request.messages)).toContain("cover-1");
    expect(options).not.toHaveProperty("maxCostUsd");
  });

  it.each(["สร้างภาพแมว", "draw a cat", "สร้างภาพ " + "รายละเอียด ".repeat(100)])(
    "never creates a task or canned clarification for %s",
    (prompt) => {
      expect(prepareContextAwareTurn({ prompt, refs: [], analyses: [] }).kind).toBe(
        "director-ready",
      );
    },
  );
  it("preserves literal followups without inventing visual direction", () => {
    expect(composeClarifiedImagePrompt("ถั่ว", "สามภาพแยก", "ต้องการกี่ภาพ?")).toBe(
      "ถั่ว\n\nDirector question: ต้องการกี่ภาพ?\nUser reply: สามภาพแยก",
    );
  });
  it("advertises conditional fields and a single-output execution limit", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: "",
        toolCalls: [
          {
            name: "propose_creative_direction",
            input: { kind: "answer", text: "ยังสร้างสามภาพแยกในงานเดียวไม่ได้" },
          },
        ],
      },
    });
    await prepareCreativeDirection(
      {
        prompt: "สามภาพแยก",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 100, height: 100 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );
    const request = execute.mock.calls[0][1];
    expect(request.tools[0].inputSchema.allOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          // biome-ignore lint/suspicious/noThenProperty: Assert the JSON Schema conditional keyword.
          then: expect.objectContaining({
            required: expect.arrayContaining([
              "summary",
              "knowledgeSkillIds",
              "search",
              "outputCount",
            ]),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(request)).toContain("maxOutputCount");
  });
});

const directorInput = {
  prompt: "three separate images",
  canvasSummary: { objectCount: 0, selectedCount: 0, width: 100, height: 100 },
  referenceAnalyses: [],
  availableCapabilities: ["IMAGE_DEFAULT"],
};
const validPlan = {
  kind: "image-task" as const,
  outputCount: 1 as const,
  summary: "One image",
  refinedPrompt: "A clear single image of beans",
  specialist: "image_generator" as const,
  capability: "IMAGE_DEFAULT" as const,
  modelAlias: "image-gpt-2" as const,
  knowledgeSkillIds: [],
  reviewCriteria: ["beans"],
  search: { required: false, queries: [], sources: [] },
};
it.each(["summary", "knowledgeSkillIds", "search", "outputCount"])(
  "rejects missing %s rather than fabricating a default",
  (field) => {
    const malformed: Record<string, unknown> = { ...validPlan };
    delete malformed[field];
    expect(() => parseCreativeDirection(malformed, directorInput, [])).toThrow(
      "invalid Creative Director plan",
    );
  },
);
it("rejects the observed incomplete 120B tool-call fixture", async () => {
  const execute = vi.fn().mockResolvedValue({
    output: {
      text: "",
      toolCalls: [
        {
          name: "propose_creative_direction",
          input: {
            kind: "image-task",
            refinedPrompt: "Three separate bean images",
            specialist: "image_generator",
            capability: "IMAGE_DEFAULT",
            modelAlias: "image-gpt-2",
            reviewCriteria: ["one", "two", "three", "four", "five"],
            requiredSubjects: ["beans"],
          },
        },
      ],
    },
  });
  await expect(
    prepareCreativeDirection({ ...directorInput, cloudConsent: true }, { execute }),
  ).rejects.toMatchObject({ code: "DIRECTOR_INVALID_PLAN" });
});
it("refuses multiple outputs and unfinished search before creating any task", () => {
  expect(() =>
    parseCreativeDirection({ ...validPlan, outputCount: 3 }, directorInput, []),
  ).toThrow();
  expect(() =>
    createDirectedImageTask(
      { prompt: "beans", refs: [], analyses: [] },
      { ...validPlan, search: { required: true, queries: ["beans"], sources: ["images"] } },
    ),
  ).toThrow("before task creation");
});
