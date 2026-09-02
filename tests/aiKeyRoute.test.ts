import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/ai/key/route";
import {
  AI_SESSION_COOKIE,
  resetAiCredentialSessionsForTests,
} from "@/lib/server/ai/userCredentials";

const TOKEN = `r8_${"b".repeat(37)}`;

afterEach(() => {
  resetAiCredentialSessionsForTests();
  vi.unstubAllGlobals();
});

describe("/api/ai/key", () => {
  it("rejects an invalid token without calling Replicate", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ provider: "replicate", apiKey: "invalid" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "Invalid Replicate API Key format." });
  });

  it("verifies and stores a valid token in a session cookie without returning it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ provider: "replicate", apiKey: TOKEN }));
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.credential).toMatchObject({
      provider: "replicate",
      configured: true,
      keyHint: "r8_••••bbbb",
      storage: "session-memory",
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(setCookie).toContain(`${AI_SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");

    const sessionId = setCookie.match(new RegExp(`${AI_SESSION_COOKIE}=([^;]+)`))?.[1];
    const status = await GET(request(undefined, sessionId));
    expect(await status.json()).toMatchObject({
      credential: { configured: true, keyHint: "r8_••••bbbb" },
    });
  });

  it("does not expose a stored key after DELETE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const response = await POST(request({ provider: "replicate", apiKey: TOKEN }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    const sessionId = setCookie.match(new RegExp(`${AI_SESSION_COOKIE}=([^;]+)`))?.[1];

    const deleted = await DELETE(request(undefined, sessionId));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      credential: { configured: false, keyHint: null },
    });
    expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

function request(body?: unknown, sessionId?: string): NextRequest {
  const serialized = body === undefined ? "" : JSON.stringify(body);
  return {
    headers: new Headers({
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(serialized).byteLength),
    }),
    cookies: {
      get: (name: string) =>
        name === AI_SESSION_COOKIE && sessionId ? { name, value: sessionId } : undefined,
    },
    arrayBuffer: async () => new TextEncoder().encode(serialized).buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}
