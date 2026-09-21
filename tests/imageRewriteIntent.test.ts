import { describe, expect, it } from "vitest";
import { diagnoseOrchestratorError } from "@/lib/ai/coPilot";
import { streamlinePromptForImageGen } from "@/lib/ai/imageGeneration";
import {
  isDirectedImageRewrite,
  preserveUserInstructionInPrompt,
} from "@/lib/ai/imageRewriteIntent";
import { runGeneratedImageQualityGate } from "@/lib/ai/orchestration/resultQualityGate";
import {
  type ContextAwareTurnInput,
  createDirectedImageRun,
  resolveTaskDimensionsWithContext,
} from "@/lib/ai/orchestration/turnOrchestrator";

const lastPortrait = {
  userPrompt: "สร้างป้าย shelftalk 29x7 cm",
  refinedPrompt: "Pink floral shelftalk, 29x7cm",
  summary: "ป้าย 29×7",
  width: 2048,
  height: 688,
  aspectRatio: "2048x688",
  ratioClamped: true,
  printWidth: 2848,
  printHeight: 688,
  sourceWidth: 29,
  sourceHeight: 7,
  sizeLabel: "29x7cm",
  sizeUnit: "cm" as const,
};

function direction(refinedPrompt: string) {
  return {
    kind: "image-task" as const,
    outputCount: 1 as const,
    requestedOutputCount: 1,
    summary: refinedPrompt,
    refinedPrompt,
    specialist: "image_generator" as const,
    capability: "IMAGE_DEFAULT" as const,
    modelAlias: "image-gpt-2" as const,
    knowledgeSkillIds: [] as string[],
    reviewCriteria: [] as string[],
    search: { required: false, queries: [] as string[], sources: [] as [] },
  };
}

describe("directed rewrite intent is general, not subject-specific", () => {
  it("detects style/medium/aspect rewrites across subjects", () => {
    expect(isDirectedImageRewrite("@Photo ปรับให้เป็น Pixel Art สัดส่วน 1:1")).toBe(true);
    expect(isDirectedImageRewrite("ทำให้เป็น watercolor 16:9")).toBe(true);
    expect(isDirectedImageRewrite("convert this coffee shot to flat vector")).toBe(true);
    expect(isDirectedImageRewrite("สร้างมาอีก 3 รูป")).toBe(false);
  });

  it("never replaces the current user instruction with a generic stock English pack", () => {
    const pixel = streamlinePromptForImageGen("@ภาพแมว ปรับให้เป็น Pixel Art สัดส่วน 1:1");
    expect(pixel).toMatch(/Pixel Art/i);
    expect(pixel).toContain("1:1");
    expect(pixel).not.toBe(
      "cute fluffy cat, highly detailed fur, studio lighting, 8k resolution, cinematic lighting, sharp focus, masterwork commercial art",
    );
    expect(pixel).not.toMatch(/masterwork commercial art/i);

    const watercolor = streamlinePromptForImageGen("ทำให้เป็น watercolor 16:9 จากภาพสุนัขนี้");
    expect(watercolor).toMatch(/watercolor/i);
    expect(watercolor).toContain("16:9");
    expect(watercolor).toMatch(/สุนัข|dog/i);

    const vector = streamlinePromptForImageGen("convert this coffee shot to flat vector 1:1");
    expect(vector).toMatch(/flat vector/i);
    expect(vector).toContain("1:1");
    expect(vector).toMatch(/coffee/i);
  });

  it("reinstates missing style and aspect when Director emits a generic stock prompt", () => {
    const stock = "cute fluffy cat, highly detailed fur, studio lighting, 8k resolution";
    const kept = preserveUserInstructionInPrompt(stock, "ปรับให้เป็น Pixel Art สัดส่วน 1:1");
    expect(kept).toContain("User instruction (authoritative):");
    expect(kept).toMatch(/Pixel Art/i);
    expect(kept).toContain("1:1");

    const coffee = preserveUserInstructionInPrompt(
      "delicious gourmet meal plate, professional food photography, 8k",
      "convert this coffee shot to flat vector 1:1",
    );
    expect(coffee).toMatch(/flat vector/i);
    expect(coffee).toContain("1:1");
    expect(coffee).toMatch(/coffee/i);
  });
});

describe("explicit current-ask size still beats last package and attached portraits", () => {
  const portraitPhoto = {
    objectId: "photo-portrait",
    elementVersion: 1,
    fileId: "file-portrait",
    displayName: "Photo",
    sourceWidth: 768,
    sourceHeight: 1024,
    width: 300,
    height: 400,
    angle: 0,
  };

  it("honors สัดส่วน 1:1 over last-gen 29×7cm and a portrait tagged photo", () => {
    const input: ContextAwareTurnInput = {
      prompt: "@Photo ปรับให้เป็น Pixel Art สัดส่วน 1:1",
      refs: [portraitPhoto],
      analyses: [],
      priorGeneration: lastPortrait,
    };
    const dims = resolveTaskDimensionsWithContext(input);
    expect(dims.aspectRatio).toBe("1:1");
    expect(dims.width).toBe(dims.height);

    const run = createDirectedImageRun(
      {
        ...input,
        analyses: [
          {
            ref: portraitPhoto,
            caption: "an orange cat",
            objects: ["cat", "floor", "plant"],
            visibleText: "",
            dimensions: { width: 768, height: 1024, aspectRatio: 0.75 },
            transparency: "unknown",
            appearanceNotes: [],
            limitations: [],
          },
        ],
      },
      direction("cute fluffy cat, highly detailed fur, studio lighting, 8k, 9:16 portrait"),
    );
    expect(run.tasks[0]?.requestedDimensions?.aspectRatio).toBe("1:1");
    expect(run.tasks[0]?.prompt).toMatch(/Pixel Art/i);
    expect(run.tasks[0]?.prompt).toContain("1:1");
    expect(run.tasks[0]?.requiredSubjects).toEqual(["cat"]);
  });
});

describe("quality gate does not hard-fail directed rewrites", () => {
  it("passes a style rewrite when local analysis cannot prove photorealistic overlap", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["cat", "floor", "sofa"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "an orange tabby walking on hardwood",
          objects: ["cat", "floor", "sofa"],
          visibleText: "",
          limitations: ["partial view"],
        },
      ],
      outputAnalysis: {
        caption: "stylized pixel-art character on a simple backdrop",
        objects: ["character"],
        visibleText: "",
        limitations: ["stylized", "low color count"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "reference")?.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "subject")?.passed).toBe(true);
  });

  it("also passes a watercolor/dog rewrite with the same policy", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1280,
      outputHeight: 720,
      requestedAspectRatio: "16:9",
      requiredSubjects: ["dog", "grass"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "a brown dog in a park",
          objects: ["dog", "grass"],
          visibleText: "",
          limitations: [],
        },
      ],
      outputAnalysis: {
        caption: "loose watercolor animal study",
        objects: ["illustration"],
        visibleText: "",
        limitations: ["painterly"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
  });

  it("still fails a non-rewrite when reference overlap cannot be proven", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["mug"],
      referenceRequired: true,
      outputAnalysis: {
        caption: "a landscape photograph",
        objects: ["tree"],
        visibleText: "",
        limitations: [],
      },
    });
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "reference")?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "subject")?.passed).toBe(false);
  });
});

describe("error card keeps the user's ask", () => {
  it("does not put a generic stock prompt in คำขอ after a quality-gate failure", () => {
    const diagnosis = diagnoseOrchestratorError(
      "Generated image failed the semantic quality gate: Required subjects must be supported by local output analysis.",
      "@ภาพแมว ปรับให้เป็น Pixel Art สัดส่วน 1:1",
    );
    expect(diagnosis.errorCard?.promptToEdit).toContain("Pixel Art");
    expect(diagnosis.errorCard?.promptToEdit).toContain("1:1");
    expect(diagnosis.errorCard?.promptToEdit).not.toMatch(/masterwork commercial art/i);
  });
});
