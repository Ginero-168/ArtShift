import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  getAccountReplicateToken,
  getCredentialStatus,
  getSessionReplicateToken,
  validateReplicateApiKey,
} from "@/lib/server/ai/userCredentials";
import { AUTH_SESSION_COOKIE } from "@/lib/server/auth/session";

const TOKEN = `r8_${"c".repeat(37)}`;

describe("user Replicate credentials", () => {
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
});

function request(): NextRequest {
  return {
    cookies: { get: (name: string) => (name === AUTH_SESSION_COOKIE ? undefined : undefined) },
  } as unknown as NextRequest;
}
