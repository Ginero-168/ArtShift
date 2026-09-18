import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Next.js production only serves `public/` files that existed at build time.
 * Runtime-generated Prompt Helper thumbs must be streamed from disk via this route.
 */
const THUMB_DIR = path.join(process.cwd(), "public/prompt-helper/thumbs");
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
/** Generous — Helper can request dozens of chips at once. */
const limiter = new RateLimiter(240, 60_000);

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req);
  const limit = limiter.check(`thumb-file:${ip}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId || "").replace(/\.jpe?g$/i, "");
  if (!SAFE_ID.test(id)) {
    return NextResponse.json({ error: "Invalid thumb id" }, { status: 400 });
  }

  const filePath = path.join(THUMB_DIR, `${id}.jpg`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(THUMB_DIR) + path.sep)) {
    return NextResponse.json({ error: "Invalid thumb id" }, { status: 400 });
  }

  try {
    await access(resolved);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buf = await readFile(resolved);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
