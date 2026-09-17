import type { NextRequest } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import {
  clearSessionOpenAiToken,
  clearSessionReplicateToken,
  getCredentialsPayload,
  getUserAccount,
  saveSessionOpenAiToken,
  saveSessionReplicateToken,
  validateOpenAiApiKey,
  validateReplicateApiKey,
  verifyOpenAiApiKey,
  verifyReplicateApiKey,
} from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const keyLimiter = new RateLimiter(20, 60_000);

export async function GET(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);
  const payload = getCredentialsPayload(req);
  // Keep `credential` as Replicate for older clients.
  return jsonNoStore({
    credential: payload.replicate,
    credentials: payload,
  });
}

export async function POST(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);
  if (!getUserAccount(req)) {
    return jsonNoStore(
      { error: "Sign in to save your API Key securely.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) return invalidRequest("API Key request is too large.", 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES)
      return invalidRequest("API Key request is too large.", 413);
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  if (!isRecord(body) || (body.provider !== "replicate" && body.provider !== "openai")) {
    return invalidRequest("Supported providers: replicate, openai.");
  }

  if (body.provider === "replicate") {
    const validation = validateReplicateApiKey(body.apiKey);
    if (!validation.ok) return invalidRequest(validation.reason);
    const verified = await verifyReplicateApiKey(validation.value, req.signal);
    if (!verified.ok) {
      return jsonNoStore({ error: verified.reason }, { status: verified.status });
    }
    saveSessionReplicateToken(req, validation.value);
    const payload = getCredentialsPayload(req);
    return jsonNoStore({ credential: payload.replicate, credentials: payload });
  }

  const validation = validateOpenAiApiKey(body.apiKey);
  if (!validation.ok) return invalidRequest(validation.reason);
  const verified = await verifyOpenAiApiKey(validation.value, req.signal);
  if (!verified.ok) {
    return jsonNoStore({ error: verified.reason }, { status: verified.status });
  }
  saveSessionOpenAiToken(req, validation.value);
  const payload = getCredentialsPayload(req);
  return jsonNoStore({ credential: payload.openai, credentials: payload });
}

export async function DELETE(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);
  if (!getUserAccount(req)) {
    return jsonNoStore(
      { error: "Sign in to manage your API Key.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }
  const provider = req.nextUrl.searchParams.get("provider") ?? "replicate";
  if (provider === "openai") {
    clearSessionOpenAiToken(req);
  } else if (provider === "replicate") {
    clearSessionReplicateToken(req);
  } else {
    return invalidRequest("Supported providers: replicate, openai.");
  }
  const payload = getCredentialsPayload(req);
  return jsonNoStore({
    credential: provider === "openai" ? payload.openai : payload.replicate,
    credentials: payload,
  });
}

function rateLimited(retryAfter: number) {
  return jsonNoStore(
    { error: "Rate limit exceeded. Please slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

function invalidRequest(message: string, status = 400) {
  return jsonNoStore({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
