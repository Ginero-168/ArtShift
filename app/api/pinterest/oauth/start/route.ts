import { type NextRequest, NextResponse } from "next/server";
import { PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";
import { jsonNoStore } from "@/lib/server/http";
import {
  createPinterestAuthorizationUrl,
  getPinterestAuthConfig,
  pinterestSetupMessage,
  safePinterestReturnTo,
  setPinterestStateCookie,
} from "@/lib/server/pinterest/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getPinterestAuthConfig();
  if (!config) {
    return jsonNoStore(
      {
        error: pinterestSetupMessage(),
        oauthConfigured: false,
        officialSavedPins: PINTEREST_API_STATUS.officialSavedPins,
      },
      { status: 503 },
    );
  }

  const flow = createPinterestAuthorizationUrl(
    config,
    safePinterestReturnTo(req.nextUrl.searchParams.get("returnTo")),
  );
  const response = NextResponse.redirect(flow.url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  setPinterestStateCookie(response, flow.state, flow.returnTo);
  return response;
}
