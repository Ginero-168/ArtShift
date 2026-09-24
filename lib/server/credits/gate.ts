import { NextResponse } from "next/server";
import {
  refundSpend,
  type SpendDenied,
  type SpendSuccess,
  spendCredits,
} from "@/lib/credits/ledger";
import type { CreditAction } from "@/lib/credits/pricing";

export type CreditCharge = {
  entryId: string;
  credits: number;
  balance: number;
};

export function chargeCredits(
  accountId: string,
  action: CreditAction,
  units = 1,
): (SpendSuccess & { response?: undefined }) | (SpendDenied & { response: NextResponse }) {
  const result = spendCredits(accountId, action, units);
  if (result.ok) return result;
  return { ...result, response: insufficientCreditsResponse(result) };
}

export function insufficientCreditsResponse(denied: SpendDenied): NextResponse {
  return NextResponse.json(
    {
      error: denied.message,
      message: denied.message,
      code: denied.code,
      required: denied.required,
      balance: denied.balance,
    },
    { status: 402 },
  );
}

/** Nested shape for clients that read `error.code` / `error.message`. */
export function insufficientCreditsNestedResponse(denied: SpendDenied): NextResponse {
  return NextResponse.json(
    {
      error: { code: denied.code, message: denied.message },
      code: denied.code,
      message: denied.message,
      required: denied.required,
      balance: denied.balance,
    },
    { status: 402 },
  );
}

export function refundCharge(entryId: string | undefined, reason: string): void {
  if (!entryId) return;
  try {
    refundSpend(entryId, reason);
  } catch (error) {
    console.error("[credits] refund failed", error);
  }
}
