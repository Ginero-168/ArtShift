import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));

vi.mock("@/lib/server/ai/runtime", () => ({ getServerAiRuntime: () => runtimeMock }));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getSessionReplicateToken: () => "session-token",
  getUserAccount: () => accountMock.value,
}));

import { POST as upscalePost } from "../app/api/upscale/recraft/route";
import { POST as vectorizePost } from "../app/api/vectorize/recraft/route";

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

const image = { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" as const };

function upscaleBody(options: Record<string, unknown> = { cloudConsent: true }) {
  return {
    task: "image.upscale",
    input: { image, width: 256, height: 256, targetMegapixels: 8 },
    options,
  };
}

function vectorizeBody(options: Record<string, unknown> = { cloudConsent: true }) {
  return {
    task: "vectorize.recraft",
    input: { image, width: 256, height: 256 },
    options,
  };
}

describe("legacy Recraft route security boundaries", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { dataUrl: "data:image/png;base64,AAAA", svg: "<svg />" },
      metadata: { provider: "replicate", model: "model", usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated upscale requests before execution", async () => {
    accountMock.value = null;

    const response = await upscalePost(request(upscaleBody()));

    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects vectorize requests without explicit cloud consent", async () => {
    const response = await vectorizePost(request(vectorizeBody({ cloudConsent: false })));

    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("uses server-owned options for an authorized upscale request", async () => {
    const response = await upscalePost(
      request(
        upscaleBody({
          cloudConsent: true,
          provider: "replicate",
          allowFallback: true,
          maxCostUsd: 100,
        }),
      ),
    );

    expect(response.status).toBe(200);
    const options = runtimeMock.execute.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(options).toMatchObject({
      profile: "quality",
      provider: "replicate",
      modelAlias: "p-image-upscale",
      cloudConsent: true,
      allowFallback: false,
      maxCostUsd: 0.25,
    });
    expect(options.accountId).toBe("account-test");
  });

  it("uses server-owned options for an authorized vectorize request", async () => {
    const response = await vectorizePost(request(vectorizeBody()));

    expect(response.status).toBe(200);
    const options = runtimeMock.execute.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(options).toMatchObject({
      profile: "quality",
      provider: "replicate",
      modelAlias: "recraft-vectorize",
      cloudConsent: true,
      allowFallback: false,
      maxCostUsd: 0.25,
      accountId: "account-test",
    });
  });
});
