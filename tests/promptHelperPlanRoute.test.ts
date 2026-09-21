import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-plan" } as { id: string } | null }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: () => "r8_session_token",
}));

import { POST } from "../app/api/ai/prompt-helper/plan/route";

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    json: async () => body,
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Prompt Helper plan route", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-plan" };
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: '{"axes":[]}' },
      metadata: { provider: "mock", model: "mock", usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated planning", async () => {
    accountMock.value = null;
    const response = await POST(request({ prompt: "แมวส้ม", cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects planning without explicit cloud consent", async () => {
    const response = await POST(request({ prompt: "แมวส้ม" }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("passes cloudConsent into ai.execute after the route check", async () => {
    const response = await POST(request({ prompt: "แมวส้มบนโต๊ะไม้", cloudConsent: true }));
    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({ maxTokens: 3200 }),
      expect.objectContaining({
        cloudConsent: true,
        allowFallback: false,
        accountId: "account-plan",
      }),
    );
  });
});
