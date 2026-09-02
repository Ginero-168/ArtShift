import { type NextRequest, NextResponse } from "next/server";
import { upsertGoogleAccount } from "@/lib/server/auth/accountStore";
import {
  clearGoogleStateCookie,
  consumeGoogleState,
  exchangeGoogleCode,
  getGoogleAuthConfig,
  getPublicAppUrl,
} from "@/lib/server/auth/google";
import { setAuthCookie } from "@/lib/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const publicUrl = getPublicAppUrl() ?? new URL(req.url).origin;
  const config = getGoogleAuthConfig();
  const error = req.nextUrl.searchParams.get("error");
  if (error) return redirect(`${publicUrl}/?auth=google-cancelled`);
  if (!config) return redirect(`${publicUrl}/?auth=google-unavailable`);

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const stateResponse = redirect(`${publicUrl}/?auth=google-error`);
  const verifier = consumeGoogleState(req, stateResponse, state);
  if (!code || !state || !verifier) return stateResponse;

  try {
    const profile = await exchangeGoogleCode(config, code, verifier, req.signal);
    const user = upsertGoogleAccount(profile);
    const response = redirect(`${publicUrl}/?auth=success`);
    clearGoogleStateCookie(response);
    setAuthCookie(response, user.id);
    return response;
  } catch {
    return stateResponse;
  }
}

function redirect(url: string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
