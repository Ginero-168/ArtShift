import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { type GoogleProfile, getServerKeyMaterial } from "./accountStore";

export const GOOGLE_STATE_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-artshift_google_state" : "artshift_google_state";
export const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

const GOOGLE_STATE_AAD = Buffer.from("artshift-google-oauth-state-v1", "utf8");
type CookieResponse = Pick<NextResponse, "cookies">;
type GoogleState = { state: string; verifier: string; exp: number };

export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  redirectUri: string;
};

export function getGoogleAuthConfig(): GoogleAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const publicUrl = getPublicAppUrl();
  if (!clientId || !clientSecret || !publicUrl) return null;
  return {
    clientId,
    clientSecret,
    publicUrl,
    redirectUri: `${publicUrl}/api/auth/google/callback`,
  };
}

export function getPublicAppUrl(): string | null {
  const configured = process.env.ARTSHIFT_PUBLIC_URL;
  const value =
    configured || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function createGoogleAuthorizationUrl(config: GoogleAuthConfig): {
  url: string;
  state: string;
  verifier: string;
} {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
    verifier,
  };
}

export function setGoogleStateCookie(
  response: CookieResponse,
  state: string,
  verifier: string,
): void {
  const exp = Math.floor(Date.now() / 1_000) + GOOGLE_STATE_TTL_SECONDS;
  const value = encryptState({ state, verifier, exp });
  response.cookies.set({
    name: GOOGLE_STATE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GOOGLE_STATE_TTL_SECONDS,
  });
}

export function consumeGoogleState(
  request: NextRequest,
  response: CookieResponse,
  expectedState: string,
): string | null {
  clearGoogleStateCookie(response);
  const value = request.cookies?.get(GOOGLE_STATE_COOKIE)?.value;
  if (!value || value.length > 2_000) return null;
  const claims = decryptState(value);
  if (!claims || claims.state !== expectedState || claims.exp <= Math.floor(Date.now() / 1_000)) {
    return null;
  }
  return claims.verifier;
}

export function clearGoogleStateCookie(response: CookieResponse): void {
  response.cookies.set({
    name: GOOGLE_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function exchangeGoogleCode(
  config: GoogleAuthConfig,
  code: string,
  verifier: string,
  signal?: AbortSignal,
): Promise<GoogleProfile> {
  if (!code || code.length > 4_096 || !verifier || verifier.length > 256) {
    throw new Error("Invalid Google authorization response.");
  }
  const timeoutSignal = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    throw new Error("Google sign-in is temporarily unavailable.");
  }
  if (!tokenResponse.ok) throw new Error("Google rejected the authorization code.");
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as unknown;
  if (!isRecord(tokenPayload) || typeof tokenPayload.access_token !== "string") {
    throw new Error("Google returned an invalid authorization response.");
  }

  let userInfoResponse: Response;
  try {
    userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    throw new Error("Google profile lookup is temporarily unavailable.");
  }
  if (!userInfoResponse.ok) throw new Error("Unable to verify the Google account.");
  const profile = (await userInfoResponse.json().catch(() => null)) as unknown;
  if (!isRecord(profile) || profile.email_verified !== true) {
    throw new Error("Google account email is not verified.");
  }
  if (
    typeof profile.sub !== "string" ||
    typeof profile.email !== "string" ||
    profile.sub.length < 2 ||
    profile.sub.length > 255
  ) {
    throw new Error("Google returned an invalid account identity.");
  }
  return {
    sub: profile.sub,
    email: profile.email,
    emailVerified: true,
    ...(typeof profile.name === "string" ? { name: profile.name } : {}),
    ...(typeof profile.picture === "string" ? { picture: profile.picture } : {}),
  };
}

function encryptState(state: GoogleState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
    iv,
  );
  cipher.setAAD(GOOGLE_STATE_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return ["v1", encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

function decryptState(value: string): GoogleState | null {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
      decode(encodedIv),
    );
    decipher.setAAD(GOOGLE_STATE_AAD);
    decipher.setAuthTag(decode(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isState(value: unknown): value is GoogleState {
  if (!isRecord(value)) return false;
  return (
    typeof value.state === "string" &&
    value.state.length >= 32 &&
    typeof value.verifier === "string" &&
    value.verifier.length >= 32 &&
    typeof value.exp === "number" &&
    Number.isFinite(value.exp)
  );
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
