import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import {
  executeServerRmbg,
  getServerRmbgStatus,
  type ServerRmbgOptions,
} from "@/lib/server/ai/serverLocalRmbg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_000_000;
const executeLimiter = new RateLimiter(8, 60_000);
const imageDataUrlPattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export async function GET() {
  return NextResponse.json(
    { runtime: "server-local-rmbg", ...getServerRmbgStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const limit = executeLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: { code: "PROVIDER_RATE_LIMIT", message: "Rate limit exceeded." } },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" },
      },
    );
  }

  let body: unknown;
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES)
      return invalidRequest("RMBG request body is too large.", 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES)
      return invalidRequest("RMBG request body is too large.", 413);
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  if (!isRequest(body)) return invalidRequest("Invalid image payload or server-fallback consent.");

  try {
    const result = await executeServerRmbg(body.image, req.signal, {
      blackPoint: body.blackPoint,
      whitePoint: body.whitePoint,
    });
    return NextResponse.json(
      { result, runtime: "vps-fallback" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    const queueBusy = error instanceof Error && error.message === "Server RMBG queue is busy.";
    return NextResponse.json(
      {
        error: {
          code: aborted ? "ABORTED" : queueBusy ? "PROVIDER_RATE_LIMIT" : "PROVIDER_UNAVAILABLE",
          message: aborted
            ? "Server RMBG task was cancelled."
            : queueBusy
              ? "Server RMBG is busy. Try again shortly."
              : "Server RMBG is temporarily unavailable.",
        },
      },
      {
        status: aborted ? 499 : queueBusy ? 429 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

function isRequest(
  value: unknown,
): value is { image: string; allowServerFallback: true } & ServerRmbgOptions {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.image === "string" &&
    record.image.length <= MAX_BODY_BYTES &&
    imageDataUrlPattern.test(record.image) &&
    record.allowServerFallback === true &&
    isOptionalPoint(record.blackPoint) &&
    isOptionalPoint(record.whitePoint)
  );
}

function isOptionalPoint(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function invalidRequest(message: string, status = 400) {
  return NextResponse.json(
    { error: { code: "INVALID_INPUT", message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
