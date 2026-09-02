import { type NextRequest, NextResponse } from "next/server";
import {
  createGoogleAuthorizationUrl,
  getGoogleAuthConfig,
  getPublicAppUrl,
  setGoogleStateCookie,
} from "@/lib/server/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = getGoogleAuthConfig();
  const publicUrl = getPublicAppUrl() ?? new URL(req.url).origin;
  if (!config) return redirect(`${publicUrl}/?auth=google-unavailable`);

  const flow = createGoogleAuthorizationUrl(config);
  const response = redirect(flow.url);
  setGoogleStateCookie(response, flow.state, flow.verifier);
  return response;
}

function redirect(url: string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
