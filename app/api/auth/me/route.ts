import type { NextRequest } from "next/server";
import { ensureAccountCredits, getCreditBalance } from "@/lib/credits/ledger";
import { touchAccount } from "@/lib/server/auth/accountStore";
import { getAuthenticatedAccount } from "@/lib/server/auth/session";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getAuthenticatedAccount(req);
  if (user) {
    touchAccount(user.id);
    ensureAccountCredits(user.id);
  }
  return jsonNoStore({
    authenticated: Boolean(user),
    user,
    credits: user ? { balance: getCreditBalance(user.id) } : null,
  });
}
