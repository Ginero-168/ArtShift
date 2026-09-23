import { describe, expect, it, vi } from "vitest";
import { followUpAskText } from "@/lib/ai/orchestration/chatContinuity";
import {
  applyCreativeDirectionToTask,
  CREATIVE_DIRECTOR_MODEL_ALIAS,
  CREATIVE_DIRECTOR_SYSTEM,
  extractExplicitRequestedOutputCount,
  parseCreativeDirection,
  prepareCreativeDirection,
  resolveRequestedOutputCountFromUserAsk,
  reviewCreativeOutput,
} from "@/lib/ai/orchestration/creativeDirector";
import {
  ARTSHIFT_HARNESS_RULE_IDS,
  ARTSHIFT_HARNESS_VERSION,
} from "@/lib/ai/orchestration/harnessPolicy";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";
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

  it("requires inventory-style answers for image analysis requests", () => {
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("IMAGE ANALYSIS ANSWER PROTOCOL");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("วิเคราะห์รูปนี้");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Do NOT lead with mood");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("READABILITY FORMAT");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Do NOT use # ## ### markdown headings");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("Avoid a separate wall-of-text");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("MIX / FUSE PROTOCOL");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("never kind: answer");
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
    expect(result.runtimeModel).toBe("openai/gpt-oss-120b");
  });

  it("injects lastGeneration exact 29×7cm into the director payload when the user prompt is a short follow-up", async () => {
    const execute = vi.fn().mockResolvedValue(toolResult);
    await prepareCreativeDirection(
      {
        prompt: "ปรับเป็นแนวตั้ง",
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1920, height: 1080 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
        lastGeneration: {
          userPrompt: "สร้างป้าย shelftalk 29x7 cm โทนชมพู ลด 35%",
          refinedPrompt: "Pink floral bookstore shelftalk, 35% off, 29x7cm",
          width: 2048,
          height: 688,
          aspectRatio: "2048x688",
          sourceWidth: 29,
          sourceHeight: 7,
          sizeLabel: "29x7cm",
          sizeUnit: "cm",
          ratioClamped: true,
          printWidth: 2848,
          printHeight: 688,
        },
      },
      { execute },
    );
    const payload = JSON.stringify(execute.mock.calls[0]?.[1]);
    expect(payload).toContain("LAST IMAGE GENERATION PACKAGE");
    expect(payload).toContain("29x7cm");
    expect(payload).toContain("lastImageSize");
    expect(payload).toContain("sourceWidth");
    expect(payload).toContain("sourceHeight");
    expect(payload).toContain("resolvedExactSize");
    expect(payload).toMatch(/7x29/i);
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

  it("unwraps a tool_calls JSON envelope from execution.output.text with escaped single quotes", async () => {
    const rawEnvelope =
      '{"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"propose_creative_direction","input":{"kind":"image-task","summary":"Fierce cat with lightning","refinedPrompt":"A powerful electric cat","specialist":"image_generator","capability":"IMAGE_DEFAULT","modelAlias":"image-gpt-2","knowledgeSkillIds":[],"reviewCriteria":["Cat\\\'s front paw is raised showing two fingers clearly"],"search":{"required":false,"queries":[],"sources":[]},"outputCount":1}}]}';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: rawEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: rawEnvelope },
      },
      metadata: toolResult.metadata,
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "อยากให้มันชู 2 นิ้วด้วย",
        canvasSummary: { objectCount: 1, selectedCount: 0, width: 1920, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "Fierce cat with lightning",
      modelAlias: "image-gpt-2",
      reviewCriteria: ["Cat's front paw is raised showing two fingers clearly"],
      outputCount: 1,
    });
  });

  it("unwraps calls envelope without kind: 'tool_calls'", async () => {
    const rawEnvelope = JSON.stringify({
      calls: [
        {
          name: "propose_creative_direction",
          input: {
            kind: "image-task",
            summary: "Cat on a surfboard",
            refinedPrompt: "A sleek cat riding an ocean wave",
            specialist: "image_generator",
            capability: "IMAGE_DEFAULT",
            modelAlias: "image-general",
            knowledgeSkillIds: [],
            reviewCriteria: ["Cat is balanced on surfboard"],
            search: { required: false, queries: [], sources: [] },
            outputCount: 1,
          },
        },
      ],
    });

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: rawEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: rawEnvelope },
      },
      metadata: toolResult.metadata,
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "แมวเล่นเซิร์ฟบอร์ด",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "Cat on a surfboard",
      modelAlias: "image-general",
    });
  });

  it("unwraps OpenAI-style tool_calls with stringified function arguments", async () => {
    const rawEnvelope = JSON.stringify({
      tool_calls: [
        {
          type: "function",
          function: {
            name: "propose_creative_direction",
            arguments: JSON.stringify({
              kind: "image-task",
              summary: "Cyberpunk cityscape",
              refinedPrompt: "Futuristic city with neon signs and flying cars",
              specialist: "image_generator",
              capability: "IMAGE_DEFAULT",
              modelAlias: "image-fast",
              knowledgeSkillIds: [],
              reviewCriteria: ["Neon reflections on wet pavement"],
              search: { required: false, queries: [], sources: [] },
              outputCount: 1,
            }),
          },
        },
      ],
    });

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: rawEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: rawEnvelope },
      },
      metadata: toolResult.metadata,
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "เมืองไซเบอร์พังก์",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "Cyberpunk cityscape",
      modelAlias: "image-fast",
    });
  });

  it("handles model response with unescaped literal newlines in strings and null optional fields", async () => {
    const rawEnvelope =
      '{\n  "calls": [{\n    "name": "propose_creative_direction",\n    "input": {\n      "kind": "image-task",\n      "summary": "Spider-Man hero shot",\n      "refinedPrompt": "Spider-Man standing atop a skyscraper\\nwith dramatic night lighting",\n      "specialist": "image_generator",\n      "capability": "IMAGE_DEFAULT",\n      "modelAlias": "image-gpt-2",\n      "knowledgeSkillIds": [],\n      "reviewCriteria": ["Spider-Man suit details\\nare crisp and clear"],\n      "search": { "required": false },\n      "requiredText": null,\n      "requiredSubjects": null,\n      "outputCount": 1\n    }\n  }]\n}';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: rawEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: rawEnvelope },
      },
      metadata: toolResult.metadata,
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "สร้างรูปสไปเดอร์แมน",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "Spider-Man hero shot",
      modelAlias: "image-gpt-2",
      outputCount: 1,
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
        prompt: composeClarifiedImagePrompt(
          "สร้างรูปหมู 3 รูป",
          "ภาพถ่ายสมจริง",
          "คุณต้องการสไตล์ของรูปหมูอย่างไร?",
        ),
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

  it("recovers truncated model tool call envelope and normalizes missing trailing fields", async () => {
    const truncatedEnvelope =
      '{"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"propose_creative_direction","input":{"kind":"image-task","summary":"สร้างรูปแมวน่ารัก ขนปุย","refinedPrompt":"A cute, fluffy cat, sitting, looking at the camera, soft lighting, detailed fur, realistic, high resolution, studio lighting, bokeh background","specialist":"image_generator","capability":"IMAGE_DEFAULT","modelAlias":"image-general","knowledgeSkillIds":[],"reviewCriteria":["ภาพต้องเป็นแมว","แมวต้องดูน่ารักและมีขนปุย","แมวอยู่';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: truncatedEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: truncatedEnvelope },
      },
      metadata: {},
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "คิดให้หน่อย",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "สร้างรูปแมวน่ารัก ขนปุย",
      modelAlias: "image-general",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      outputCount: 1,
    });
  });

  it("sanitizes oversized or empty reviewCriteria instead of failing Mix plans", async () => {
    const longSummary = "สร้างภาพใหม่ภาพเดียวทันทีโดยผสมภาพที่เลือกทั้งหมดเข้าด้วยกัน " + "ก".repeat(480);
    const execute = vi.fn().mockResolvedValue({
      output: {
        text: "",
        toolCalls: [
          {
            id: "call-1",
            name: "propose_creative_direction",
            input: {
              kind: "image-task",
              summary: longSummary,
              refinedPrompt:
                "A fused cinematic scene combining both references into one balanced composition",
              specialist: "image_generator",
              capability: "IMAGE_DEFAULT",
              modelAlias: "image-general",
              knowledgeSkillIds: [],
              reviewCriteria: [`ภาพต้องตรงกับคำอธิบาย: ${longSummary}`],
              search: { required: false, queries: [], sources: [] },
              outputCount: 1,
            },
          },
        ],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: "" },
      },
      metadata: {},
    });

    const result = await prepareCreativeDirection(
      {
        prompt: longSummary,
        canvasSummary: { objectCount: 2, selectedCount: 2, width: 1024, height: 1024 },
        referenceAnalyses: [
          {
            caption: "fruit stall",
            objects: ["fruit"],
            visibleText: "",
            dimensions: { width: 800, height: 600, aspectRatio: 800 / 600 },
            appearanceNotes: [],
            limitations: [],
          },
          {
            caption: "orange cat",
            objects: ["cat"],
            visibleText: "",
            dimensions: { width: 800, height: 800, aspectRatio: 1 },
            appearanceNotes: [],
            limitations: [],
          },
        ],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result.kind).toBe("image-task");
    if (result.kind === "image-task") {
      expect(result.reviewCriteria.length).toBeGreaterThan(0);
      expect(result.reviewCriteria.every((c) => c.length <= 500)).toBe(true);
    }
  });

  it("recovers unparsed truncated envelope ending mid-word in reviewCriteria (production issue)", async () => {
    const prodEnvelope =
      '{"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"propose_creative_direction","input":{"kind":"image-task","summary":"สร้างรูปแมว","refinedPrompt":"A cute cat, highly detailed, realistic, studio lighting, natural pose, soft fur texture, expressive eyes, clean background.","specialist":"image_generator","capability":"IMAGE_DEFAULT","modelAlias":"image-general","knowledgeSkillIds":[],"reviewCriteria":["ภาพแมวมีความชัดเจนและมีรายละเอียดสูง","องค์ประกอบของแมวสมจริงและดูเป็นธรรมชาติ","แส';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: prodEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: prodEnvelope },
      },
      metadata: {},
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "สร้างรูปแมว",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "สร้างรูปแมว",
      modelAlias: "image-general",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      refinedPrompt:
        "A cute cat, highly detailed, realistic, studio lighting, natural pose, soft fur texture, expressive eyes, clean background.",
      outputCount: 1,
    });
    if (result.kind === "image-task") {
      expect(result.reviewCriteria).toContain("ภาพแมวมีความชัดเจนและมีรายละเอียดสูง");
      expect(result.reviewCriteria).toContain("องค์ประกอบของแมวสมจริงและดูเป็นธรรมชาติ");
    }
  });

  it("recovers unparsed tool envelope truncated inside refinedPrompt", async () => {
    const truncatedPromptEnvelope =
      '{"kind":"tool_calls","calls":[{"name":"propose_creative_direction","input":{"kind":"image-task","summary":"แมวน่ารัก","refinedPrompt":"A fluffy white cat running in the garden';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: truncatedPromptEnvelope,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: truncatedPromptEnvelope },
      },
      metadata: {},
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "แมวน่ารัก",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "แมวน่ารัก",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      refinedPrompt: "A fluffy white cat running in the garden",
      outputCount: 1,
    });
  });

  it("recovers direction via extractDirectionFromUnparsedText when JSON parsing completely fails", async () => {
    // Unparseable JSON due to unquoted key, invalid characters, but containing tool call fields
    const corruptedText =
      '{"kind":"tool_calls", corrupted_syntax::: {"name":"propose_creative_direction","input":{"kind":"image-task","summary":"แมวดำ","refinedPrompt":"A sleek black cat under the moonlight","reviewCriteria":["ภาพเป็นแมวดำ","แสงจันทร์สวยงาม"]';

    const execute = vi.fn().mockResolvedValue({
      output: {
        text: corruptedText,
        toolCalls: [],
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: corruptedText },
      },
      metadata: {},
    });

    const result = await prepareCreativeDirection(
      {
        prompt: "แมวดำ",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
      },
      { execute, searchImages: vi.fn(), searchImagesAvailable: false },
    );

    expect(result).toMatchObject({
      kind: "image-task",
      summary: "แมวดำ",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      refinedPrompt: "A sleek black cat under the moonlight",
      outputCount: 1,
    });
    if (result.kind === "image-task") {
      expect(result.reviewCriteria).toContain("ภาพเป็นแมวดำ");
      expect(result.reviewCriteria).toContain("แสงจันทร์สวยงาม");
    }
  });
  it("auto-infers kind: image-task when model omits kind in tool call", async () => {
    const runtime = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: "",
          stopReason: "tool_use",
          assistantMessage: { role: "assistant", content: "" },
          toolCalls: [
            {
              type: "tool_call",
              id: "call-omit-kind",
              name: "propose_creative_direction",
              input: {
                // Notice kind is omitted!
                summary: "สร้างรูปสุนัขโกลเด้น",
                refinedPrompt: "A happy golden retriever dog in eye-level camera angle",
                specialist: "image_generator",
                capability: "IMAGE_DEFAULT",
                modelAlias: "image-gpt-2",
                outputCount: 1,
              },
            },
          ],
        },
      }),
    };

    const direction = await prepareCreativeDirection(
      {
        prompt: "สร้างรูปหมา สายพันธุ์โกลเด้นรีทรีฟเวอร์ ร่าเริง",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1920, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime as any,
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.summary).toBe("สร้างรูปสุนัขโกลเด้น");
      expect(direction.specialist).toBe("image_generator");
      expect(direction.refinedPrompt).toContain("golden retriever");
      expect(direction.detailScore).toBeDefined();
      expect(direction.precisionScore).toBeDefined();
    }
  });

  it("enforces detailScore >= 9 threshold for image-fast and returns score fields", async () => {
    // Model returns image-fast with detailScore: 6 -> should normalize to image-general
    const runtimeSub9 = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: "",
          toolCalls: [
            {
              id: "call_sub9",
              type: "function",
              name: "propose_creative_direction",
              input: {
                kind: "image-task",
                summary: "Futuristic robot",
                refinedPrompt: "A sleek humanoid robot standing in a modern showroom",
                specialist: "image_generator",
                capability: "IMAGE_DEFAULT",
                modelAlias: "image-fast",
                detailScore: 6,
                precisionScore: 2,
                outputCount: 1,
              },
            },
          ],
        },
      }),
    };

    const directionSub9 = await prepareCreativeDirection(
      {
        prompt: "สร้างรูปหุ่นยนต์",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1024, height: 1024 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtimeSub9 as any,
    );

    expect(directionSub9.kind).toBe("image-task");
    if (directionSub9.kind === "image-task") {
      expect(directionSub9.modelAlias).toBe("image-general"); // Normalized because detailScore 6 < 9
      expect(directionSub9.detailScore).toBe(6);
      expect(directionSub9.precisionScore).toBe(2);
    }

    // Model returns image-fast with detailScore: 9 -> allowed to keep image-fast
    const runtime9 = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: "",
          toolCalls: [
            {
              id: "call_9",
              type: "function",
              name: "propose_creative_direction",
              input: {
                kind: "image-task",
                summary: "Complex neon banner with typography",
                refinedPrompt:
                  "A complex graphic layout with dense text and multiple brand elements",
                specialist: "image_generator",
                capability: "IMAGE_DEFAULT",
                modelAlias: "image-fast",
                detailScore: 9,
                precisionScore: 3,
                outputCount: 1,
              },
            },
          ],
        },
      }),
    };

    const direction9 = await prepareCreativeDirection(
      {
        prompt: "สร้างป้ายแบนเนอร์ตัวหนังสือแน่น",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime9 as any,
    );

    expect(direction9.kind).toBe("image-task");
    if (direction9.kind === "image-task") {
      expect(direction9.modelAlias).toBe("image-fast");
      expect(direction9.detailScore).toBe(9);
      expect(direction9.precisionScore).toBe(3);
    }
  });

  it("enforces distinction between input reference count and output creation count in system prompt", () => {
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("CRITICAL INPUT REFERENCES VS OUTPUT QUANTITY RULE");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("จาก 2 ปกนี้");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain(
      "synthesize both references into ONE unified design artwork",
    );
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("NEVER INVENT A VARIATION COUNT");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("ปรับเป็นแนวตั้ง");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain(
      "If the user does not state N and does not list multiple sizes, requestedOutputCount MUST be 1",
    );
  });

  it("normalizes requestedOutputCount to 1 when prompt references 2 covers without explicit output quantity request", async () => {
    const runtime = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: JSON.stringify({
            kind: "image-task",
            summary: "ป้าย Welearn ธีม Manifest",
            refinedPrompt: "Flat 2D graphic design banner for Welearn publishing Manifest theme",
            specialist: "image_generator",
            capability: "IMAGE_DEFAULT",
            modelAlias: "image-gpt-2",
            knowledgeSkillIds: [],
            reviewCriteria: ["Flat 2D graphic", "Welearn text present"],
            search: { required: false, queries: [], sources: [] },
            requestedOutputCount: 2,
            outputBriefs: ["ป้าย Welearn สีดำทอง", "ป้าย Welearn สีแดงขาว"],
          }),
          toolCalls: [],
        },
      }),
    };

    const direction = await prepareCreativeDirection(
      {
        prompt:
          "ออกแบบป้ายหมวดติดตั้งบนชั้นวางหนังสือ สำนักพิมพ์ Welearn จาก 2 ปกนี้ โดยอยากใช้ธีมหนังสือ Manifest ของคิดมาก บนป้ายเน้นชื่อสำนักพิมพ์ Welearn ป้ายขนาด 60x20cm",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime as any,
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(1);
      expect(direction.outputBriefs).toBeDefined();
      expect(direction.outputBriefs?.[0]).toBe("ป้าย Welearn สีดำทอง");
    }
  });

  it("preserves requestedOutputCount when prompt explicitly requests multiple outputs alongside references", async () => {
    const runtime = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: JSON.stringify({
            kind: "image-task",
            summary: "ป้าย Welearn ธีม Manifest",
            refinedPrompt: "Flat 2D graphic design banner for Welearn publishing Manifest theme",
            specialist: "image_generator",
            capability: "IMAGE_DEFAULT",
            modelAlias: "image-gpt-2",
            knowledgeSkillIds: [],
            reviewCriteria: ["Flat 2D graphic", "Welearn text present"],
            search: { required: false, queries: [], sources: [] },
            requestedOutputCount: 2,
            outputBriefs: ["ป้าย Welearn สีดำทอง", "ป้าย Welearn สีแดงขาว"],
          }),
          toolCalls: [],
        },
      }),
    };

    const direction = await prepareCreativeDirection(
      {
        prompt: "ออกแบบป้ายหมวดจาก 2 ปกนี้ ขอ 2 แบบ ธีม Manifest ขนาด 60x20cm",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime as any,
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(2);
      expect(direction.outputBriefs).toBeDefined();
      expect(direction.outputBriefs).toHaveLength(2);
    }
  });

  it("extracts explicit output count 3 from 'ขอตัวเลือก 3 แบบ ' and 'สร้างมา 3 รูป' even if model returned 1", async () => {
    const runtime = {
      execute: vi.fn().mockResolvedValue({
        output: {
          text: JSON.stringify({
            kind: "image-task",
            summary: "ป้าย Welearn",
            refinedPrompt: "Flat 2D graphic design banner for Welearn",
            specialist: "image_generator",
            capability: "IMAGE_DEFAULT",
            modelAlias: "image-gpt-2",
            knowledgeSkillIds: [],
            reviewCriteria: ["Flat 2D graphic"],
            search: { required: false, queries: [], sources: [] },
            requestedOutputCount: 1, // Model erroneously returned 1
            outputBriefs: ["ป้าย Welearn"],
          }),
          toolCalls: [],
        },
      }),
    };

    // Case 1: "ขอตัวเลือก 3 แบบ "
    const direction1 = await prepareCreativeDirection(
      {
        prompt: "ขอตัวเลือก 3 แบบ ",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime as any,
    );

    expect(direction1.kind).toBe("image-task");
    if (direction1.kind === "image-task") {
      expect(direction1.requestedOutputCount).toBe(3);
      expect(direction1.outputBriefs).toHaveLength(3);
    }

    // Case 2: "สร้างมา 3 รูป"
    const direction2 = await prepareCreativeDirection(
      {
        prompt: "สร้างมา 3 รูป",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
        referenceAnalyses: [],
      },
      runtime as any,
    );

    expect(direction2.kind).toBe("image-task");
    if (direction2.kind === "image-task") {
      expect(direction2.requestedOutputCount).toBe(3);
      expect(direction2.outputBriefs).toHaveLength(3);
    }
  });

  it("forces requestedOutputCount to 1 for a cm resize follow-up without 'ขอ N แบบ'", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "ปรับขนาดป้ายเป็น 60x20cm หลายแบบ",
        refinedPrompt: "Rebuild the last banner at 60x20cm in several variations",
        specialist: "image_generator",
        capability: "IMAGE_DEFAULT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Keep campaign copy"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 4,
        outputBriefs: ["ไซส์ 1", "ไซส์ 2", "ไซส์ 3", "ไซส์ 4"],
      },
      {
        prompt: "ปรับขนาดเป็น 60x20cm",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        referenceAnalyses: [],
      },
      [],
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(1);
      expect(direction.outputBriefs).toHaveLength(1);
    }
  });

  it("forces requestedOutputCount to 1 when Director invents 5 for 'ปรับเป็นแนวตั้ง'", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "ปรับป้ายเป็นแนวตั้ง 5 แบบ",
        refinedPrompt: "Rebuild as five vertical 9:16 poster variations",
        specialist: "image_generator",
        capability: "IMAGE_DEFAULT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Keep campaign copy"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 5,
        outputBriefs: ["แนวตั้ง 1", "แนวตั้ง 2", "แนวตั้ง 3", "แนวตั้ง 4", "แนวตั้ง 5"],
      },
      {
        prompt: "ปรับเป็นแนวตั้ง",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        referenceAnalyses: [],
      },
      [],
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(1);
      expect(direction.outputBriefs).toHaveLength(1);
    }
  });

  it("honors explicit 'ขอ 3 แบบ' and 'สร้าง 3 รูป' even if Director JSON says 1", () => {
    const raw = {
      kind: "image-task",
      summary: "สร้างภาพ",
      refinedPrompt: "A single image",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: [],
      reviewCriteria: ["Keep subject"],
      search: { required: false, queries: [], sources: [] },
      requestedOutputCount: 1,
      outputBriefs: ["ภาพเดียว"],
    };
    const canvas = {
      canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
      availableCapabilities: ["IMAGE_DEFAULT" as const],
      referenceAnalyses: [],
    };

    const fromBaep = parseCreativeDirection(raw, { ...canvas, prompt: "ขอ 3 แบบ" }, []);
    const fromRup = parseCreativeDirection(raw, { ...canvas, prompt: "สร้าง 3 รูป" }, []);

    expect(fromBaep.kind).toBe("image-task");
    expect(fromRup.kind).toBe("image-task");
    if (fromBaep.kind === "image-task") expect(fromBaep.requestedOutputCount).toBe(3);
    if (fromRup.kind === "image-task") expect(fromRup.requestedOutputCount).toBe(3);
  });

  it("forces count 1 for 'จาก 2 ปกนี้' alone even if Director JSON says 5", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "ออกแบบจาก 2 ปก",
        refinedPrompt: "Fuse two covers into one banner",
        specialist: "image_generator",
        capability: "IMAGE_DEFAULT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Fuse both covers"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 5,
        outputBriefs: ["แบบ 1", "แบบ 2", "แบบ 3", "แบบ 4", "แบบ 5"],
      },
      {
        prompt: "ออกแบบป้ายหมวดจาก 2 ปกนี้",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1536, height: 512 },
        availableCapabilities: ["IMAGE_DEFAULT"],
        referenceAnalyses: [],
      },
      [],
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(1);
      expect(direction.outputBriefs).toHaveLength(1);
    }
  });

  it("expands a multi-size list in one ask even if Director JSON says 1", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "ปรับสัดส่วนปก",
        refinedPrompt: "Same cover artwork, recomposed for the target frame",
        specialist: "image_editor",
        capability: "IMAGE_EDIT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Preserve cover identity"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 1,
        outputBriefs: ["ปกเดียว"],
      },
      {
        prompt: "ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
      },
      [],
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(3);
      expect(direction.outputBriefs).toHaveLength(3);
    }
  });

  it("expands two Thai cm sizes in one ask even if Director JSON says 1", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "ปรับไซส์ป้าย",
        refinedPrompt: "Same campaign artwork, recomposed for the target print size",
        specialist: "image_editor",
        capability: "IMAGE_EDIT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Preserve campaign identity"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 1,
        outputBriefs: ["ไซส์เดียว"],
      },
      {
        prompt: "ปรับไซส์เป็น 29x7cm และ 60x20cm",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
      },
      [],
    );

    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(2);
      expect(direction.outputBriefs).toHaveLength(2);
    }
  });
});

describe("extractExplicitRequestedOutputCount / resolveRequestedOutputCountFromUserAsk", () => {
  it("treats orientation and input-ref phrases as default 1", () => {
    expect(extractExplicitRequestedOutputCount("ปรับเป็นแนวตั้ง")).toBeUndefined();
    expect(extractExplicitRequestedOutputCount("จาก 2 ปกนี้")).toBeUndefined();
    expect(resolveRequestedOutputCountFromUserAsk("ปรับเป็นแนวตั้ง")).toBe(1);
    expect(resolveRequestedOutputCountFromUserAsk("จาก 2 ปกนี้")).toBe(1);
  });

  it("reads explicit N and multi-size lists from the user ask", () => {
    expect(extractExplicitRequestedOutputCount("ขอ 3 แบบ")).toBe(3);
    expect(extractExplicitRequestedOutputCount("สร้าง 3 รูป")).toBe(3);
    expect(extractExplicitRequestedOutputCount("ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที")).toBe(3);
    expect(extractExplicitRequestedOutputCount("ปรับไซส์เป็น 29x7cm และ 60x20cm")).toBe(2);
    expect(extractExplicitRequestedOutputCount("29x7 และ 29x10")).toBe(2);
    expect(extractExplicitRequestedOutputCount("สองไซส์ ปรับให้")).toBe(2);
    expect(extractExplicitRequestedOutputCount("@Photo ปรับไซส์เป็น 29x7cm และ 60x20cm")).toBe(2);
    expect(resolveRequestedOutputCountFromUserAsk("ขอ 3 แบบ")).toBe(3);
    expect(resolveRequestedOutputCountFromUserAsk("สร้าง 3 รูป")).toBe(3);
    expect(resolveRequestedOutputCountFromUserAsk("ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที")).toBe(3);
    expect(resolveRequestedOutputCountFromUserAsk("ปรับไซส์เป็น 29x7cm และ 60x20cm")).toBe(2);
    expect(resolveRequestedOutputCountFromUserAsk("29x7 และ 29x10")).toBe(2);
    expect(resolveRequestedOutputCountFromUserAsk("สองไซส์ ปรับให้")).toBe(2);
    expect(extractExplicitRequestedOutputCount("@Photo สร้างรูปนี้ออกมา 5 สไตล์ต่างกัน")).toBe(5);
    expect(extractExplicitRequestedOutputCount("สร้างรูปนี้ @[Photo:id] ออกมา 5 Layout ต่างกัน")).toBe(5);
    expect(extractExplicitRequestedOutputCount("จาก 5 สไตล์นี้")).toBeUndefined();
    expect(resolveRequestedOutputCountFromUserAsk("สร้างรูป")).toBe(1);
    expect(resolveRequestedOutputCountFromUserAsk("@Photo สร้างรูปนี้ออกมา 5 สไตล์ต่างกัน")).toBe(5);
    expect(resolveRequestedOutputCountFromUserAsk("สร้างรูปนี้ ออกมา 5 Layout ต่างกัน")).toBe(5);
  });

  it("expands 5 สไตล์ต่างกัน into five briefs even if Director JSON says 1", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "สร้างป้ายโปรโมชัน 5 รูปแบบ (มินิมอล, จีนร่วมสมัย, ป็อปอาร์ต, หรูหรา, และลักชูรี)",
        refinedPrompt:
          "One sheet of the bookstore poster in five styles: มินิมอล, จีนร่วมสมัย, ป็อปอาร์ต, หรูหรา, ลักชูรี",
        specialist: "image_editor",
        capability: "IMAGE_EDIT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Each style is its own file"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 1,
        outputBriefs: ["สไตล์มินิมอลสะอาดตา"],
      },
      {
        prompt: "@Photo สร้างรูปนี้ออกมา 5 สไตล์ต่างกัน",
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1080, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
      },
      [],
    );
    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(5);
      expect(direction.outputBriefs).toEqual(["มินิมอล", "จีนร่วมสมัย", "ป็อปอาร์ต", "หรูหรา", "ลักชูรี"]);
    }
  });

  it("expands 5 Layout ต่างกัน into five briefs even if Director JSON says 1", () => {
    const direction = parseCreativeDirection(
      {
        kind: "image-task",
        summary: "จัด 5 เลย์เอาต์ (เต็มกรอบ, แยกคอลัมน์, ตัวหนังสือใหญ่, ภาพเต็ม, และโลโก้มุม)",
        refinedPrompt: "Show every layout together",
        specialist: "image_editor",
        capability: "IMAGE_EDIT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["One layout per file"],
        search: { required: false, queries: [], sources: [] },
        requestedOutputCount: 1,
        outputBriefs: ["เลย์เอาต์แรก"],
      },
      {
        prompt: "สร้างรูปนี้ @[Photo:poster] ออกมา 5 Layout ต่างกัน",
        canvasSummary: { objectCount: 1, selectedCount: 1, width: 1080, height: 1080 },
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        referenceAnalyses: [],
      },
      [],
    );
    expect(direction.kind).toBe("image-task");
    if (direction.kind === "image-task") {
      expect(direction.requestedOutputCount).toBe(5);
      expect(direction.outputBriefs).toHaveLength(5);
      expect(direction.outputBriefs?.[0]).toBe("เต็มกรอบ");
      expect(direction.outputBriefs?.[4]).toBe("โลโก้มุม");
    }
  });

  it("ignores last-package sizes on a composed orientation follow-up", () => {
    const composed = [
      "User follow-up request: ปรับเป็นแนวตั้ง",
      "",
      "=== LAST IMAGE GENERATION PACKAGE ===",
      "Exact size: 29x7cm and also 53x20cm",
      "CONTINUATION RULES:",
      "- requestedOutputCount must match the follow-up quantity when the user asked for N more images.",
    ].join("\n");
    expect(followUpAskText(composed)).toBe("ปรับเป็นแนวตั้ง");
    expect(extractExplicitRequestedOutputCount(followUpAskText(composed))).toBeUndefined();
    expect(resolveRequestedOutputCountFromUserAsk(composed)).toBe(1);
  });
});
