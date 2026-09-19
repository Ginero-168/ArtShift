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

export async function GET(req: NextRequest) {
  const bag = new NextResponse(null);
  const session = await ensurePinterestAccess(req, bag, req.signal);
  if (!session) {
    return jsonNoStore({ error: "Not connected to Pinterest.", connected: false }, { status: 401 });
  }

  try {
    const pins = await fetchPinterestPins(session.accessToken, req.signal);
    return applyCookies(bag, jsonNoStore({ pins, connected: true }));
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
      jsonNoStore({ error: "Could not load Pins from Pinterest." }, { status: 502 }),
    );
  }
}
