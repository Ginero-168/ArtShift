import type { NextRequest } from "next/server";
import {
  type AccountPublic,
  deleteReplicateApiKey,
  getReplicateCredentialStatus,
  readReplicateApiKey,
  saveReplicateApiKey,
} from "@/lib/server/auth/accountStore";
import { getAuthenticatedAccount } from "@/lib/server/auth/session";

export type CredentialStatus = {
  authenticated: boolean;
  provider: "replicate";
  configured: boolean;
  keyHint: string | null;
  storage: "encrypted-account";
  updatedAt: number | null;
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

export function getUserAccount(request: NextRequest): AccountPublic | null {
  return getAuthenticatedAccount(request);
}

export function getSessionReplicateToken(request: NextRequest): string | undefined {
  const account = getAuthenticatedAccount(request);
  if (!account) return undefined;
  try {
    return readReplicateApiKey(account.id);
  } catch {
    return undefined;
  }
}

export function getCredentialStatus(request: NextRequest): CredentialStatus {
  const account = getAuthenticatedAccount(request);
  if (!account) return emptyStatus(false);
  try {
    return {
      authenticated: true,
      provider: "replicate",
      ...getReplicateCredentialStatus(account.id),
    };
  } catch {
    return emptyStatus(true);
  }
}

export function saveSessionReplicateToken(request: NextRequest, token: string): void {
  const account = getAuthenticatedAccount(request);
  if (!account) throw new Error("AUTH_REQUIRED");
  saveReplicateApiKey(account.id, token);
}

export function clearSessionReplicateToken(request: NextRequest): boolean {
  const account = getAuthenticatedAccount(request);
  return account ? deleteReplicateApiKey(account.id) : false;
}

export async function verifyReplicateApiKey(
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; status: 401 | 502; reason: string }> {
  const timeoutSignal = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch("https://api.replicate.com/v1/models/openai/gpt-image-2", {
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

function emptyStatus(authenticated: boolean): CredentialStatus {
  return {
    authenticated,
    provider: "replicate",
    configured: false,
    keyHint: null,
    storage: "encrypted-account",
    updatedAt: null,
  };
}
