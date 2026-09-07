import type { NextRequest } from "next/server";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 7_500_000;
const upscaleLimiter = new RateLimiter(10, 60_000);

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = upscaleLimiter.check(limitKey);
  if (!limit.ok) {
    return jsonNoStore(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!account) {
    return jsonNoStore(
      { error: "Authentication is required for image upscaling." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return invalidRequest("Upscale image request is too large.", 413);
    }
    return invalidRequest("Invalid JSON body.");
  }

  if (!isRecord(body) || body.task !== "image.upscale") {
    return invalidRequest("This endpoint only supports P-Image-Upscale.");
  }
  const request = parsePublicAiExecuteRequest(body);
  if (request?.task !== "image.upscale") {
    return invalidRequest("Invalid Upscale payload.");
  }
  if (request.options.cloudConsent !== true) {
    return jsonNoStore(
      {
        error: {
          code: "POLICY_DENIED",
          message: "Upscale requires explicit cloud consent before the image leaves this device.",
        },
      },
      { status: 403 },
    );
  }

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const execution = await ai.execute("image.upscale", request.input, {
      profile: "quality",
      provider: "replicate",
      modelAlias: "p-image-upscale",
      cloudConsent: true,
      allowFallback: false,
      timeoutMs: 120_000,
      maxCostUsd: 0.25,
      accountId: account.id,
      signal: req.signal,
    });
    return jsonNoStore({ execution });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "P-Image-Upscale failed.", {
            cause: error,
          });
    return jsonNoStore(
      {
        error: {
          code: normalized.outcomeUnknown ? "OUTCOME_UNKNOWN" : normalized.code,
          message: normalized.outcomeUnknown
            ? "AI provider result is uncertain; no duplicate request was created."
            : publicErrorMessage(normalized.code),
        },
      },
      { status: errorStatus(normalized) },
    );
  }
}

function invalidRequest(message: string, status = 400) {
  return jsonNoStore({ error: { code: "INVALID_INPUT", message } }, { status });
}

function publicErrorMessage(code: AiRuntimeError["code"]): string {
  switch (code) {
    case "INVALID_INPUT":
      return "Invalid AI request.";
    case "POLICY_DENIED":
      return "This AI operation requires explicit cloud consent.";
    case "PROVIDER_AUTH":
      return "AI provider is not configured for this session.";
    case "PROVIDER_RATE_LIMIT":
      return "AI provider rate limit reached. Please try again later.";
    case "BUDGET_EXCEEDED":
      return "This AI operation exceeds the allowed budget.";
    case "ABORTED":
      return "AI operation was cancelled.";
    case "TIMEOUT":
      return "AI operation timed out.";
    case "NO_PROVIDER":
      return "The requested AI capability is unavailable.";
    case "PROVIDER_SCHEMA":
    case "PROVIDER_UNAVAILABLE":
      return "AI provider is temporarily unavailable.";
  }
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
