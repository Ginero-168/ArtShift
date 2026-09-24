import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
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

  it("does not expose the platform key on an anonymous request", () => {
    const previous = process.env.REPLICATE_API_KEY;
    process.env.REPLICATE_API_KEY = "r8_platform_key";
    try {
      expect(getAccountReplicateToken(request())).toBeUndefined();
      expect(getSessionReplicateToken(request())).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.REPLICATE_API_KEY;
      else process.env.REPLICATE_API_KEY = previous;
    }
  });

  it("uses platform env keys for a signed-in account and ignores stored BYOK", () => {
    const previousKey = process.env.REPLICATE_API_KEY;
    const previousToken = process.env.REPLICATE_API_TOKEN;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    process.env.REPLICATE_API_KEY = "r8_platform_key";
    process.env.REPLICATE_API_TOKEN = "r8_legacy_token";
    process.env.OPENAI_API_KEY = "sk-platform-openai";
    try {
      const account = upsertGoogleAccount({
        sub: "platform-key-user",
        email: "platform@example.com",
        emailVerified: true,
      });
      const set = vi.fn();
      setAuthCookie({ cookies: { set } } as unknown as NextResponse, account.id);
      const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };
      const authed = request(cookie.name, cookie.value);

      expect(getSessionReplicateToken(authed)).toBe("r8_platform_key");
      expect(getAccountReplicateToken(authed)).toBe("r8_platform_key");
      expect(getSessionOpenAiToken(authed)).toBe("sk-platform-openai");
      expect(getOpsEnvReplicateToken()).toBe("r8_platform_key");
      expect(getOpsEnvOpenAiToken()).toBe("sk-platform-openai");

      delete process.env.REPLICATE_API_KEY;
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.OPENAI_API_KEY;
      expect(getSessionReplicateToken(authed)).toBeUndefined();
      expect(getSessionOpenAiToken(authed)).toBeUndefined();
    } finally {
      if (previousKey === undefined) delete process.env.REPLICATE_API_KEY;
      else process.env.REPLICATE_API_KEY = previousKey;
      if (previousToken === undefined) delete process.env.REPLICATE_API_TOKEN;
      else process.env.REPLICATE_API_TOKEN = previousToken;
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
