import { describe, expect, it } from "vitest";
import {
  AI_TASK_KINDS,
  DEFAULT_MULTI_ANGLE_GO_FAST,
  DEFAULT_MULTI_ANGLE_STRENGTH,
  DEFAULT_MULTI_ANGLE_USE_MULTIPLE_ANGLES,
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
  useMultipleAngles: true,
  multipleAnglesStrength: 1,
  aspectRatio: "match_input_image" as const,
  outputFormat: "webp" as const,
  outputQuality: 95,
};

describe("Qwen Edit Multi-Angle contract", () => {
  it("registers image.multiAngle with Lightning defaults", () => {
    expect(AI_TASK_KINDS).toContain("image.multiAngle");
    expect(DEFAULT_MULTI_ANGLE_GO_FAST).toBe(true);
    expect(DEFAULT_MULTI_ANGLE_USE_MULTIPLE_ANGLES).toBe(true);
    expect(DEFAULT_MULTI_ANGLE_STRENGTH).toBe(1);
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
        input: { ...input, rotateDegrees: 181 },
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
  });

  it("routes only to qwen/qwen-edit-multiangle", () => {
    expect(createAiRouteTable({})["image.multiAngle"]?.quality).toEqual([
      {
        provider: "replicate",
        model: "qwen/qwen-edit-multiangle",
        alias: "qwen-edit-multiangle",
        expectedMaxUsd: expect.any(Number),
        pricing: expect.objectContaining({ currency: "USD" }),
      },
    ]);
  });
});
