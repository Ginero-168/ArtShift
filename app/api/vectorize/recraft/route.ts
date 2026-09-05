import type { NextRequest } from "next/server";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 7_500_000;
const recraftLimiter = new RateLimiter(10, 60_000);

export async function POST(req: NextRequest) {
  const limit = recraftLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return jsonNoStore(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES)
      return invalidRequest("Recraft image request is too large.", 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES)
      return invalidRequest("Recraft image request is too large.", 413);
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  if (!isRecord(body) || body.task !== "vectorize.recraft") {
    return invalidRequest("This endpoint only supports Recraft vectorization.");
  }
  const request = parsePublicAiExecuteRequest(body);
  if (request?.task !== "vectorize.recraft") {
    return invalidRequest("Invalid Recraft vectorize payload.");
  }

  try {
    const ai = getServerAiRuntime({ replicateToken: getSessionReplicateToken(req) });
    const execution = await ai.execute("vectorize.recraft", request.input, {
      ...request.options,
      profile: "quality",
      provider: "replicate",
      modelAlias: "recraft-vectorize",
      allowFallback: false,
      signal: req.signal,
    });
    return jsonNoStore({ execution });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "Recraft vectorization failed.", {
            cause: error,
          });
    return jsonNoStore(
      { error: { code: normalized.code, message: normalized.message } },
      { status: errorStatus(normalized) },
    );
  }
}

function invalidRequest(message: string, status = 400) {
  return jsonNoStore({ error: { code: "INVALID_INPUT", message } }, { status });
}

function errorStatus(error: AiRuntimeError): number {
  switch (error.code) {
    case "INVALID_INPUT":
      return 400;
    case "POLICY_DENIED":
      return 403;
    case "PROVIDER_AUTH":
    case "NO_PROVIDER":
      return 503;
    case "PROVIDER_RATE_LIMIT":
      return 429;
    case "BUDGET_EXCEEDED":
      return 402;
    case "ABORTED":
      return 499;
    case "TIMEOUT":
      return 504;
    default:
      return 502;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
