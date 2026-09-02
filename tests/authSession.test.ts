import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, upsertGoogleAccount } from "@/lib/server/auth/accountStore";
import {
  AUTH_SESSION_COOKIE,
  clearAuthCookie,
  getAuthenticatedAccount,
  setAuthCookie,
} from "@/lib/server/auth/session";

let storeDir = "";

describe("Google account auth session", () => {
  beforeAll(() => {
    storeDir = mkdtempSync(join(tmpdir(), "artshift-google-auth-session-test-"));
    process.env.ARTSHIFT_ACCOUNT_STORE_PATH = join(storeDir, "store.json");
  });

  afterAll(() => {
    resetAccountStoreForTests();
    delete process.env.ARTSHIFT_ACCOUNT_STORE_PATH;
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("round-trips a Google account through an encrypted cookie", () => {
    const account = upsertGoogleAccount({
      sub: "google-session-sub",
      email: "session@example.com",
      emailVerified: true,
      name: "Session User",
    });
    const set = vi.fn();
    setAuthCookie(fakeResponse(set), account.id);
    const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };

    expect(cookie.name).toBe(AUTH_SESSION_COOKIE);
    expect(cookie.value).not.toContain(account.email);
    expect(cookie.value.split(".")).toHaveLength(4);
    expect(getAuthenticatedAccount(fakeRequest(cookie.name, cookie.value))).toEqual(account);
  });

  it("rejects a tampered cookie", () => {
    expect(
      getAuthenticatedAccount(fakeRequest(AUTH_SESSION_COOKIE, "v1.invalid.invalid.invalid")),
    ).toBeNull();
  });

  it("clears the auth cookie with an expiry in the past", () => {
    const set = vi.fn();
    clearAuthCookie(fakeResponse(set));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ name: AUTH_SESSION_COOKIE, value: "", maxAge: 0 }),
    );
  });
});

function fakeResponse(set: ReturnType<typeof vi.fn>): NextResponse {
  return { cookies: { set } } as unknown as NextResponse;
}

function fakeRequest(name: string, value: string): NextRequest {
  return {
    cookies: { get: (requested: string) => (requested === name ? { name, value } : undefined) },
  } as unknown as NextRequest;
}
