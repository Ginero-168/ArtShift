import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stockLimiter = new RateLimiter(30, 60_000);

export async function GET(req: NextRequest) {
  const limit = stockLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  if (source === "unsplash") {
    const key = process.env.UNSPLASH_ACCESS_KEY || "";
    if (!key) {
      return NextResponse.json({ error: "Server missing UNSPLASH_ACCESS_KEY" }, { status: 500 });
    }
    const query = searchParams.get("query") || "";
    const perPageParam = searchParams.get("per_page") || "10";
    const perPageNum = Number.parseInt(perPageParam, 10);
    const perPage =
      Number.isNaN(perPageNum) || perPageNum <= 0 || perPageNum > 30 ? 10 : perPageNum;
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: "Upstream Unsplash request failed" }, { status: 502 });
    }
  }

  if (source === "pexels") {
    const key = process.env.PEXELS_API_KEY || "";
    if (!key) {
      return NextResponse.json({ error: "Server missing PEXELS_API_KEY" }, { status: 500 });
    }
    const query = searchParams.get("query") || "";
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10`;

    try {
      const res = await fetch(url, { headers: { Authorization: key } });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: "Upstream Pexels request failed" }, { status: 502 });
    }
  }

  return NextResponse.json(
    { error: "Unknown source. Use ?source=unsplash or ?source=pexels" },
    { status: 400 },
  );
}
