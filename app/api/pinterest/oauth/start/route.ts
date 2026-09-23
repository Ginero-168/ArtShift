import { type NextRequest, NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import {
  createPinterestAuthorizationUrl,
  getCanonicalPinterestStartRedirect,
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
    return jsonNoStore({ error: pinterestSetupMessage(), oauthConfigured: false }, { status: 503 });
  }

  const canonicalStart = getCanonicalPinterestStartRedirect(req);
  if (canonicalStart) {
    const target = new URL(canonicalStart);
    const returnTo = safePinterestReturnTo(req.nextUrl.searchParams.get("returnTo"));
    target.searchParams.set("returnTo", returnTo);
    return redirect(target.toString());
  }

  const flow = createPinterestAuthorizationUrl(
    config,
    safePinterestReturnTo(req.nextUrl.searchParams.get("returnTo")),
  );
  const response = redirect(flow.url);
  setPinterestStateCookie(response, flow.state, flow.returnTo);
  return response;
}

function redirect(url: string) {
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
