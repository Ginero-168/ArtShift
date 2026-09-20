import { describe, expect, it } from "vitest";
import {
  composeFollowUpDirectorPrompt,
  followUpCommandText,
  isOrientationOnlyFollowUpPrompt,
  resolveFollowUpDimensions,
} from "@/lib/ai/orchestration/chatContinuity";
import { parsePriorImageGenerationPayload } from "@/lib/ai/orchestration/priorGenerationParse";
import {
  type ContextAwareTurnInput,
  createDirectedImageRun,
  createDirectedImageTask,
  resolveTaskDimensionsWithContext,
} from "@/lib/ai/orchestration/turnOrchestrator";

const last29x7 = {
  userPrompt: "สร้างป้าย shelftalk 29x7 cm โทนชมพู ลด 35%",
  refinedPrompt: "Pink floral bookstore shelftalk, 35% off, 29x7cm",
  summary: "ป้าย 29×7 ซม.",
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

function imageTaskDirection(refinedPrompt: string) {
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
    reviewCriteria: ["Keep campaign copy"],
    search: { required: false, queries: [] as string[], sources: [] as [] },
  };
}

describe("follow-up transport: last package vs refs-only", () => {
  it("keeps exact 29×7cm fields on the recall/director lastGeneration payload", () => {
    const parsed = parsePriorImageGenerationPayload(last29x7);
    expect(parsed?.sizeLabel).toBe("29x7cm");
    expect(parsed?.sizeUnit).toBe("cm");
    expect(parsed?.sourceWidth).toBe(29);
    expect(parsed?.sourceHeight).toBe(7);
    expect(parsed?.printWidth).toBe(2848);
    expect(parsed?.printHeight).toBe(688);
    expect(parsed?.ratioClamped).toBe(true);
  });

  it("inverts 29×7cm from the last package even when a reference image is also attached", () => {
    const input: ContextAwareTurnInput = {
      prompt: "ปรับเป็นแนวตั้ง",
      refs: [
        {
          objectId: "last-output",
          elementVersion: 1,
          fileId: "file-1",
          displayName: "Last banner",
          sourceWidth: 2848,
          sourceHeight: 688,
          width: 400,
          height: 96,
          angle: 0,
        },
      ],
      analyses: [],
      priorGeneration: last29x7,
    };
    const dims = resolveTaskDimensionsWithContext(input);
    expect(dims.aspectRatio).not.toBe("9:16");
    expect(dims.ratioClamped).toBe(true);
    expect((dims.printHeight ?? 0) / (dims.printWidth ?? 1)).toBeCloseTo(29 / 7, 2);
    expect(dims.sizeLabel).toMatch(/7x29/i);
  });

  it("swaps the last-output ref pixels when the last package is missing", () => {
    const input: ContextAwareTurnInput = {
      prompt: "ปรับเป็นแนวตั้ง",
      refs: [
        {
          objectId: "last-output",
          elementVersion: 1,
          fileId: "file-1",
          displayName: "Last banner",
          sourceWidth: 2848,
          sourceHeight: 688,
          width: 400,
          height: 96,
          angle: 0,
        },
      ],
      analyses: [],
    };
    const dims = resolveTaskDimensionsWithContext(input);
    expect(dims.aspectRatio).not.toBe("9:16");
    expect(dims.height).toBeGreaterThan(dims.width);
    expect(dims.printHeight! / dims.printWidth!).toBeCloseTo(2848 / 688, 2);
  });

  it("does not let a refs-only task ignore 29×7cm when priorGeneration is supplied", () => {
    const run = createDirectedImageRun(
      {
        prompt: "ปรับเป็นแนวตั้ง",
        refs: [],
        analyses: [],
        priorGeneration: last29x7,
      },
      imageTaskDirection("Rebuild as a vertical 9:16 poster"),
    );
    const task = run.tasks[0];
    expect(task?.requestedDimensions?.aspectRatio).not.toBe("9:16");
    expect(
      (task?.requestedDimensions?.printHeight ?? 0) / (task?.requestedDimensions?.printWidth ?? 1),
    ).toBeCloseTo(29 / 7, 2);
    expect(task?.prompt).toMatch(/7x29/i);
    expect(task?.prompt).toContain("Exact size");
  });

  it("does not treat last-package 29×7cm as a new explicit size on 'ปรับเป็นแนวตั้ง'", () => {
    const composed = composeFollowUpDirectorPrompt("ปรับเป็นแนวตั้ง", last29x7, {
      kind: "revision",
    });
    expect(composed).toContain("29x7cm");
    expect(followUpCommandText(composed)).toBe("ปรับเป็นแนวตั้ง");
    expect(isOrientationOnlyFollowUpPrompt(composed)).toBe(true);
    const dims = resolveFollowUpDimensions({
      prompt: composed,
      prior: last29x7,
    });
    expect(dims?.aspectRatio).not.toBe("9:16");
    expect((dims?.printHeight ?? 0) / (dims?.printWidth ?? 1)).toBeCloseTo(29 / 7, 2);
    expect(dims?.sizeLabel).toMatch(/7x29/i);

    const task = createDirectedImageTask(
      {
        prompt: composed,
        refs: [],
        analyses: [],
        priorGeneration: last29x7,
      },
      imageTaskDirection("Rebuild as a vertical 9:16 poster"),
    );
    expect(task.requestedDimensions?.aspectRatio).not.toBe("9:16");
    expect(task.requestedDimensions?.sourceWidth).toBe(7);
    expect(task.requestedDimensions?.sourceHeight).toBe(29);
    expect(task.requestedDimensions?.sizeLabel).toMatch(/7x29/i);
  });
});
