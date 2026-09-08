import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: () => undefined,
}));

import { GPT_IMAGE_2_EXECUTION_TIMEOUT_MS } from "@/lib/ai/runtimeLimits";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { POST } from "../app/api/ai/image/route";

function request(body: unknown, contentLength?: number): NextRequest {
  return {
    headers: new Headers(
      contentLength === undefined ? undefined : { "content-length": String(contentLength) },
    ),
    json: async () => body,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

const imageExecution = {
  output: {
    dataUrl: "data:image/png;base64,AAAA",
    prompt: "A highly detailed orange cat",
    width: 512,
    height: 512,
    seed: 42,
  },
  metadata: {
    provider: "replicate",
    model: "openai/gpt-image-2",
    usage: {},
    warnings: [],
  },
};

describe("AI image generation API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue(imageExecution);
  });

  it("rejects an oversized body before parsing", async () => {
    const response = await POST(request({}, 32 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before provider execution", async () => {
    accountMock.value = null;
    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: false, cloudConsent: true, quality: "medium" }),
    );

    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("honors enhance=false without calling the prompt task", async () => {
    const response = await POST(
      request({
        prompt: "แมวสีส้ม",
        model: "client-selected-model",
        enhance: false,
        cloudConsent: true,
        quality: "medium",
        width: 512,
        height: 512,
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledTimes(1);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.objectContaining({ prompt: "แมวสีส้ม", width: 512, height: 512 }),
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "image-gpt-2",
        cloudConsent: true,
        allowFallback: false,
      }),
    );
    expect(runtimeMock.execute.mock.calls[0]?.[1]).not.toHaveProperty("model");
  });

  it("ignores a client-supplied cost ceiling without imposing a server cost gate", async () => {
    const response = await POST(
      request({
        prompt: "แมวสีส้ม",
        enhance: false,
        cloudConsent: true,
        quality: "medium",
        maxCostUsd: 0,
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.any(Object),
      expect.objectContaining({ timeoutMs: GPT_IMAGE_2_EXECUTION_TIMEOUT_MS }),
    );
    expect(runtimeMock.execute.mock.calls[0]?.[2]).not.toHaveProperty("maxCostUsd");
  });

  it("routes prompt enhancement and image generation through the AI Runtime", async () => {
    runtimeMock.execute
      .mockResolvedValueOnce({ output: { prompt: "A highly detailed orange cat" } })
      .mockResolvedValueOnce(imageExecution);

    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: true, cloudConsent: true, quality: "medium" }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      1,
      "prompt.enhance",
      expect.objectContaining({ purpose: "image" }),
      expect.objectContaining({ cloudConsent: true, allowFallback: false }),
    );
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      2,
      "image.generate",
      expect.objectContaining({ prompt: "A highly detailed orange cat" }),
      expect.objectContaining({ allowFallback: false }),
    );
  });

  it("uses local prompt enrichment when the cloud prompt task is unavailable", async () => {
    runtimeMock.execute
      .mockRejectedValueOnce(new Error("prompt provider unavailable"))
      .mockResolvedValueOnce(imageExecution);

    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: true, cloudConsent: true, quality: "medium" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      2,
      "image.generate",
      expect.objectContaining({ prompt: expect.stringContaining("cat") }),
      expect.any(Object),
    );
    expect(data.warnings).toContain(
      "Cloud prompt enhancement was unavailable; local enrichment was used.",
    );
  });

  it("rejects an empty prompt before any provider task", async () => {
    const response = await POST(request({ prompt: "   ", cloudConsent: true }));

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("requires explicit cloud consent", async () => {
    const response = await POST(request({ prompt: "แมวสีส้ม", enhance: false }));

    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it.each([undefined, "fast"])("rejects invalid quality values: %s", async (quality) => {
    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: false, cloudConsent: true, quality }),
    );

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects a non-object JSON body without throwing", async () => {
    const response = await POST(request(null));

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed or oversized reference image payloads", async () => {
    const response = await POST(
      request({
        prompt: "แก้ภาพสินค้าในสตูดิโอ",
        enhance: false,
        cloudConsent: true,
        inputImages: [{ dataUrl: "data:image/png;base64,not valid!" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("forwards a consented reference image and automatic quality to the runtime", async () => {
    const response = await POST(
      request({
        prompt: "สร้างภาพ product photo แบบสตูดิโอ",
        enhance: false,
        cloudConsent: true,
        quality: "high",
        inputImages: [{ dataUrl: "data:image/png;base64,REF", mimeType: "image/png" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.objectContaining({
        quality: "high",
        inputImages: [{ dataUrl: "data:image/png;base64,REF", mimeType: "image/png" }],
      }),
      expect.objectContaining({ cloudConsent: true, modelAlias: "image-gpt-2" }),
    );
  });

  it("returns a generic provider failure without leaking provider details", async () => {
    runtimeMock.execute.mockRejectedValue(new Error("provider secret api_key=DO_NOT_LEAK"));

    const response = await POST(
      request({
        prompt: "สร้างภาพแมวในสตูดิโอ",
        enhance: false,
        cloudConsent: true,
        quality: "medium",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe("Image generation failed. Please try again.");
    expect(JSON.stringify(data)).not.toContain("DO_NOT_LEAK");
  });

  it("preserves an opaque prediction handle for an uncertain provider result", async () => {
    runtimeMock.execute.mockRejectedValue(
      new AiRuntimeError("PROVIDER_UNAVAILABLE", "status transport lost", {
        provider: "replicate",
        outcomeUnknown: true,
        predictionId: "prediction-opaque-1",
      }),
    );

    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: false, cloudConsent: true, quality: "medium" }),
    );
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data).toMatchObject({
      code: "OUTCOME_UNKNOWN",
      predictionId: "prediction-opaque-1",
    });
    expect(JSON.stringify(data)).not.toContain("status transport lost");
  });
});
