import { type NextRequest, NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { PinterestApiError } from "@/lib/server/pinterest/client";
import {
  applyCookies,
  clearPinterestSessionCookie,
  ensurePinterestAccess,
  type PinterestSessionClaims,
} from "@/lib/server/pinterest/session";

export async function withPinterestSession(
  req: NextRequest,
  failureMessage: string,
  run: (session: PinterestSessionClaims) => Promise<NextResponse>,
): Promise<NextResponse> {
  const bag = new NextResponse(null);
  const session = await ensurePinterestAccess(req, bag, req.signal);
  if (!session) {
    return jsonNoStore({ error: "Not connected to Pinterest.", connected: false }, { status: 401 });
  }
  try {
    return applyCookies(bag, await run(session));
  } catch (error) {
    if (error instanceof PinterestApiError && error.status === 401) {
      const response = jsonNoStore(
        { error: "Pinterest session expired.", connected: false },
        { status: 401 },
      );
      clearPinterestSessionCookie(response);
      return response;
    }
    return applyCookies(bag, jsonNoStore({ error: failureMessage }, { status: 502 }));
  }
}
