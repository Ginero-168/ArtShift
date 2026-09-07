import type { NextRequest } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/server/ai/requestBody";
import { getAiBudgetStatus, getServerAiRuntime } from "@/lib/server/ai/runtime";
import {
  getCredentialStatus,
  getSessionReplicateToken,
  getUserAccount,
} from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusLimiter = new RateLimiter(60, 60_000);

export async function GET(req: NextRequest) {
  const account = getUserAccount(req);
  const limit = statusLimiter.check(account ? `account:${account.id}` : `ip:${getClientIp(req)}`);
  if (!limit.ok) {
    return jsonNoStore({ error: "Rate limit exceeded." }, { status: 429 });
  }
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const replicateToken = getSessionReplicateToken(req);
  const ai = getServerAiRuntime({ replicateToken, accountId: account.id });
  return jsonNoStore({
    capabilities: await ai.capabilities(),
    budget: getAiBudgetStatus(account.id),
    usage: ai.usageSummary(account.id),
    credential: getCredentialStatus(req),
  });
}

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limit = statusLimiter.check(account ? `account:${account.id}` : `ip:${getClientIp(req)}`);
  if (!limit.ok) {
    return jsonNoStore({ error: "Rate limit exceeded." }, { status: 429 });
  }
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  let body: unknown;
  try {
    body = await readBoundedJson(req, 16 * 1024);
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
  getServerAiRuntime({
    replicateToken: getSessionReplicateToken(req),
    accountId: account.id,
  }).clearCache();
  return jsonNoStore({ success: true });
}
