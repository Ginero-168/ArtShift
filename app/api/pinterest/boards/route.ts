import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { fetchPinterestBoards } from "@/lib/server/pinterest/client";
import { withPinterestSession } from "@/lib/server/pinterest/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withPinterestSession(req, "Could not load boards from Pinterest.", async (session) => {
    const boards = await fetchPinterestBoards(session.accessToken, req.signal);
    return jsonNoStore({ boards, connected: true });
  });
}
