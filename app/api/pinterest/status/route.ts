import { type NextRequest, NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { getPinterestAuthConfig, pinterestSetupMessage } from "@/lib/server/pinterest/oauth";
import { applyCookies, ensurePinterestAccess } from "@/lib/server/pinterest/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getPinterestAuthConfig();
  const bag = new NextResponse(null);
  const session = await ensurePinterestAccess(req, bag, req.signal);
  return applyCookies(
    bag,
    jsonNoStore({
      oauthConfigured: Boolean(config),
      connected: Boolean(session),
      username: session?.username ?? null,
      appName: config?.appName ?? (process.env.PINTEREST_APP_NAME?.trim() || "ArtShift"),
      redirectUri: config?.redirectUri ?? null,
      ...(config ? {} : { setup: pinterestSetupMessage() }),
    }),
  );
}
