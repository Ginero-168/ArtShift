import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getAccountReplicateToken,
  getCredentialStatus,
  getOpsEnvOpenAiToken,
  getOpsEnvReplicateToken,
  getSessionOpenAiToken,
  getSessionReplicateToken,
  validateReplicateApiKey,
} from "@/lib/server/ai/userCredentials";
import { resetAccountStoreForTests, upsertGoogleAccount } from "@/lib/server/auth/accountStore";
import { setAuthCookie } from "@/lib/server/auth/session";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextResponse } from "next/server";

const TOKEN = `r8_${"c".repeat(37)}`;
let storeDir = "";

describe("user Replicate credentials", () => {
  beforeAll(() => {
    storeDir = mkdtempSync(join(tmpdir(), "artshift-byok-cred-"));
    process.env.ARTSHIFT_ACCOUNT_STORE_PATH = join(storeDir, "store.json");
  });

  afterAll(() => {
    resetAccountStoreForTests();
    delete process.env.ARTSHIFT_ACCOUNT_STORE_PATH;
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("validates the Replicate token format without normalization", () => {
    expect(validateReplicateApiKey(TOKEN)).toEqual({ ok: true, value: TOKEN });
    expect(validateReplicateApiKey(` ${TOKEN}`)).toMatchObject({ ok: false });
    expect(validateReplicateApiKey("invalid")).toMatchObject({ ok: false });
  });

  it("reports an unauthenticated request without revealing credential state", () => {
    const status = getCredentialStatus(request());
    expect(status).toEqual({
      authenticated: false,
      provider: "replicate",
      configured: false,
      keyHint: null,
      storage: "encrypted-account",
      updatedAt: null,
    });
    expect(getSessionReplicateToken(request())).toBeUndefined();
  });

  it("does not treat REPLICATE_API_TOKEN as a per-account BYOK credential", () => {
    const previous = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = "r8_env_should_not_count_as_byok";
    try {
      expect(getAccountReplicateToken(request())).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.REPLICATE_API_TOKEN;
      else process.env.REPLICATE_API_TOKEN = previous;
    }
  });

  it("does not return deploy env tokens for a signed-in account without BYOK", () => {
    const previousReplicate = process.env.REPLICATE_API_TOKEN;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    process.env.REPLICATE_API_TOKEN = "r8_env_must_not_leak";
    process.env.OPENAI_API_KEY = "sk-env-must-not-leak";
    try {
      const account = upsertGoogleAccount({
        sub: "byok-no-key",
        email: "byok@example.com",
        emailVerified: true,
      });
      const set = vi.fn();
      setAuthCookie({ cookies: { set } } as unknown as NextResponse, account.id);
      const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };
      const authed = request(cookie.name, cookie.value);

      expect(getSessionReplicateToken(authed)).toBeUndefined();
      expect(getSessionOpenAiToken(authed)).toBeUndefined();
      expect(getAccountReplicateToken(authed)).toBeUndefined();
      expect(getOpsEnvReplicateToken()).toBe("r8_env_must_not_leak");
      expect(getOpsEnvOpenAiToken()).toBe("sk-env-must-not-leak");
    } finally {
      if (previousReplicate === undefined) delete process.env.REPLICATE_API_TOKEN;
      else process.env.REPLICATE_API_TOKEN = previousReplicate;
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
    }
  });
});

function request(cookieName?: string, cookieValue?: string): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        cookieName && name === cookieName ? { name, value: cookieValue } : undefined,
    },
  } as unknown as NextRequest;
}
