import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  PINTEREST_AUTHORIZE_ENDPOINT,
  PINTEREST_OAUTH_SCOPES,
  PINTEREST_TOKEN_ENDPOINT,
} from "@/lib/moodboard/pinterest";
import { getServerKeyMaterial } from "@/lib/server/auth/accountStore";
import { getPublicAppUrl } from "@/lib/server/auth/google";

export const PINTEREST_STATE_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-artshift_pinterest_state"
    : "artshift_pinterest_state";
export const PINTEREST_STATE_TTL_SECONDS = 10 * 60;

const STATE_AAD = Buffer.from("artshift-pinterest-oauth-state-v1", "utf8");
type CookieResponse = Pick<NextResponse, "cookies">;
type PinterestState = { state: string; returnTo: string; exp: number };

export type PinterestAuthConfig = {
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  redirectUri: string;
  appName: string;
};

export type PinterestTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

export function getPinterestAuthConfig(): PinterestAuthConfig | null {
  const clientId = process.env.PINTEREST_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET?.trim() || "";
  const publicUrl = getPublicAppUrl();
  if (!clientId || !clientSecret || !publicUrl) return null;
  return {
    clientId,
    clientSecret,
    publicUrl,
    redirectUri: `${publicUrl}/api/pinterest/oauth/callback`,
    appName: process.env.PINTEREST_APP_NAME?.trim() || "ArtShift",
  };
}

export function pinterestSetupMessage(): string {
  const publicUrl = getPublicAppUrl() ?? "{publicUrl}";
  const appName = process.env.PINTEREST_APP_NAME?.trim() || "ArtShift";
  return `Set PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, and ARTSHIFT_PUBLIC_URL. Register the redirect URI ${publicUrl}/api/pinterest/oauth/callback on the Pinterest app (display name ${appName}).`;
}

export function pinterestReturnUrl(publicUrl: string, returnTo: string, flag: string): string {
  const url = new URL(safePinterestReturnTo(returnTo), publicUrl);
  url.searchParams.set("pinterest", flag);
  return url.toString();
}

export function safePinterestReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/projects";
  if (!value.startsWith("/projects")) return "/projects";
  if (value.length > 400) return "/projects";
  return value;
}

export function createPinterestAuthorizationUrl(
  config: PinterestAuthConfig,
  returnTo: string,
): { url: string; state: string; returnTo: string } {
  const state = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: PINTEREST_OAUTH_SCOPES.join(","),
    state,
  });
  return {
    url: `${PINTEREST_AUTHORIZE_ENDPOINT}?${params.toString()}`,
    state,
    returnTo: safePinterestReturnTo(returnTo),
  };
}

export function setPinterestStateCookie(
  response: CookieResponse,
  state: string,
  returnTo: string,
): void {
  const exp = Math.floor(Date.now() / 1_000) + PINTEREST_STATE_TTL_SECONDS;
  const value = encryptState({ state, returnTo: safePinterestReturnTo(returnTo), exp });
  response.cookies.set({
    name: PINTEREST_STATE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PINTEREST_STATE_TTL_SECONDS,
  });
}

export function consumePinterestState(
  request: NextRequest,
  response: CookieResponse,
  expectedState: string,
): string | null {
  clearPinterestStateCookie(response);
  const value = request.cookies?.get(PINTEREST_STATE_COOKIE)?.value;
  if (!value || value.length > 2_000) return null;
  const claims = decryptState(value);
  if (!claims || claims.state !== expectedState || claims.exp <= Math.floor(Date.now() / 1_000)) {
    return null;
  }
  return claims.returnTo;
}

export function clearPinterestStateCookie(response: CookieResponse): void {
  response.cookies.set({
    name: PINTEREST_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function exchangePinterestCode(
  config: PinterestAuthConfig,
  code: string,
  signal?: AbortSignal,
): Promise<PinterestTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const response = await fetch(PINTEREST_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      typeof payload.message === "string" ? payload.message : "Pinterest token exchange failed.",
    );
  }
  return tokensFromPayload(payload);
}

export async function refreshPinterestToken(
  config: PinterestAuthConfig,
  refreshToken: string,
  signal?: AbortSignal,
): Promise<PinterestTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(PINTEREST_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error("Pinterest token refresh failed.");
  }
  return tokensFromPayload(payload, refreshToken);
}

function tokensFromPayload(
  payload: Record<string, unknown>,
  fallbackRefresh?: string,
): PinterestTokenSet {
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 2_592_000;
  return {
    accessToken: String(payload.access_token),
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : fallbackRefresh,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1_000,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
  };
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function encryptState(state: PinterestState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
    iv,
  );
  cipher.setAAD(STATE_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return ["v1", encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

function decryptState(value: string): PinterestState | null {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (!version || version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
      decode(encodedIv),
    );
    decipher.setAAD(STATE_AAD);
    decipher.setAuthTag(decode(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as PinterestState;
    if (typeof parsed.state !== "string" || typeof parsed.returnTo !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
