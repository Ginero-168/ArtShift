import { describe, expect, it } from "vitest";
import { AI_TASK_KINDS, UPSCALE_RESOLUTION_PRESETS } from "@/lib/ai-runtime/contracts";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

const input = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
  targetMegapixels: 16,
};

describe("P-Image Upscale contract", () => {
  it("registers the three output resolution presets", () => {
    expect(UPSCALE_RESOLUTION_PRESETS).toEqual([
      { value: "2k", label: "2K", rangeLabel: "4–8 MP", targetMegapixels: 8 },
      { value: "4k", label: "4K", rangeLabel: "8–16 MP", targetMegapixels: 16 },
      { value: "8k", label: "8K", rangeLabel: "16–32 MP", targetMegapixels: 32 },
    ]);
  });

  it("registers image.upscale as a public AI task", () => {
    expect(AI_TASK_KINDS).toContain("image.upscale");
  });

  it("accepts a bounded image.upscale request with a target megapixel size", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.upscale",
        input,
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toMatchObject({ task: "image.upscale", input });
  });

  it("rejects a target outside the supported UI presets", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.upscale",
        input: { ...input, targetMegapixels: 7 },
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toBeNull();
  });

  it("routes only to P-Image-Upscale", () => {
    expect(createAiRouteTable({})["image.upscale"]?.quality).toEqual([
      {
        provider: "replicate",
        model: expect.stringMatching(/^prunaai\/p-image-upscale@[a-f0-9]{64}$/),
        alias: "p-image-upscale",
        expectedMaxUsd: expect.any(Number),
        pricing: expect.objectContaining({ currency: "USD" }),
      },
    ]);
  });
});
