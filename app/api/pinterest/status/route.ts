import type { NextRequest } from "next/server";
import { PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";
import { jsonNoStore } from "@/lib/server/http";
import { getPinterestAuthConfig, pinterestSetupMessage } from "@/lib/server/pinterest/oauth";
import { readPinterestSessionCookie } from "@/lib/server/pinterest/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getPinterestAuthConfig();
  const session = readPinterestSessionCookie(req);
  return jsonNoStore({
    oauthConfigured: Boolean(config),
    connected: Boolean(session),
    username: session?.username ?? null,
    appName: config?.appName ?? (process.env.PINTEREST_APP_NAME?.trim() || "ArtShift"),
    redirectUri: config?.redirectUri ?? null,
    officialSavedPins: PINTEREST_API_STATUS.officialSavedPins,
    userPaste: PINTEREST_API_STATUS.userPaste,
    scrape: PINTEREST_API_STATUS.scrape,
    setup: config ? undefined : pinterestSetupMessage(),
  });
}
