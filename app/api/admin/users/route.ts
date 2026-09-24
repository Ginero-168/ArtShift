import type { NextRequest } from "next/server";
import { getCreditBalance } from "@/lib/credits/ledger";
import { listAccounts } from "@/lib/server/auth/accountStore";
import { requireAdmin } from "@/lib/server/auth/admin";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) return admin.response;
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const users = listAccounts()
    .filter((user) => {
      if (!query) return true;
      return user.email.includes(query) || (user.name ?? "").toLowerCase().includes(query);
    })
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: user.createdAt,
      lastSeenAt: user.updatedAt,
      balance: getCreditBalance(user.id),
    }));
  return jsonNoStore({ users });
}
