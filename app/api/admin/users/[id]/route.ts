import type { NextRequest } from "next/server";
import { getCreditBalance, listLedgerEntries } from "@/lib/credits/ledger";
import { getAccountById, listAccounts } from "@/lib/server/auth/accountStore";
import { requireAdmin } from "@/lib/server/auth/admin";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const account = getAccountById(id);
  if (!account) return jsonNoStore({ error: "Not found" }, { status: 404 });
  const directory = listAccounts().find((user) => user.id === id);
  return jsonNoStore({
    user: {
      ...account,
      lastSeenAt: directory?.updatedAt ?? account.createdAt,
      balance: getCreditBalance(account.id),
    },
    entries: listLedgerEntries(account.id, 80),
  });
}
