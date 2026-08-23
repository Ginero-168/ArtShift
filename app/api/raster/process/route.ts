import { type NextRequest, NextResponse } from "next/server";
import {
  decodeRasterJob,
  decodeRasterResult,
  encodeRasterJob,
  encodeRasterResult,
} from "@/lib/raster/jobPayload";
import {
  assertRasterJobBudget,
  executeRasterJobLocally,
  type RasterResult,
} from "@/lib/raster/processor";
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
    assertRasterJobBudget(job);
    const result = process.env.RASTER_API_URL
      ? await executeRemoteRasterJob(job)
      : executeRasterJobLocally(job);
    return NextResponse.json({ result: encodeRasterResult(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Raster job failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

/**
 * Fast mode can be backed by a paid GPU/API provider without changing the
 * browser-facing RasterProcessor interface. The local fallback remains the
 * safe default for self-hosted installations that have no provider key.
 */
async function executeRemoteRasterJob(
  job: Parameters<typeof executeRasterJobLocally>[0],
): Promise<RasterResult> {
  const endpoint = process.env.RASTER_API_URL;
  if (!endpoint) throw new Error("Raster API provider is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.RASTER_API_KEY
          ? { Authorization: `Bearer ${process.env.RASTER_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({ job: encodeRasterJob(job) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Raster provider returned ${response.status}.`);
    const payload = (await response.json()) as { result?: unknown };
    const result = decodeRasterResult(payload.result);
    if (!result) throw new Error("Raster provider returned an invalid result.");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
