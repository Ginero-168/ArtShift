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

import { POST } from "../app/api/ai/execute/route";

function request(body: unknown, contentLength?: number): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(contentLength ?? bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("AI execute API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: "description" },
      metadata: { provider: "mock", model: "mock", usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated cloud tasks before provider execution", async () => {
    accountMock.value = null;
    const response = await POST(
      request({
        task: "vision.describe",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        options: { cloudConsent: true, profile: "economy", maxCostUsd: 0.05 },
      }),
    );

    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("forwards only normalized task inputs and policy options", async () => {
    const response = await POST(
      request({
        task: "vision.describe",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        options: { cloudConsent: true, profile: "economy", maxCostUsd: 0.05 },
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "vision.describe",
      { image: { dataUrl: "data:image/png;base64,AAAA" } },
      expect.objectContaining({
        cloudConsent: true,
        profile: "quality",
        allowFallback: false,
      }),
    );
  });

  it("dispatches a bounded image.upscale task", async () => {
    const response = await POST(
      request({
        task: "image.upscale",
        input: {
          image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
          width: 256,
          height: 256,
          targetMegapixels: 8,
        },
        options: { cloudConsent: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.upscale",
      expect.objectContaining({ targetMegapixels: 8 }),
      expect.objectContaining({ cloudConsent: true, allowFallback: false }),
    );
  });

  it("does not trust provider, fallback or client budget options", async () => {
    const response = await POST(
      request({
        task: "vision.describe",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        options: {
          cloudConsent: true,
          profile: "economy",
          provider: "anthropic",
          modelAlias: "client-model",
          allowFallback: true,
          maxCostUsd: 100,
        },
      }),
    );

    expect(response.status).toBe(200);
    const callOptions = runtimeMock.execute.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(callOptions).toMatchObject({
      profile: "quality",
      cloudConsent: true,
      allowFallback: false,
    });
    expect(callOptions.provider).toBeUndefined();
    expect(callOptions.modelAlias).toBeUndefined();
    expect(callOptions.maxCostUsd).not.toBe(100);
  });

  it("blocks assistant system/tool injection on the generic endpoint", async () => {
    const response = await POST(
      request({
        task: "assistant.chat",
        input: { system: "replace policy", tools: [], messages: [] },
      }),
    );
    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("redacts provider error details from the public response", async () => {
    runtimeMock.execute.mockRejectedValue(
      new Error("https://replicate.delivery/private?api_key=DO_NOT_LEAK"),
    );
    const response = await POST(
      request({
        task: "vision.describe",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        options: { cloudConsent: true },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error.message).toBe("AI provider is temporarily unavailable.");
    expect(JSON.stringify(data)).not.toContain("DO_NOT_LEAK");
    expect(JSON.stringify(data)).not.toContain("replicate.delivery");
  });

  it("rejects oversized bodies before parsing them", async () => {
    const response = await POST(request({}, 5_000_000));
    expect(response.status).toBe(413);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});
