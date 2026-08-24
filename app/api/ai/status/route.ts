import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getAiBudgetStatus, getServerAiRuntime } from "@/lib/server/ai/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusLimiter = new RateLimiter(60, 60_000);

export async function GET(req: NextRequest) {
  const limit = statusLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }
  const ai = getServerAiRuntime();
  return NextResponse.json({
    capabilities: await ai.capabilities(),
    budget: getAiBudgetStatus(),
    usage: ai.usageSummary(),
  });
}

export async function POST(req: NextRequest) {
  const limit = statusLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body as { action?: unknown }).action !== "clear-result-cache"
  ) {
    return NextResponse.json({ error: "Invalid status action." }, { status: 400 });
  }
  getServerAiRuntime().clearCache();
  return NextResponse.json({ success: true });
}
