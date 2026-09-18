import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => ({ value: "r8_account-token" as string | undefined }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getAccountReplicateToken: () => tokenMock.value,
  getSessionReplicateToken: () => process.env.REPLICATE_API_TOKEN,
}));

import { POST } from "../app/api/ai/convert-to-brief/route";

const IMAGE = "data:image/png;base64,AAAA";
const USABLE_LAYOUT = {
  aspectRatio: { width: 1000, height: 700 },
  backgroundPartitions: [{ name: "bg", box: [0, 0, 1000, 1000], color: "#e2e8f0" }],
  dividers: [],
  focalObjects: [],
  texts: [],
};

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Convert to Brief API auth/consent", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    tokenMock.value = "r8_account-token";
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: JSON.stringify(USABLE_LAYOUT) },
      metadata: { provider: "replicate", model: "mock", durationMs: 9, usage: {}, warnings: [] },
    });
    process.env.REPLICATE_API_TOKEN = "r8_env_must_not_be_used";
  });

  it("rejects unauthenticated requests before provider execution", async () => {
    accountMock.value = null;
    const response = await POST(request({ image: IMAGE, cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects missing cloud consent", async () => {
    const response = await POST(request({ image: IMAGE }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("does not fall back to REPLICATE_API_TOKEN when the account has no BYOK key", async () => {
    tokenMock.value = undefined;
    const response = await POST(request({ image: IMAGE, cloudConsent: true }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_AUTH" });
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("runs vision with account BYOK and allowFallback false after consent", async () => {
    const response = await POST(request({ image: IMAGE, cloudConsent: true }));
    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "vision.describe",
      expect.objectContaining({ image: { dataUrl: IMAGE } }),
      expect.objectContaining({
        cloudConsent: true,
        allowFallback: false,
        accountId: "account-test",
      }),
    );
  });
});
