import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as listUsers } from "@/app/api/admin/users/route";
import { resetAccountStoreForTests, upsertGoogleAccount } from "@/lib/server/auth/accountStore";
import { isAdminEmail, requireAdmin } from "@/lib/server/auth/admin";
import { setAuthCookie } from "@/lib/server/auth/session";

let storeDir = "";

describe("admin auth gate", () => {
  beforeAll(() => {
    storeDir = mkdtempSync(join(tmpdir(), "artshift-admin-auth-"));
    process.env.ARTSHIFT_ACCOUNT_STORE_PATH = join(storeDir, "store.json");
    process.env.ADMIN_EMAILS = "Owner@Example.com, other@example.com";
  });

  afterAll(() => {
    resetAccountStoreForTests();
    delete process.env.ARTSHIFT_ACCOUNT_STORE_PATH;
    delete process.env.ADMIN_EMAILS;
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("matches ADMIN_EMAILS case-insensitively and ignores blanks", () => {
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(true);
    expect(isAdminEmail("stranger@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it("returns 404 for anonymous and non-admin sessions", async () => {
    const anonymous = await listUsers(request());
    expect(anonymous.status).toBe(404);

    const member = upsertGoogleAccount({
      sub: "member-1",
      email: "member@example.com",
      emailVerified: true,
    });
    const denied = await listUsers(authedRequest(member.id));
    expect(denied.status).toBe(404);
    expect(requireAdmin(authedRequest(member.id)).ok).toBe(false);
  });

  it("lists users for an admin email", async () => {
    const admin = upsertGoogleAccount({
      sub: "admin-1",
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner",
    });
    const response = await listUsers(authedRequest(admin.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { users: Array<{ email: string }> };
    expect(body.users.some((user) => user.email === "owner@example.com")).toBe(true);
  });
});

function authedRequest(accountId: string): NextRequest {
  const set = vi.fn();
  setAuthCookie({ cookies: { set } } as unknown as NextResponse, accountId);
  const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };
  return request(cookie.name, cookie.value);
}

function request(cookieName?: string, cookieValue?: string): NextRequest {
  return {
    nextUrl: new URL("http://localhost/api/admin/users"),
    cookies: {
      get: (name: string) =>
        cookieName && name === cookieName ? { name, value: cookieValue } : undefined,
    },
  } as unknown as NextRequest;
}
