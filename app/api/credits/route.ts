import type { NextRequest } from "next/server";
import { getCreditBalance, listLedgerEntries } from "@/lib/credits/ledger";
import { CREDIT_THB, WELCOME_GRANT_CREDITS } from "@/lib/credits/pricing";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = getUserAccount(req);
  if (!account) {
    return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  }
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
  return jsonNoStore({
    balance: getCreditBalance(account.id),
    creditThb: CREDIT_THB,
    welcomeGrant: WELCOME_GRANT_CREDITS,
    entries: listLedgerEntries(account.id, limit),
  });
}
