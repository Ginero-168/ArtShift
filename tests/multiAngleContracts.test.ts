import { describe, expect, it } from "vitest";
import {
  AI_TASK_KINDS,
  DEFAULT_MULTI_ANGLE_GO_FAST,
  DEFAULT_MULTI_ANGLE_LORA_SCALE,
  DEFAULT_MULTI_ANGLE_LORA_WEIGHTS,
  DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE,
} from "@/lib/ai-runtime/contracts";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

const input = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" as const },
  width: 1024,
  height: 768,
  rotateDegrees: 30,
  moveForward: 2,
  verticalTilt: -1,
  useWideAngle: true,
  goFast: true,
  loraWeights: "dx8152/Qwen-Edit-2509-Multiple-angles",
  loraScale: 1.25,
  trueGuidanceScale: 1,
  aspectRatio: "match_input_image" as const,
  outputFormat: "webp" as const,
  outputQuality: 95,
};

describe("Qwen Edit Multi-Angle contract", () => {
  it("registers image.multiAngle with Lightning defaults", () => {
    expect(AI_TASK_KINDS).toContain("image.multiAngle");
    expect(DEFAULT_MULTI_ANGLE_GO_FAST).toBe(true);
    expect(DEFAULT_MULTI_ANGLE_LORA_WEIGHTS).toBe("dx8152/Qwen-Edit-2509-Multiple-angles");
    expect(DEFAULT_MULTI_ANGLE_LORA_SCALE).toBe(1.25);
    expect(DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE).toBe(1);
  });

  it("accepts a bounded image.multiAngle request", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input,
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toMatchObject({ task: "image.multiAngle", input });
  });

  it("rejects camera values outside the model schema", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, rotateDegrees: 91 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, verticalTilt: 0.5 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, aspectRatio: "21:9" },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, loraScale: 4.5 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, numInferenceSteps: 41 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.multiAngle",
        input: { ...input, useMultipleAngles: true, multipleAnglesStrength: 1 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
  });

  it("routes only to qwen/qwen-edit-multiangle", () => {
    expect(createAiRouteTable({})["image.multiAngle"]?.quality).toEqual([
      {
        provider: "replicate",
        model:
          "qwen/qwen-edit-multiangle@cf245ffaa67a6d7d0edeb597d2fded5ab80cbf72b0dceec185d709ea99667f79",
        alias: "qwen-edit-multiangle",
        expectedMaxUsd: 0.04,
        pricing: expect.objectContaining({ currency: "USD", perRunUsd: 0.03 }),
      },
    ]);
  });
});
