import { type NextRequest, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/server/auth/google";
import { fetchPinterestAccount } from "@/lib/server/pinterest/client";
import {
  consumePinterestState,
  exchangePinterestCode,
  getPinterestAuthConfig,
  pinterestReturnUrl,
} from "@/lib/server/pinterest/oauth";
import { setPinterestSessionCookie } from "@/lib/server/pinterest/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const publicUrl = getPublicAppUrl() ?? new URL(req.url).origin;
  const config = getPinterestAuthConfig();
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) return redirect(pinterestReturnUrl(publicUrl, "/projects", "denied"));
  if (!config) return redirect(pinterestReturnUrl(publicUrl, "/projects", "setup"));

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const failed = redirect(pinterestReturnUrl(publicUrl, "/projects", "error"));
  const returnTo = consumePinterestState(req, failed, state);
  if (!code || !state || !returnTo) return failed;

  try {
    const tokens = await exchangePinterestCode(config, code, req.signal);
    let username: string | undefined;
    try {
      username = (await fetchPinterestAccount(tokens.accessToken, req.signal)).username;
    } catch {
      username = undefined;
    }
    const response = redirect(pinterestReturnUrl(publicUrl, returnTo, "connected"));
    setPinterestSessionCookie(response, tokens, username);
    return response;
  } catch (error) {
    console.error("[pinterest/oauth/callback] exchange failed", error);
    return failed;
  }
}

function redirect(url: string) {
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
