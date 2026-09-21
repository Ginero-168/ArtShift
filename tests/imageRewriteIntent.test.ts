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

const lastWidescreen = {
  userPrompt: "สร้างรูปวิว 16:9",
  refinedPrompt: "Landscape 16:9",
  width: 1280,
  height: 720,
  aspectRatio: "16:9",
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

function ref(id: string, name: string, sourceWidth: number, sourceHeight: number) {
  return {
    objectId: id,
    elementVersion: 1,
    fileId: `file-${id}`,
    displayName: name,
    sourceWidth,
    sourceHeight,
    width: Math.round(sourceWidth / 3),
    height: Math.round(sourceHeight / 3),
    angle: 0,
  };
}

describe("directed rewrite intent is structural, not a style/subject catalog", () => {
  it("detects style/medium/aspect rewrites across unrelated subjects", () => {
    expect(isDirectedImageRewrite("ทำให้เป็น watercolor 16:9")).toBe(true);
    expect(isDirectedImageRewrite("convert this coffee shot to flat vector")).toBe(true);
    expect(isDirectedImageRewrite("make this bicycle photo look like a linocut 4:5")).toBe(true);
    expect(isDirectedImageRewrite("in the style of a woodcut from this ocean photo")).toBe(true);
    expect(isDirectedImageRewrite("ปรับโทนภาพตึกนี้เป็นซีเปีย สัดส่วน 9:16")).toBe(true);
    expect(isDirectedImageRewrite("จากภาพทะเลนี้ ทำเป็นภาพพิมพ์แกะไม้")).toBe(true);
    expect(isDirectedImageRewrite("ปรับให้เป็นภาพขาวดำ")).toBe(true);
    expect(isDirectedImageRewrite("ปรับให้เป็นภาพการ์ตูน")).toBe(true);
    expect(isDirectedImageRewrite("@Photo ปรับให้เป็น Pixel Art สัดส่วน 1:1")).toBe(true);
    expect(isDirectedImageRewrite("สร้างมาอีก 3 รูป")).toBe(false);
    expect(isDirectedImageRewrite("สร้างรูปวิวภูเขา")).toBe(false);
  });

  it("treats a short leftover command on a tagged source as a rewrite of any medium", () => {
    expect(isDirectedImageRewrite("linocut", { hasReference: true })).toBe(true);
    expect(isDirectedImageRewrite("ภาพแกะไม้", { hasReference: true })).toBe(true);
    expect(isDirectedImageRewrite("linocut")).toBe(false);
    expect(isDirectedImageRewrite("สร้างโปสเตอร์โปรโมทรองเท้า", { hasReference: true })).toBe(false);
    expect(isDirectedImageRewrite("สร้างมาอีก 3 รูป", { hasReference: true })).toBe(false);
  });

  it("never replaces the current user instruction with a generic stock English pack", () => {
    const linocut = streamlinePromptForImageGen("make this bicycle photo look like a linocut 4:5");
    expect(linocut).toMatch(/linocut/i);
    expect(linocut).toContain("4:5");
    expect(linocut).toMatch(/bicycle/i);
    expect(linocut).not.toMatch(/masterwork commercial art/i);

    const sepia = streamlinePromptForImageGen("ปรับโทนภาพตึกนี้เป็นซีเปีย สัดส่วน 9:16");
    expect(sepia).toContain("ซีเปีย");
    expect(sepia).toContain("ตึก");
    expect(sepia).toContain("9:16");

    const woodcut = streamlinePromptForImageGen("จากภาพทะเลนี้ ทำเป็นภาพพิมพ์แกะไม้");
    expect(woodcut).toContain("ทะเล");
    expect(woodcut).toContain("ภาพพิมพ์แกะไม้");

    const watercolor = streamlinePromptForImageGen("ทำให้เป็น watercolor 16:9 จากภาพสุนัขนี้");
    expect(watercolor).toMatch(/watercolor/i);
    expect(watercolor).toContain("16:9");
    expect(watercolor).toMatch(/สุนัข|dog/i);

    const vector = streamlinePromptForImageGen("convert this coffee shot to flat vector 1:1");
    expect(vector).toMatch(/flat vector/i);
    expect(vector).toContain("1:1");
    expect(vector).toMatch(/coffee/i);

    const cartoon = streamlinePromptForImageGen("ปรับให้เป็นภาพการ์ตูน");
    expect(cartoon).toContain("การ์ตูน");
    expect(cartoon).not.toMatch(/masterwork commercial art/i);

    const lineArt = streamlinePromptForImageGen("ทำเป็นภาพลายเส้นจากรูปดอกไม้ สัดส่วน 3:4");
    expect(lineArt).toContain("ลายเส้น");
    expect(lineArt).toContain("ดอกไม้");
    expect(lineArt).toContain("3:4");

    const pixel = streamlinePromptForImageGen("@ภาพแมว ปรับให้เป็น Pixel Art สัดส่วน 1:1");
    expect(pixel).toMatch(/Pixel Art/i);
    expect(pixel).toContain("1:1");
    expect(pixel).not.toMatch(/masterwork commercial art/i);
  });

  it("reinstates missing style and aspect when Director emits a generic stock prompt", () => {
    const bicycle = preserveUserInstructionInPrompt(
      "professional product photography, studio lighting, 8k, masterwork commercial art",
      "make this bicycle photo look like a linocut 4:5",
    );
    expect(bicycle).toContain("User instruction (authoritative):");
    expect(bicycle).toMatch(/linocut/i);
    expect(bicycle).toContain("4:5");
    expect(bicycle).toMatch(/bicycle/i);

    const building = preserveUserInstructionInPrompt(
      "modern luxury architecture house, cinematic lighting, 8k",
      "ปรับโทนภาพตึกนี้เป็นซีเปีย สัดส่วน 9:16",
    );
    expect(building).toContain("ซีเปีย");
    expect(building).toContain("9:16");
    expect(building).toContain("ตึก");

    const ocean = preserveUserInstructionInPrompt(
      "beautiful tropical beach ocean, sunny day, cinematic lighting",
      "จากภาพทะเลนี้ ทำเป็นภาพพิมพ์แกะไม้",
    );
    expect(ocean).toContain("ทะเล");
    expect(ocean).toContain("ภาพพิมพ์แกะไม้");

    const coffee = preserveUserInstructionInPrompt(
      "delicious gourmet meal plate, professional food photography, 8k",
      "convert this coffee shot to flat vector 1:1",
    );
    expect(coffee).toMatch(/flat vector/i);
    expect(coffee).toContain("1:1");
    expect(coffee).toMatch(/coffee/i);

    const thaiOnly = preserveUserInstructionInPrompt(
      "vibrant blooming colorful flowers, botanical garden, soft focus, 8k resolution",
      "ปรับให้เป็นภาพการ์ตูน",
    );
    expect(thaiOnly).toContain("การ์ตูน");
    expect(thaiOnly).toContain("User instruction (authoritative):");

    const cat = preserveUserInstructionInPrompt(
      "cute fluffy cat, highly detailed fur, studio lighting, 8k resolution",
      "ปรับให้เป็น Pixel Art สัดส่วน 1:1",
    );
    expect(cat).toMatch(/Pixel Art/i);
    expect(cat).toContain("1:1");
  });
});

describe("size priority is the same for every subject", () => {
  it("honors สัดส่วน 3:4 in text over last-package 29×7 and a portrait bicycle photo", () => {
    const bicycle = ref("bike-portrait", "Bicycle", 1024, 768);
    const dims = resolveTaskDimensionsWithContext({
      prompt: "@Bicycle make this look like a linocut สัดส่วน 3:4",
      refs: [bicycle],
      analyses: [],
      priorGeneration: lastPortrait,
    });
    expect(dims.aspectRatio).toBe("3:4");
    expect(dims.height / dims.width).toBeCloseTo(4 / 3, 2);
  });

  it("uses a newly inserted square motorcycle photo instead of last-package 16:9", () => {
    const motorcycle = ref("moto-square", "Motorcycle", 1200, 1200);
    const dims = resolveTaskDimensionsWithContext({
      prompt: "@Motorcycle ทำโปสเตอร์จากภาพนี้",
      refs: [motorcycle],
      analyses: [],
      priorGeneration: lastWidescreen,
    });
    expect(dims.aspectRatio).toBe("1:1");
  });

  it("uses a newly inserted square building photo instead of last-package 16:9", () => {
    const building = ref("building-square", "Building", 1200, 1200);
    const dims = resolveTaskDimensionsWithContext({
      prompt: "@Building ทำโปสเตอร์จากภาพนี้",
      refs: [building],
      analyses: [],
      priorGeneration: lastWidescreen,
    });
    expect(dims.aspectRatio).toBe("1:1");
  });

  it("honors explicit 9:16 over last-gen 29×7cm and an attached ocean landscape", () => {
    const ocean = ref("ocean-wide", "Ocean", 1920, 1080);
    const input: ContextAwareTurnInput = {
      prompt: "@Ocean ปรับโทนภาพทะเลนี้เป็นซีเปีย สัดส่วน 9:16",
      refs: [ocean],
      analyses: [],
      priorGeneration: lastPortrait,
    };
    const dims = resolveTaskDimensionsWithContext(input);
    expect(dims.aspectRatio).toBe("9:16");
    expect(dims.height).toBeGreaterThan(dims.width);

    const run = createDirectedImageRun(
      {
        ...input,
        analyses: [
          {
            ref: ocean,
            caption: "waves on a rocky coast",
            objects: ["ocean", "rock", "sky"],
            visibleText: "",
            dimensions: { width: 1920, height: 1080, aspectRatio: 16 / 9 },
            transparency: "unknown",
            appearanceNotes: [],
            limitations: [],
          },
        ],
      },
      direction("beautiful tropical beach ocean, cinematic lighting, 8k, 16:9 landscape"),
    );
    expect(run.tasks[0]?.requestedDimensions?.aspectRatio).toBe("9:16");
    expect(run.tasks[0]?.prompt).toContain("ซีเปีย");
    expect(run.tasks[0]?.prompt).toContain("9:16");
    expect(run.tasks[0]?.requiredSubjects).toEqual(["ocean"]);
  });

  it("still honors สัดส่วน 1:1 over last-gen 29×7cm for a tagged portrait (same policy)", () => {
    const portraitPhoto = ref("photo-portrait", "Photo", 768, 1024);
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
  it("passes a linocut bicycle rewrite when analysis names a print instead of a bike", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1280,
      requestedAspectRatio: "4:5",
      requiredSubjects: ["bicycle", "street"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "a red bicycle locked to a rail",
          objects: ["bicycle", "street"],
          visibleText: "",
          limitations: ["cropped"],
        },
      ],
      outputAnalysis: {
        caption: "high-contrast linocut print of a vehicle",
        objects: ["print"],
        visibleText: "",
        limitations: ["stylized", "limited ink colors"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "reference")?.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "subject")?.passed).toBe(true);
  });

  it("passes a sepia building rewrite with the same policy", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 720,
      outputHeight: 1280,
      requestedAspectRatio: "9:16",
      requiredSubjects: ["building", "window"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "a concrete office tower",
          objects: ["building", "window"],
          visibleText: "",
          limitations: [],
        },
      ],
      outputAnalysis: {
        caption: "warm sepia architectural study",
        objects: ["illustration"],
        visibleText: "",
        limitations: ["toned"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
  });

  it("passes a woodcut ocean rewrite with the same policy", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["ocean", "rock"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "waves hitting dark rocks",
          objects: ["ocean", "rock"],
          visibleText: "",
          limitations: ["spray"],
        },
      ],
      outputAnalysis: {
        caption: "carved woodblock seascape",
        objects: ["print"],
        visibleText: "",
        limitations: ["stylized"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
  });

  it("passes a Thai cartoon rewrite of a flower photo with the same policy", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["flower", "vase"],
      referenceRequired: true,
      referenceFacts: [
        {
          caption: "pink flowers in a glass vase",
          objects: ["flower", "vase"],
          visibleText: "",
          limitations: ["cropped"],
        },
      ],
      outputAnalysis: {
        caption: "simple cartoon botanical drawing",
        objects: ["drawing"],
        visibleText: "",
        limitations: ["stylized"],
      },
      directedRewrite: true,
    });
    expect(result.passed).toBe(true);
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
    const bicycle = diagnoseOrchestratorError(
      "Generated image failed the semantic quality gate: Required subjects must be supported by local output analysis.",
      "make this bicycle photo look like a linocut 4:5",
    );
    expect(bicycle.errorCard?.promptToEdit).toMatch(/linocut/i);
    expect(bicycle.errorCard?.promptToEdit).toContain("4:5");
    expect(bicycle.errorCard?.promptToEdit).toMatch(/bicycle/i);
    expect(bicycle.errorCard?.promptToEdit).not.toMatch(/masterwork commercial art/i);

    const ocean = diagnoseOrchestratorError(
      "Generated image failed the semantic quality gate: Reference fidelity needs a source comparison signal.",
      "จากภาพทะเลนี้ ทำเป็นภาพพิมพ์แกะไม้",
    );
    expect(ocean.errorCard?.promptToEdit).toContain("ทะเล");
    expect(ocean.errorCard?.promptToEdit).toContain("ภาพพิมพ์แกะไม้");

    const cat = diagnoseOrchestratorError(
      "Generated image failed the semantic quality gate: Required subjects must be supported by local output analysis.",
      "@ภาพแมว ปรับให้เป็น Pixel Art สัดส่วน 1:1",
    );
    expect(cat.errorCard?.promptToEdit).toContain("Pixel Art");
    expect(cat.errorCard?.promptToEdit).toContain("1:1");
  });
});
