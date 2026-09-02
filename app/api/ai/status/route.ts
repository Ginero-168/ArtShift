import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getAiBudgetStatus, getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getCredentialStatus, getSessionReplicateToken } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusLimiter = new RateLimiter(60, 60_000);

export async function GET(req: NextRequest) {
  const limit = statusLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return jsonNoStore({ error: "Rate limit exceeded." }, { status: 429 });
  }
  const replicateToken = getSessionReplicateToken(req);
  const ai = getServerAiRuntime({ replicateToken });
  return jsonNoStore({
    capabilities: await ai.capabilities(),
    budget: getAiBudgetStatus(),
    usage: ai.usageSummary(),
    credential: getCredentialStatus(req),
  });
}

export async function POST(req: NextRequest) {
  const limit = statusLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return jsonNoStore({ error: "Rate limit exceeded." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body as { action?: unknown }).action !== "clear-result-cache"
  ) {
    return jsonNoStore({ error: "Invalid status action." }, { status: 400 });
  }
  getServerAiRuntime().clearCache();
  return jsonNoStore({ success: true });
}

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}
