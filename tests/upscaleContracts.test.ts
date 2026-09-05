import { describe, expect, it } from "vitest";
import { AI_TASK_KINDS } from "@/lib/ai-runtime/contracts";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

const input = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
};

describe("Recraft Crisp Upscale contract", () => {
  it("registers image.upscale as a public AI task", () => {
    expect(AI_TASK_KINDS).toContain("image.upscale");
  });

  it("accepts a bounded image.upscale request", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "image.upscale",
        input,
        options: { provider: "replicate", cloudConsent: true, allowFallback: false },
      }),
    ).toMatchObject({ task: "image.upscale", input });
  });

  it("routes only to the requested Recraft Crisp Upscale model", () => {
    expect(createAiRouteTable({})["image.upscale"]?.quality).toEqual([
      {
        provider: "replicate",
        model: "recraft-ai/recraft-crisp-upscale",
        alias: "recraft-crisp-upscale",
        expectedMaxUsd: expect.any(Number),
        pricing: expect.objectContaining({ currency: "USD" }),
      },
    ]);
  });
});
