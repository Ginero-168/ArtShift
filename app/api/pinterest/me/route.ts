import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { fetchPinterestAccount } from "@/lib/server/pinterest/client";
import { withPinterestSession } from "@/lib/server/pinterest/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withPinterestSession(req, "Could not load the Pinterest account.", async (session) => {
    const account = await fetchPinterestAccount(session.accessToken, req.signal);
    return jsonNoStore({
      connected: true,
      username: account.username,
      profileImage: account.profileImage ?? null,
    });
  });
}
