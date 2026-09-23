import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getServerKeyMaterial } from "@/lib/server/auth/accountStore";
import {
  getPinterestAuthConfig,
  type PinterestTokenSet,
  refreshPinterestToken,
} from "@/lib/server/pinterest/oauth";

export const PINTEREST_SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-artshift_pinterest_session"
    : "artshift_pinterest_session";
export const PINTEREST_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const SESSION_AAD = Buffer.from("artshift-pinterest-session-v1", "utf8");
const REFRESH_SKEW_MS = 60_000;
type CookieResponse = Pick<NextResponse, "cookies">;

export type PinterestSessionClaims = PinterestTokenSet & {
  username?: string;
};

export function setPinterestSessionCookie(
  response: CookieResponse,
  tokens: PinterestTokenSet,
  username?: string,
): void {
  const value = encryptSession({
    ...tokens,
    ...(username ? { username } : {}),
  });
  const remaining = Math.floor((tokens.expiresAt - Date.now()) / 1_000);
  const maxAge = Math.max(
    60,
    Math.min(PINTEREST_SESSION_TTL_SECONDS, remaining + (tokens.refreshToken ? 86_400 : 0)),
  );
  response.cookies.set({
    name: PINTEREST_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function readPinterestSessionCookie(request: NextRequest): PinterestSessionClaims | null {
  const value = request.cookies?.get(PINTEREST_SESSION_COOKIE)?.value;
  if (!value || value.length > 8_000) return null;
  return decryptSession(value);
}

export function clearPinterestSessionCookie(response: CookieResponse): void {
  response.cookies.set({
    name: PINTEREST_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function ensurePinterestAccess(
  request: NextRequest,
  response: CookieResponse,
  signal?: AbortSignal,
): Promise<PinterestSessionClaims | null> {
  const session = readPinterestSessionCookie(request);
  if (!session) return null;
  if (session.expiresAt > Date.now() + REFRESH_SKEW_MS) return session;

  const config = getPinterestAuthConfig();
  if (!config || !session.refreshToken) {
    if (session.expiresAt > Date.now()) return session;
    clearPinterestSessionCookie(response);
    return null;
  }

  try {
    const next = await refreshPinterestToken(config, session.refreshToken, signal);
    const claims: PinterestSessionClaims = {
      ...next,
      ...(session.username ? { username: session.username } : {}),
    };
    setPinterestSessionCookie(response, claims, session.username);
    return claims;
  } catch {
    if (session.expiresAt > Date.now()) return session;
    clearPinterestSessionCookie(response);
    return null;
  }
}

export function applyCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

function encryptSession(session: PinterestSessionClaims): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
    iv,
  );
  cipher.setAAD(SESSION_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return ["v1", encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

function decryptSession(value: string): PinterestSessionClaims | null {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
      decode(encodedIv),
    );
    decipher.setAAD(SESSION_AAD);
    decipher.setAuthTag(decode(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<PinterestSessionClaims>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.expiresAt !== "number") return null;
    return {
      accessToken: parsed.accessToken,
      ...(typeof parsed.refreshToken === "string" ? { refreshToken: parsed.refreshToken } : {}),
      expiresAt: parsed.expiresAt,
      ...(typeof parsed.scope === "string" ? { scope: parsed.scope } : {}),
      ...(typeof parsed.username === "string" ? { username: parsed.username } : {}),
    };
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
