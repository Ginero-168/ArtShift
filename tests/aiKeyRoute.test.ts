import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/ai/key/route";
import { resetAccountStoreForTests, upsertGoogleAccount } from "@/lib/server/auth/accountStore";
import { AUTH_SESSION_COOKIE, setAuthCookie } from "@/lib/server/auth/session";

const TOKEN = `r8_${"b".repeat(37)}`;
let storeDir = "";
let authCookie = "";

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), "artshift-google-key-route-test-"));
  process.env.ARTSHIFT_ACCOUNT_STORE_PATH = join(storeDir, "store.json");
  const account = upsertGoogleAccount({
    sub: "google-key-route-sub",
    email: "key-route@example.com",
    emailVerified: true,
  });
  const set = vi.fn();
  setAuthCookie(fakeResponse(set), account.id);
  authCookie = (set.mock.calls[0][0] as { value: string }).value;
});

afterAll(() => {
  resetAccountStoreForTests();
  delete process.env.ARTSHIFT_ACCOUNT_STORE_PATH;
  vi.unstubAllGlobals();
  rmSync(storeDir, { recursive: true, force: true });
});

describe("/api/ai/key", () => {
  it("requires a Google-authenticated account before accepting a key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ provider: "replicate", apiKey: TOKEN }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sign in to save your Replicate API Key securely.",
      code: "AUTH_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies and persists a valid key for the authenticated account without returning it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const response = await POST(request({ provider: "replicate", apiKey: TOKEN }, authCookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.credential).toMatchObject({
      authenticated: true,
      provider: "replicate",
      configured: true,
      keyHint: "r8_••••bbbb",
      storage: "encrypted-account",
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(response.headers.get("set-cookie")).toBeNull();

    const status = await GET(request(undefined, authCookie));
    expect(await status.json()).toMatchObject({
      credential: { authenticated: true, configured: true, keyHint: "r8_••••bbbb" },
    });
  });

  it("deletes the persisted key while keeping the authenticated account", async () => {
    const deleted = await DELETE(request(undefined, authCookie));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      credential: {
        authenticated: true,
        configured: false,
        keyHint: null,
        storage: "encrypted-account",
      },
    });
  });
});

function fakeResponse(set: ReturnType<typeof vi.fn>): NextResponse {
  return { cookies: { set } } as unknown as NextResponse;
}

function request(body?: unknown, cookieValue?: string): NextRequest {
  const serialized = body === undefined ? "" : JSON.stringify(body);
  return {
    headers: new Headers({
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(serialized).byteLength),
    }),
    cookies: {
      get: (name: string) =>
        name === AUTH_SESSION_COOKIE && cookieValue ? { name, value: cookieValue } : undefined,
    },
    arrayBuffer: async () => new TextEncoder().encode(serialized).buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}
