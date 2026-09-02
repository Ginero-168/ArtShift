import type { NextRequest } from "next/server";
import { getAuthenticatedAccount } from "@/lib/server/auth/session";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getAuthenticatedAccount(req);
  return jsonNoStore({ authenticated: Boolean(user), user });
}
