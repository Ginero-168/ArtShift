import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { type AccountPublic, getAccountById, getServerKeyMaterial } from "./accountStore";

export const AUTH_SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-artshift_auth" : "artshift_auth";
export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const AUTH_AAD = Buffer.from("artshift-auth-session-v1", "utf8");
type AuthSessionResponse = Pick<NextResponse, "cookies">;
type AuthClaims = { sub: string; iat: number; exp: number; nonce: string };

export function getAuthenticatedAccount(request: NextRequest): AccountPublic | null {
  const value = request.cookies?.get(AUTH_SESSION_COOKIE)?.value;
  if (!value || value.length > 2_000) return null;
  const claims = decryptClaims(value);
  if (!claims || claims.exp <= Math.floor(Date.now() / 1_000)) return null;
  try {
    return getAccountById(claims.sub);
  } catch {
    return null;
  }
}

export function setAuthCookie(response: AuthSessionResponse, accountId: string): void {
  const now = Math.floor(Date.now() / 1_000);
  const value = encryptClaims({
    sub: accountId,
    iat: now,
    exp: now + AUTH_SESSION_TTL_SECONDS,
    nonce: randomUUID(),
  });
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookie(response: AuthSessionResponse): void {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

function encryptClaims(claims: AuthClaims): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
    iv,
  );
  cipher.setAAD(AUTH_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  return ["v1", encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

function decryptClaims(value: string): AuthClaims | null {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (!version || version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getServerKeyMaterial("ARTSHIFT_AUTH_SESSION_KEY"),
      decode(encodedIv),
    );
    decipher.setAAD(AUTH_AAD);
    decipher.setAuthTag(decode(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decode(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");
    const claims = JSON.parse(plaintext) as unknown;
    return isClaims(claims) ? claims : null;
  } catch {
    return null;
  }
}

function isClaims(value: unknown): value is AuthClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.iat === "number" &&
    Number.isFinite(claims.iat) &&
    typeof claims.exp === "number" &&
    Number.isFinite(claims.exp) &&
    typeof claims.nonce === "string" &&
    claims.nonce.length > 0
  );
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
