import type { NextRequest } from "next/server";
import { outstandingCredits } from "@/lib/credits/ledger";
import { listAccounts } from "@/lib/server/auth/accountStore";
import { requireAdmin } from "@/lib/server/auth/admin";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) return admin.response;
  const users = listAccounts();
  return jsonNoStore({
    users: users.length,
    outstandingCredits: outstandingCredits(),
  });
}
