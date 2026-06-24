import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const removeBgLimiter = new RateLimiter(10, 60_000);

export async function POST(req: NextRequest) {
  const limit = removeBgLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const wavespeedKey = process.env.WAVESPEED_API_KEY || "";
  if (!wavespeedKey) {
    return NextResponse.json({ error: "Server missing WAVESPEED_API_KEY" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json({ error: "Missing image field" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.wavespeed.ai/api/v3/bria/remove-background", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wavespeedKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("WaveSpeed call failed:", err);
    return NextResponse.json({ error: "Upstream WaveSpeed request failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const wavespeedKey = process.env.WAVESPEED_API_KEY || "";
  if (!wavespeedKey) {
    return NextResponse.json({ error: "Server missing WAVESPEED_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId query parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${encodeURIComponent(requestId)}/result`,
      {
        headers: { Authorization: `Bearer ${wavespeedKey}` },
      },
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("WaveSpeed status check failed:", err);
    return NextResponse.json({ error: "Upstream WaveSpeed request failed" }, { status: 502 });
  }
}
