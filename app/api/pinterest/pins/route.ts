import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { fetchPinterestPins } from "@/lib/server/pinterest/client";
import { withPinterestSession } from "@/lib/server/pinterest/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withPinterestSession(req, "Could not load Pins from Pinterest.", async (session) => {
    const pins = await fetchPinterestPins(session.accessToken, req.signal);
    return jsonNoStore({ pins, connected: true });
  });
}
