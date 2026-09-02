import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const AI_SESSION_COOKIE = "artshift_ai_session";
export const AI_SESSION_TTL_MS = 60 * 60 * 1000;

const sessions = new Map<string, SessionRecord>();
const MAX_ACTIVE_SESSIONS = 1_000;

type SessionRecord = {
  replicateToken: string;
  keyHint: string;
  createdAt: number;
  expiresAt: number;
};

type AiSessionCookieResponse = Pick<NextResponse, "cookies">;

export type CredentialStatus = {
  provider: "replicate";
  configured: boolean;
  keyHint: string | null;
  storage: "session-memory";
  expiresAt: number | null;
};

export function validateReplicateApiKey(
  value: unknown,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "Replicate API Key is required." };
  if (!/^r8_[A-Za-z0-9_-]{20,200}$/.test(value)) {
    return { ok: false, reason: "Invalid Replicate API Key format." };
  }
  return { ok: true, value };
}

export function maskReplicateApiKey(token: string): string {
  return `${token.slice(0, 3)}••••${token.slice(-4)}`;
}

export function getAiSessionId(request: NextRequest): string | null {
  const value = request.cookies?.get(AI_SESSION_COOKIE)?.value;
  return isSessionId(value) ? value : null;
}

export function getSessionReplicateToken(request: NextRequest): string | undefined {
  const sessionId = getAiSessionId(request);
  if (!sessionId) return undefined;
  const record = sessions.get(sessionId);
  if (!record) return undefined;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  return record.replicateToken;
}

export function getCredentialStatus(request: NextRequest): CredentialStatus {
  const sessionId = getAiSessionId(request);
  if (!sessionId) return emptyStatus();
  const record = sessions.get(sessionId);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) sessions.delete(sessionId);
    return emptyStatus();
  }
  return {
    provider: "replicate",
    configured: true,
    keyHint: record.keyHint,
    storage: "session-memory",
    expiresAt: record.expiresAt,
  };
}

export function saveSessionReplicateToken(
  request: NextRequest,
  response: AiSessionCookieResponse,
  token: string,
): void {
  pruneExpiredSessions();
  const existing = getAiSessionId(request);
  const sessionId = existing ?? randomUUID();
  if (!existing && sessions.size >= MAX_ACTIVE_SESSIONS) evictOldestSession();
  const now = Date.now();
  sessions.set(sessionId, {
    replicateToken: token,
    keyHint: maskReplicateApiKey(token),
    createdAt: now,
    expiresAt: now + AI_SESSION_TTL_MS,
  });
  if (!existing) setSessionCookie(response, sessionId);
}

export function clearSessionReplicateToken(request: NextRequest): boolean {
  const sessionId = getAiSessionId(request);
  return sessionId ? sessions.delete(sessionId) : false;
}

export function clearAiSessionCookie(response: AiSessionCookieResponse): void {
  response.cookies.set({
    name: AI_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function verifyReplicateApiKey(
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; status: 401 | 502; reason: string }> {
  const timeoutSignal = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch("https://api.replicate.com/v1/models/openai/gpt-oss-20b", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, reason: "Replicate is temporarily unavailable." };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, reason: "Replicate rejected this API Key." };
  }
  return { ok: false, status: 502, reason: "Replicate could not verify this API Key right now." };
}

export function resetAiCredentialSessionsForTests(): void {
  sessions.clear();
}

function setSessionCookie(response: AiSessionCookieResponse, sessionId: string): void {
  response.cookies.set({
    name: AI_SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

function emptyStatus(): CredentialStatus {
  return {
    provider: "replicate",
    configured: false,
    keyHint: null,
    storage: "session-memory",
    expiresAt: null,
  };
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(id);
  }
}

function evictOldestSession(): void {
  let oldestId: string | undefined;
  let oldestCreatedAt = Number.POSITIVE_INFINITY;
  for (const [id, record] of sessions) {
    if (record.createdAt < oldestCreatedAt) {
      oldestId = id;
      oldestCreatedAt = record.createdAt;
    }
  }
  if (oldestId) sessions.delete(oldestId);
}

function isSessionId(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}
