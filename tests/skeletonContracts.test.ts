import { describe, expect, it } from "vitest";
import {
  AI_TASK_KINDS,
  DEFAULT_YOLO_POSE_CONF,
  DEFAULT_YOLO_POSE_IMGSZ,
  DEFAULT_YOLO_POSE_IOU,
  DEFAULT_YOLO_POSE_MODEL_SIZE,
} from "@/lib/ai-runtime/contracts";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

const input = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" as const },
  width: 1024,
  height: 768,
  modelSize: "n" as const,
};

describe("YOLO26 pose skeleton contract", () => {
  it("registers image.poseSkeleton with the nano defaults", () => {
    expect(AI_TASK_KINDS).toContain("image.poseSkeleton");
    expect(DEFAULT_YOLO_POSE_MODEL_SIZE).toBe("n");
    expect(DEFAULT_YOLO_POSE_CONF).toBe(0.25);
    expect(DEFAULT_YOLO_POSE_IOU).toBe(0.45);
    expect(DEFAULT_YOLO_POSE_IMGSZ).toBe(640);
  });

  it("accepts a bounded image.poseSkeleton request", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.poseSkeleton",
        input,
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toMatchObject({ task: "image.poseSkeleton", input });
  });

  it("rejects sizes and dimensions outside the model schema", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.poseSkeleton",
        input: { ...input, modelSize: "xl" },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.poseSkeleton",
        input: { ...input, width: 5000 },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.poseSkeleton",
        input: { ...input, returnJson: false },
        options: { cloudConsent: true },
      }),
    ).toBeNull();
  });

  it("routes only to the pinned ultralytics/yolo26-pose version", () => {
    expect(createAiRouteTable({})["image.poseSkeleton"]?.quality).toEqual([
      {
        provider: "replicate",
        model:
          "ultralytics/yolo26-pose@0da88062bf83caea8e8d2456ae5290a8efab06420bc58cd1ebb9ec2324353aa8",
        alias: "yolo26-pose",
        expectedMaxUsd: 0.02,
        pricing: expect.objectContaining({ currency: "USD", perRunUsd: 0.01 }),
      },
    ]);
  });
});
