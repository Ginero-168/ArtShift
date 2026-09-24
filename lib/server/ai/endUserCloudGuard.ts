import { type NextRequest, NextResponse } from "next/server";
import type { CreditAction } from "@/lib/credits/pricing";
import { getAccountReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";
import type { AccountPublic } from "@/lib/server/auth/accountStore";
import { type CreditCharge, chargeCredits } from "@/lib/server/credits/gate";

export type EndUserCloudAiOk = {
  ok: true;
  account: AccountPublic;
  replicateToken: string;
  charge: CreditCharge | null;
};

export type EndUserCloudAiDenied = {
  ok: false;
  response: NextResponse;
};

/**
 * Auth + explicit consent + platform Replicate key for end-user AI routes.
 * Optional `action` reserves prepaid credits before the provider call.
 * User-pasted BYOK keys are not accepted for core AI.
 */
export function requireEndUserCloudAi(
  req: NextRequest,
  cloudConsent: unknown,
  action?: CreditAction,
  units = 1,
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
          error: "แพลตฟอร์มยังไม่ได้ตั้งค่า AI provider ติดต่อผู้ดูแลระบบ (REPLICATE_API_KEY)",
          code: "PROVIDER_AUTH",
        },
        { status: 503 },
      ),
    };
  }
  if (!action) return { ok: true, account, replicateToken, charge: null };
  const charge = chargeCredits(account.id, action, units);
  if (!charge.ok) return { ok: false, response: charge.response };
  return {
    ok: true,
    account,
    replicateToken,
    charge: { entryId: charge.entryId, credits: charge.credits, balance: charge.balance },
  };
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
