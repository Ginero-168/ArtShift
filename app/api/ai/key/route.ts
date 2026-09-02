import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import {
  clearAiSessionCookie,
  clearSessionReplicateToken,
  getCredentialStatus,
  maskReplicateApiKey,
  saveSessionReplicateToken,
  validateReplicateApiKey,
  verifyReplicateApiKey,
} from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const keyLimiter = new RateLimiter(20, 60_000);

export async function GET(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);
  return jsonNoStore({ credential: getCredentialStatus(req) });
}

export async function POST(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);

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

  if (!isRecord(body) || body.provider !== "replicate") {
    return invalidRequest("Only the Replicate provider is supported.");
  }
  const validation = validateReplicateApiKey(body.apiKey);
  if (!validation.ok) return invalidRequest(validation.reason);

  const verified = await verifyReplicateApiKey(validation.value, req.signal);
  if (!verified.ok) {
    return jsonNoStore({ error: verified.reason }, { status: verified.status });
  }

  const response = jsonNoStore({
    credential: {
      provider: "replicate",
      configured: true,
      keyHint: maskReplicateApiKey(validation.value),
      storage: "session-memory",
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
  });
  saveSessionReplicateToken(req, response, validation.value);
  return response;
}

export async function DELETE(req: NextRequest) {
  const limit = keyLimiter.check(getClientIp(req));
  if (!limit.ok) return rateLimited(limit.retryAfter);
  clearSessionReplicateToken(req);
  const response = jsonNoStore({
    credential: {
      provider: "replicate",
      configured: false,
      keyHint: null,
      storage: "session-memory",
      expiresAt: null,
    },
  });
  clearAiSessionCookie(response);
  return response;
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

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
