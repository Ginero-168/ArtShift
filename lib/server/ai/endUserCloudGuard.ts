import { type NextRequest, NextResponse } from "next/server";
import { getAccountReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";
import type { AccountPublic } from "@/lib/server/auth/accountStore";

export type EndUserCloudAiOk = {
  ok: true;
  account: AccountPublic;
  replicateToken: string;
};

export type EndUserCloudAiDenied = {
  ok: false;
  response: NextResponse;
};

/**
 * Auth + explicit consent + per-account Replicate BYOK for end-user AI routes.
 * Never falls back to a shared `REPLICATE_API_TOKEN`.
 */
export function requireEndUserCloudAi(
  req: NextRequest,
  cloudConsent: unknown,
): EndUserCloudAiOk | EndUserCloudAiDenied {
  const account = getUserAccount(req);
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Authentication is required for AI execution.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 },
      ),
    };
  }
  if (cloudConsent !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Explicit cloud consent is required before this AI operation.",
          code: "POLICY_DENIED",
        },
        { status: 403 },
      ),
    };
  }
  const replicateToken = getAccountReplicateToken(req);
  if (!replicateToken) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "AI provider is not configured for this session. Add your Replicate API key in AI Provider Settings.",
          code: "PROVIDER_AUTH",
        },
        { status: 503 },
      ),
    };
  }
  return { ok: true, account, replicateToken };
}

export function requireAuthenticatedAccount(
  req: NextRequest,
): EndUserCloudAiDenied | { ok: true; account: AccountPublic } {
  const account = getUserAccount(req);
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Authentication is required for AI execution.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 },
      ),
    };
  }
  return { ok: true, account };
}
