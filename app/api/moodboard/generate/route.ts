import type { NextRequest } from "next/server";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import {
  MOODBOARD_GENERATE_MAX_COST_USD,
  MOODBOARD_IMAGE_HEIGHT,
  MOODBOARD_IMAGE_MODEL_ALIAS,
  MOODBOARD_IMAGE_WIDTH,
  MOODBOARD_REPLICATE_IMAGE_MODEL,
} from "@/lib/moodboard/constants";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { requireEndUserCloudAi } from "@/lib/server/ai/endUserCloudGuard";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(36, 60_000);
const MAX_BODY_BYTES = 16_000;

/**
 * One Moodboard Replicate image (flux-schnell) per request.
 * Auth + consent + per-account BYOK — never shared REPLICATE_API_TOKEN.
 */
export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
  if (!limit.ok) {
    return jsonNoStore(
      { error: { code: "PROVIDER_RATE_LIMIT", message: "Rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonNoStore(
        { error: { code: "INVALID_INPUT", message: "Moodboard generate request is too large." } },
        { status: 413 },
      );
    }
    return jsonNoStore(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return jsonNoStore(
      { error: { code: "INVALID_INPUT", message: "Invalid Moodboard generate payload." } },
      { status: 400 },
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 4_000) {
    return jsonNoStore(
      { error: { code: "INVALID_INPUT", message: "An image prompt is required." } },
      { status: 400 },
    );
  }

  const access = requireEndUserCloudAi(req, body.cloudConsent);
  if (!access.ok) return access.response;

  const width =
    typeof body.width === "number" && Number.isFinite(body.width) && body.width > 0
      ? Math.min(2048, Math.round(body.width))
      : MOODBOARD_IMAGE_WIDTH;
  const height =
    typeof body.height === "number" && Number.isFinite(body.height) && body.height > 0
      ? Math.min(2048, Math.round(body.height))
      : MOODBOARD_IMAGE_HEIGHT;

  try {
    const ai = getServerAiRuntime({
      replicateToken: access.replicateToken,
      accountId: access.account.id,
    });
    const execution = await ai.execute(
      "image.generate",
      {
        prompt,
        width,
        height,
        aspectRatio: "1:1",
        modelAlias: MOODBOARD_IMAGE_MODEL_ALIAS,
        enhance: false,
        cloudConsent: true,
      },
      {
        profile: "economy",
        provider: "replicate",
        modelAlias: MOODBOARD_IMAGE_MODEL_ALIAS,
        cloudConsent: true,
        allowFallback: false,
        timeoutMs: 90_000,
        maxCostUsd: MOODBOARD_GENERATE_MAX_COST_USD,
        accountId: access.account.id,
        signal: req.signal,
      },
    );
    return jsonNoStore({
      execution,
      model: MOODBOARD_REPLICATE_IMAGE_MODEL,
    });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "Moodboard image generation failed.", {
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

function publicErrorMessage(code: AiRuntimeError["code"]): string {
  switch (code) {
    case "PROVIDER_AUTH":
      return "Add your Replicate API key in AI Provider Settings.";
    case "PROVIDER_RATE_LIMIT":
      return "Replicate rate limit exceeded. Please wait a moment.";
    case "INVALID_INPUT":
      return "Invalid Moodboard image request.";
    case "BUDGET_EXCEEDED":
      return "Moodboard image cost cap exceeded.";
    default:
      return "Moodboard image generation failed.";
  }
}

function errorStatus(error: AiRuntimeError): number {
  switch (error.code) {
    case "PROVIDER_AUTH":
      return 503;
    case "PROVIDER_RATE_LIMIT":
      return 429;
    case "INVALID_INPUT":
      return 400;
    case "BUDGET_EXCEEDED":
      return 402;
    case "POLICY_DENIED":
      return 403;
    default:
      return 502;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
