import { describe, expect, it, vi } from "vitest";
import {
  applyCreativeDirectionToTask,
  CREATIVE_DIRECTOR_MODEL_ALIAS,
  CREATIVE_DIRECTOR_SYSTEM,
  prepareCreativeDirection,
  reviewCreativeOutput,
} from "@/lib/ai/orchestration/creativeDirector";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import { createAiTask } from "@/lib/ai/orchestration/taskMachine";

const baseTask = () =>
  createAiTask({
    id: "task-1",
    prompt: "สร้างภาพโฆษณาขวดเซรั่มแบบสตูดิโอสำหรับ Instagram 1:1",
    subAgent: "image_generator",
    capability: "IMAGE_DEFAULT",
    quality: "high",
    qualityRationale: "Product output needs high fidelity.",
    maxAttempts: 2,
    selectedImages: [],
    analysisComplete: true,
    cloudConsentRequired: true,
    estimatedMaxCostUsd: 0.1,
    requestedDimensions: { width: 1024, height: 1024, aspectRatio: "1:1" },
    harnessVersion: ARTSHIFT_HARNESS_VERSION,
    harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
  });

const toolResult = {
  output: {
    text: "",
    stopReason: "tool_use" as const,
    assistantMessage: { role: "assistant" as const, content: "" },
    toolCalls: [
      {
        type: "tool_call" as const,
        id: "call-1",
        name: "propose_creative_direction",
        input: {
          kind: "image-task",
          outputCount: 1,
          summary: "Premium serum product key visual",
          refinedPrompt:
            "Premium studio product photograph of a serum bottle, restrained luxury lighting, generous negative space, square social composition",
          specialist: "image_generator",
          capability: "IMAGE_DEFAULT",
          modelAlias: "image-gpt-2",
          knowledgeSkillIds: ["product-image", "instagram-post"],
          reviewCriteria: ["serum bottle is the clear subject", "premium restrained lighting"],
          search: { required: false, queries: [], sources: [] },
        },
      },
    ],
  },
  metadata: {
    task: "assistant.chat" as const,
    provider: "replicate" as const,
    model: "openai/gpt-oss-120b",
    modelAlias: CREATIVE_DIRECTOR_MODEL_ALIAS,
    durationMs: 1,
    usage: {},
    cached: false,
    warnings: [],
  },
};

describe("gpt-oss-120b Creative Director", () => {
  it("declares the ArtShift layered director responsibilities", () => {
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Understand");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Vision");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Knowledge");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Search");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("specialist");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Review");
  });

  it("always executes the brain on the quality profile", async () => {
    const execute = vi.fn().mockResolvedValue(toolResult);
    const signal = new AbortController().signal;
    const result = await prepareCreativeDirection(
      {
        prompt: baseTask().prompt,
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT", "IMAGE_VECTOR"],
        cloudConsent: true,
      },
      { execute, signal },
    );

    expect(execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({ system: CREATIVE_DIRECTOR_SYSTEM }),
      expect.objectContaining({
        profile: "quality",
        modelAlias: CREATIVE_DIRECTOR_MODEL_ALIAS,
        cloudConsent: true,
        allowFallback: false,
        signal,
      }),
    );
    expect(result).toMatchObject({ kind: "image-task", outputCount: 1, modelAlias: "image-gpt-2" });
  });

  it("rejects a model or capability that is not available", async () => {
    const invalid = structuredClone(toolResult);
    invalid.output.toolCalls[0].input.modelAlias = "flux-unknown";
    const execute = vi.fn().mockResolvedValue(invalid);

    await expect(
      prepareCreativeDirection(
        {
          prompt: baseTask().prompt,
          canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
          referenceAnalyses: [],
          availableCapabilities: ["IMAGE_DEFAULT"],
          cloudConsent: true,
        },
        { execute },
      ),
    ).rejects.toThrow("invalid Creative Director plan");
  });

  it("executes one bounded image-reference search pass and asks the brain to finalize the plan", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        output: {
          text: "",
          toolCalls: [
            {
              id: "search-1",
              name: "propose_creative_direction",
              input: {
                ...toolResult.output.toolCalls[0].input,
                search: {
                  required: true,
                  queries: ["premium serum studio advertising"],
                  sources: ["images"],
                },
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce(toolResult);
    const searchImages = vi.fn().mockResolvedValue([
      {
        title: "Amber serum bottle on stone",
        source: "unsplash",
        pageUrl: "https://unsplash.com/photos/example",
        previewUrl: "https://images.unsplash.com/photo-example?w=640",
      },
    ]);
    const signal = new AbortController().signal;

    const result = await prepareCreativeDirection(
      {
        prompt: "สร้างภาพโฆษณาขวดเซรั่มแบบ studio สำหรับ Instagram 1:1",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute, searchImages, signal },
    );

    expect(searchImages).toHaveBeenCalledWith("premium serum studio advertising", 3, signal);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(execute.mock.calls[1]?.[1])).toContain("Amber serum bottle on stone");
    expect(result).toMatchObject({
      kind: "image-task",
      outputCount: 1,
      search: { required: false },
    });
  });

  it("does not advertise or execute image search when its provider is unconfigured", async () => {
    const searchDirection = structuredClone(toolResult) as {
      output: { toolCalls: Array<{ input: Record<string, unknown> }> };
    };
    searchDirection.output.toolCalls[0].input.search = {
      required: true,
      queries: ["concert poster reference"],
      sources: ["images"],
    };
    const execute = vi.fn().mockResolvedValue(searchDirection);
    const searchImages = vi.fn();

    const result = await prepareCreativeDirection(
      {
        prompt: baseTask().prompt,
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute, searchImages, searchImagesAvailable: false },
    );

    expect(searchImages).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: "image-task",
      outputCount: 1,
      search: { required: true },
    });
  });

  it("applies a validated direction while preserving server-owned execution policy", () => {
    const task = baseTask();
    const directed = applyCreativeDirectionToTask(task, {
      kind: "image-task",
      outputCount: 1,
      summary: "Premium serum visual",
      refinedPrompt: "Premium serum bottle studio key visual for Instagram, square composition",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: ["product-image"],
      reviewCriteria: ["serum bottle remains clear"],
      search: { required: false, queries: [], sources: [] },
    });

    expect(directed.prompt).toContain("Premium serum bottle");
    expect(directed.maxAttempts).toBe(task.maxAttempts);
    expect(directed.estimatedMaxCostUsd).toBe(task.estimatedMaxCostUsd);
    expect(directed.selectedImages).toEqual(task.selectedImages);
    expect(directed.history.at(-1)).toMatchObject({
      type: "director.planned",
      modelAlias: CREATIVE_DIRECTOR_MODEL_ALIAS,
      specialist: "image_generator",
    });
  });

  it("uses the same 120B brain to review local Vision evidence against the plan", async () => {
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: "",
        toolCalls: [
          {
            id: "review-1",
            name: "review_creative_output",
            input: {
              passed: false,
              summary: "The product is not visually dominant.",
              repairInstruction: "Increase product scale and simplify the background.",
            },
          },
        ],
      },
    });

    const result = await reviewCreativeOutput(
      {
        prompt: "Premium serum campaign image",
        reviewCriteria: ["product is visually dominant"],
        outputAnalysis: {
          caption: "small bottle in a busy room",
          objects: ["bottle", "chair", "window"],
          visibleText: "",
          limitations: [],
        },
        cloudConsent: true,
      },
      { execute },
    );

    expect(result).toEqual({
      status: "reviewed",
      passed: false,
      summary: "The product is not visually dominant.",
      repairInstruction: "Increase product scale and simplify the background.",
      criteriaEvidence: [
        {
          criterion: "product is visually dominant",
          status: "failed",
          notes: "The product is not visually dominant.",
        },
      ],
    });
    expect(execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("REVIEW PROTOCOL"),
        tools: [expect.objectContaining({ name: "review_creative_output" })],
      }),
      expect.objectContaining({
        profile: "quality",
        modelAlias: CREATIVE_DIRECTOR_MODEL_ALIAS,
        allowFallback: false,
      }),
    );
  });

  it("recovers a clarification direction when the remote assistant returns JSON in text without tool calls", async () => {
    const clarificationJson = JSON.stringify({
      kind: "clarification",
      question: "คุณต้องการสไตล์ของรูปหมูอย่างไร?",
      options: [
        "การ์ตูน (Cartoon)",
        "ภาพถ่ายจริง (Realistic)",
        "สไตล์มินิมอล (Minimalist)",
        "อื่น ๆ (Other)",
      ],
    });
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: clarificationJson,
        toolCalls: [],
      },
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "สร้างรูปหมู 3 รูป",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );

    expect(result).toEqual({
      kind: "clarification",
      question: "คุณต้องการสไตล์ของรูปหมูอย่างไร?",
      options: [
        "การ์ตูน (Cartoon)",
        "ภาพถ่ายจริง (Realistic)",
        "สไตล์มินิมอล (Minimalist)",
        "อื่น ๆ (Other)",
      ],
    });
  });

  it("recovers an image-task and tolerates outputCount: 3 alongside requestedOutputCount: 3 when returned as JSON text", async () => {
    const imageTaskJson = JSON.stringify({
      kind: "image-task",
      summary:
        "Generate three realistic photographic images of a pig with distinct compositions and lighting",
      refinedPrompt:
        "Create three separate realistic photographs of a pig. Image 1: in a grassy field...",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: [
        "Animal anatomy is accurate and natural",
        "Fur texture and lighting appear realistic",
      ],
      search: { required: false, queries: [], sources: [] },
      outputCount: 3,
      requestedOutputCount: 3,
      outputBriefs: [
        "Realistic photo of a domestic pig standing in a grassy field",
        "Realistic close-up photo of a pig sitting on a wooden floor",
        "Realistic top-down photo of a pig lying on a pile of hay",
      ],
    });
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: imageTaskJson,
        toolCalls: [],
      },
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "ภาพถ่ายสมจริง",
        conversationHistory: [
          { role: "user", content: "สร้างรูปหมู 3 รูป" },
          { role: "assistant", content: "คุณต้องการสไตล์ของรูปหมูอย่างไร?" },
        ],
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );

    expect(result.kind).toBe("image-task");
    if (result.kind === "image-task") {
      expect(result.outputCount).toBe(1);
      expect(result.requestedOutputCount).toBe(3);
      expect(result.outputBriefs).toHaveLength(3);
      expect(result.specialist).toBe("image_generator");
      expect(result.capability).toBe("IMAGE_DEFAULT");
      expect(result.modelAlias).toBe("image-gpt-2");
    }
  });

  it("recovers a review decision when the remote assistant returns JSON in text without tool calls", async () => {
    const reviewJson = JSON.stringify({
      passed: true,
      summary: "Animal anatomy is accurate and lighting is realistic.",
    });
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: reviewJson,
        toolCalls: [],
      },
    });

    const result = await reviewCreativeOutput(
      {
        prompt: "Create three separate realistic photographs of a pig",
        reviewCriteria: ["Animal anatomy is accurate and natural"],
        outputAnalysis: {
          caption: "a pig standing in a field",
          objects: ["pig", "grass"],
          visibleText: "",
          limitations: [],
        },
        cloudConsent: true,
      },
      { execute },
    );

    expect(result).toEqual({
      status: "reviewed",
      passed: true,
      summary: "Animal anatomy is accurate and lighting is realistic.",
      criteriaEvidence: [
        {
          criterion: "Animal anatomy is accurate and natural",
          status: "passed",
          notes: "Animal anatomy is accurate and lighting is realistic.",
        },
      ],
    });
  });

  it("accepts image_generator when referenceAnalyses are attached (e.g. ad for book cover)", async () => {
    const execute = vi.fn().mockResolvedValue(toolResult);
    const reference = {
      displayName: "ทฤษฎีปล่อยเขา (The Let Them Theory).jpg",
      caption: "green book cover titled The Let Them Theory",
      objects: ["book"],
      visibleText: "THE LET THEM THEORY กฎปล่อยเขา Mel Robbins",
      dimensions: { width: 1000, height: 1393, aspectRatio: 1000 / 1393 },
      appearanceNotes: ["clean modern typography"],
      limitations: [],
    };

    const result = await prepareCreativeDirection(
      {
        prompt: "สร้างรูป Ad ขายหนังสือชื่อว่า The Let Them ให้หน่อย",
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1920, height: 1080 },
        referenceAnalyses: [reference],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute },
    );

    expect(result.kind).toBe("image-task");
    if (result.kind === "image-task") {
      expect(result.specialist).toBe("image_generator");
      expect(result.capability).toBe("IMAGE_DEFAULT");
    }

    // Verify prompt payload sent to execute contains formatted reference information
    const calledMessages = execute.mock.calls[0]?.[1];
    const userMessageContent = JSON.stringify(calledMessages);
    expect(userMessageContent).toContain("ทฤษฎีปล่อยเขา (The Let Them Theory).jpg");
    expect(userMessageContent).toContain("THE LET THEM THEORY กฎปล่อยเขา Mel Robbins");
    expect(userMessageContent).toContain("green book cover titled The Let Them Theory");
  });

  it("accepts image_editor when referenceAnalyses are attached for editing", async () => {
    const editToolResult = structuredClone(toolResult);
    editToolResult.output.toolCalls[0].input.specialist = "image_editor";
    editToolResult.output.toolCalls[0].input.capability = "IMAGE_EDIT";
    const execute = vi.fn().mockResolvedValue(editToolResult);

    const result = await prepareCreativeDirection(
      {
        prompt: "แก้ไขภาพนี้ให้พื้นหลังเป็นสีส้ม",
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1920, height: 1080 },
        referenceAnalyses: [
          {
            displayName: "photo.jpg",
            caption: "portrait photo",
            objects: ["person"],
            visibleText: "",
            dimensions: { width: 800, height: 800, aspectRatio: 1 },
            appearanceNotes: [],
            limitations: [],
          },
        ],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute },
    );

    expect(result.kind).toBe("image-task");
    if (result.kind === "image-task") {
      expect(result.specialist).toBe("image_editor");
      expect(result.capability).toBe("IMAGE_EDIT");
    }
  });
});
