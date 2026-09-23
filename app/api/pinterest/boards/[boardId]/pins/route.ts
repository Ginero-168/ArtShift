import type { NextRequest } from "next/server";
import { isBoardId } from "@/lib/pinterest/api";
import { jsonNoStore } from "@/lib/server/http";
import { fetchPinterestPins } from "@/lib/server/pinterest/client";
import { withPinterestSession } from "@/lib/server/pinterest/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await context.params;
  if (!isBoardId(boardId)) {
    return jsonNoStore({ error: "Invalid board." }, { status: 400 });
  }
  return withPinterestSession(req, "Could not load board Pins from Pinterest.", async (session) => {
    const pins = await fetchPinterestPins(session.accessToken, req.signal, boardId);
    return jsonNoStore({ pins, boardId, connected: true });
  });
}
