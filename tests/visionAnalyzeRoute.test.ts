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

import { POST } from "../app/api/ai/vision-analyze/route";

const IMAGE = "data:image/png;base64,AAAA";

function request(body: unknown, contentLength?: number): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(contentLength ?? bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("AI vision-analyze API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    tokenMock.value = "r8_account-token";
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: JSON.stringify({
          caption: "a poster",
          objects: ["logo"],
          visibleText: "SALE",
        }),
      },
      metadata: { provider: "replicate", model: "mock", durationMs: 12, usage: {}, warnings: [] },
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

  it("rejects forged consent when the flag is not exactly true", async () => {
    const response = await POST(request({ image: IMAGE, cloudConsent: "true" }));
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

  it("executes vision.describe with account BYOK, real consent, and no provider fallback", async () => {
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
