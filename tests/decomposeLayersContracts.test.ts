import { describe, expect, it } from "vitest";
import {
  AI_TASK_KINDS,
  DECOMPOSE_LAYERS_MAX,
  DECOMPOSE_LAYERS_MIN,
  DEFAULT_DECOMPOSE_LAYERS,
} from "@/lib/ai-runtime/contracts";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

const input = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" as const },
  width: 1024,
  height: 768,
  numLayers: 4,
};

describe("Qwen Image Layered contract", () => {
  it("registers image.decomposeLayers as a public AI task with default 4 layers", () => {
    expect(AI_TASK_KINDS).toContain("image.decomposeLayers");
    expect(DEFAULT_DECOMPOSE_LAYERS).toBe(4);
    expect(DECOMPOSE_LAYERS_MIN).toBe(2);
    expect(DECOMPOSE_LAYERS_MAX).toBe(8);
  });

  it("accepts a bounded image.decomposeLayers request", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.decomposeLayers",
        input,
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toMatchObject({ task: "image.decomposeLayers", input });
  });

  it("rejects a numLayers outside 2–8", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.decomposeLayers",
        input: { ...input, numLayers: 1 },
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toBeNull();
    expect(
      parsePublicAiExecuteRequest({
        task: "image.decomposeLayers",
        input: { ...input, numLayers: 9 },
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toBeNull();
  });

  it("routes only to qwen/qwen-image-layered", () => {
    expect(createAiRouteTable({})["image.decomposeLayers"]?.quality).toEqual([
      {
        provider: "replicate",
        model: "qwen/qwen-image-layered",
        alias: "qwen-image-layered",
        expectedMaxUsd: expect.any(Number),
        pricing: expect.objectContaining({ currency: "USD" }),
      },
    ]);
  });
});
