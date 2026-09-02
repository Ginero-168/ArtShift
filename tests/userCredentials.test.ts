import type { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_SESSION_COOKIE,
  clearAiSessionCookie,
  clearSessionReplicateToken,
  getCredentialStatus,
  getSessionReplicateToken,
  maskReplicateApiKey,
  resetAiCredentialSessionsForTests,
  saveSessionReplicateToken,
  validateReplicateApiKey,
  verifyReplicateApiKey,
} from "@/lib/server/ai/userCredentials";

const TOKEN = `r8_${"a".repeat(37)}`;

afterEach(() => {
  resetAiCredentialSessionsForTests();
  vi.unstubAllGlobals();
});

describe("user Replicate credential session", () => {
  it("accepts a valid token without normalizing it", () => {
    expect(validateReplicateApiKey(TOKEN)).toEqual({ ok: true, value: TOKEN });
    expect(maskReplicateApiKey(TOKEN)).toBe("r8_••••aaaa");
  });

  it("rejects malformed keys and whitespace", () => {
    expect(validateReplicateApiKey("not-a-token").ok).toBe(false);
    expect(validateReplicateApiKey(`${TOKEN}\n`).ok).toBe(false);
    expect(validateReplicateApiKey(undefined).ok).toBe(false);
  });

  it("stores the raw token only in server memory and exposes only a hint", () => {
    const request = fakeRequest();
    const response = fakeResponse();

    saveSessionReplicateToken(request, response, TOKEN);
    const cookie = response.cookies.set.mock.calls[0]?.[0];
    expect(cookie?.name).toBe(AI_SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.value).not.toBe(TOKEN);

    const sessionRequest = fakeRequest(cookie?.value);
    expect(getSessionReplicateToken(sessionRequest)).toBe(TOKEN);
    expect(getCredentialStatus(sessionRequest)).toMatchObject({
      provider: "replicate",
      configured: true,
      keyHint: "r8_••••aaaa",
      storage: "session-memory",
    });
    expect(JSON.stringify(getCredentialStatus(sessionRequest))).not.toContain(TOKEN);
  });

  it("clears a session credential and cookie", () => {
    const request = fakeRequest();
    const response = fakeResponse();
    saveSessionReplicateToken(request, response, TOKEN);
    const sessionId = response.cookies.set.mock.calls[0]?.[0]?.value;
    const sessionRequest = fakeRequest(sessionId);

    expect(clearSessionReplicateToken(sessionRequest)).toBe(true);
    expect(getSessionReplicateToken(sessionRequest)).toBeUndefined();
    clearAiSessionCookie(response);
    expect(response.cookies.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: AI_SESSION_COOKIE, maxAge: 0 }),
    );
  });

  it("verifies the token without returning provider response data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyReplicateApiKey(TOKEN)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/models/openai/gpt-oss-20b",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });
});

function fakeRequest(sessionId?: string): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name === AI_SESSION_COOKIE && sessionId ? { name, value: sessionId } : undefined,
    },
  } as unknown as NextRequest;
}

function fakeResponse(): NextResponse & { cookies: { set: ReturnType<typeof vi.fn> } } {
  return { cookies: { set: vi.fn() } } as unknown as NextResponse & {
    cookies: { set: ReturnType<typeof vi.fn> };
  };
}
