import { type NextRequest, NextResponse } from "next/server";
import { decodeRasterJob, encodeRasterResult } from "@/lib/raster/jobPayload";
import { executeRasterJobLocally } from "@/lib/raster/processor";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rasterLimiter = new RateLimiter(30, 60_000);
const MAX_BODY_BYTES = 70 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const limit = rasterLimiter.check(getClientIp(request));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Raster request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Raster request is too large." }, { status: 413 });
    }
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const job =
    typeof body === "object" && body !== null && "job" in body
      ? decodeRasterJob((body as { job?: unknown }).job)
      : null;
  if (!job) return NextResponse.json({ error: "Invalid raster job." }, { status: 400 });

  try {
    const result = executeRasterJobLocally(job);
    return NextResponse.json({ result: encodeRasterResult(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Raster job failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
