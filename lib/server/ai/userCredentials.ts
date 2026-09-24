import type { NextRequest } from "next/server";
import {
  type AccountPublic,
  type AiCredentialProvider,
  deleteOpenAiApiKey,
  deleteReplicateApiKey,
  getOpenAiCredentialStatus,
  getReplicateCredentialStatus,
  type StoredCredentialStatus,
  saveOpenAiApiKey,
  saveReplicateApiKey,
} from "@/lib/server/auth/accountStore";
import { getAuthenticatedAccount } from "@/lib/server/auth/session";

export type CredentialStatus = {
  authenticated: boolean;
  provider: AiCredentialProvider;
  configured: boolean;
  keyHint: string | null;
  storage: "encrypted-account";
  updatedAt: number | null;
};

export type CredentialsPayload = {
  authenticated: boolean;
  replicate: CredentialStatus;
  openai: CredentialStatus;
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

export function validateOpenAiApiKey(
  value: unknown,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "OpenAI API Key is required." };
  const trimmed = value.trim();
  if (!/^sk-[A-Za-z0-9_-]{20,200}$/.test(trimmed)) {
    return { ok: false, reason: "Invalid OpenAI API Key format." };
  }
  return { ok: true, value: trimmed };
}

export function getUserAccount(request: NextRequest): AccountPublic | null {
  return getAuthenticatedAccount(request);
}

/**
 * Platform Replicate key. Core AI is billed to ArtShift, not to a user-pasted key.
 * `REPLICATE_API_KEY` is canonical. `REPLICATE_API_TOKEN` remains a legacy alias.
 */
export function getPlatformReplicateKey(): string | undefined {
  const primary = process.env.REPLICATE_API_KEY?.trim();
  if (primary) return primary;
  const legacy = process.env.REPLICATE_API_TOKEN?.trim();
  return legacy || undefined;
}

export function getPlatformOpenAiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || undefined;
}

/**
 * Replicate token for a signed-in session. Returns the platform key only.
 * Stored BYOK credentials are ignored for core generation.
 */
export function getAccountReplicateToken(request: NextRequest): string | undefined {
  if (!getAuthenticatedAccount(request)) return undefined;
  return getPlatformReplicateKey();
}

/** @see getAccountReplicateToken */
export function getSessionReplicateToken(request: NextRequest): string | undefined {
  return getAccountReplicateToken(request);
}

/**
 * OpenAI key for a signed-in session. Platform `OPENAI_API_KEY` only.
 * User-pasted OpenAI keys are not used for core generation.
 */
export function getSessionOpenAiToken(request: NextRequest): string | undefined {
  if (!getAuthenticatedAccount(request)) return undefined;
  return getPlatformOpenAiKey();
}

/**
 * Ops/deploy-only env token. Do not call from end-user AI routes.
 * Used by the unscoped server runtime (`getServerAiRuntime()` with no account).
 */
export function getOpsEnvReplicateToken(): string | undefined {
  return getPlatformReplicateKey();
}

/**
 * Ops/deploy-only env token. Do not call from end-user AI routes.
 */
export function getOpsEnvOpenAiToken(): string | undefined {
  const token = process.env.OPENAI_API_KEY?.trim();
  return token || undefined;
}

export function getCredentialStatus(request: NextRequest): CredentialStatus {
  return getProviderCredentialStatus(request, "replicate");
}

export function getCredentialsPayload(request: NextRequest): CredentialsPayload {
  const account = getAuthenticatedAccount(request);
  if (!account) {
    return {
      authenticated: false,
      replicate: emptyStatus(false, "replicate"),
      openai: emptyStatus(false, "openai"),
    };
  }
  return {
    authenticated: true,
    replicate: getProviderCredentialStatus(request, "replicate"),
    openai: getProviderCredentialStatus(request, "openai"),
  };
}

function getProviderCredentialStatus(
  request: NextRequest,
  provider: AiCredentialProvider,
): CredentialStatus {
  const account = getAuthenticatedAccount(request);
  if (!account) return emptyStatus(false, provider);
  try {
    const status: StoredCredentialStatus =
      provider === "openai"
        ? getOpenAiCredentialStatus(account.id)
        : getReplicateCredentialStatus(account.id);
    return {
      authenticated: true,
      provider,
      ...status,
    };
  } catch {
    return emptyStatus(true, provider);
  }
}

export function saveSessionReplicateToken(request: NextRequest, token: string): void {
  const account = getAuthenticatedAccount(request);
  if (!account) throw new Error("AUTH_REQUIRED");
  saveReplicateApiKey(account.id, token);
}

export function saveSessionOpenAiToken(request: NextRequest, token: string): void {
  const account = getAuthenticatedAccount(request);
  if (!account) throw new Error("AUTH_REQUIRED");
  saveOpenAiApiKey(account.id, token);
}

export function clearSessionReplicateToken(request: NextRequest): boolean {
  const account = getAuthenticatedAccount(request);
  return account ? deleteReplicateApiKey(account.id) : false;
}

export function clearSessionOpenAiToken(request: NextRequest): boolean {
  const account = getAuthenticatedAccount(request);
  return account ? deleteOpenAiApiKey(account.id) : false;
}

export async function verifyReplicateApiKey(
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; status: 401 | 502; reason: string }> {
  const timeoutSignal = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch("https://api.replicate.com/v1/models/openai/gpt-image-2.5-sunburst", {
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

export async function verifyOpenAiApiKey(
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; status: 401 | 502; reason: string }> {
  const timeoutSignal = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/models/gpt-image-2.5-sunburst", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, reason: "OpenAI is temporarily unavailable." };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, reason: "OpenAI rejected this API Key." };
  }
  // 404 can mean the model id is not listed for the org yet but the key is valid —
  // fall back to /v1/models to confirm authentication.
  if (response.status === 404) {
    try {
      const models = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: requestSignal,
        cache: "no-store",
      });
      if (models.ok) return { ok: true };
      if (models.status === 401 || models.status === 403) {
        return { ok: false, status: 401, reason: "OpenAI rejected this API Key." };
      }
    } catch {
      return { ok: false, status: 502, reason: "OpenAI is temporarily unavailable." };
    }
  }
  return { ok: false, status: 502, reason: "OpenAI could not verify this API Key right now." };
}

function emptyStatus(authenticated: boolean, provider: AiCredentialProvider): CredentialStatus {
  return {
    authenticated,
    provider,
    configured: false,
    keyHint: null,
    storage: "encrypted-account",
    updatedAt: null,
  };
}
