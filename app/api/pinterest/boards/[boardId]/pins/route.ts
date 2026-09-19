import { type NextRequest, NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { fetchPinterestPins, PinterestApiError } from "@/lib/server/pinterest/client";
import {
  applyCookies,
  clearPinterestSessionCookie,
  ensurePinterestAccess,
} from "@/lib/server/pinterest/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await context.params;
  if (!isBoardId(boardId)) {
    return jsonNoStore({ error: "Invalid board." }, { status: 400 });
  }

  const bag = new NextResponse(null);
  const session = await ensurePinterestAccess(req, bag, req.signal);
  if (!session) {
    return jsonNoStore({ error: "Not connected to Pinterest.", connected: false }, { status: 401 });
  }

  try {
    const pins = await fetchPinterestPins(session.accessToken, req.signal, boardId);
    return applyCookies(bag, jsonNoStore({ pins, boardId, connected: true }));
  } catch (error) {
    if (error instanceof PinterestApiError && error.status === 401) {
      const response = jsonNoStore(
        { error: "Pinterest session expired.", connected: false },
        { status: 401 },
      );
      clearPinterestSessionCookie(response);
      return response;
    }
    return applyCookies(
      bag,
      jsonNoStore({ error: "Could not load board Pins from Pinterest." }, { status: 502 }),
    );
  }
}

function isBoardId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
