import { type NextRequest, NextResponse } from "next/server";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import {
  MOODBOARD_ASPECT_RATIO,
  MOODBOARD_BATCH_USD,
  MOODBOARD_IMAGE_QUALITY,
  MOODBOARD_PER_IMAGE_USD,
  MOODBOARD_REPLICATE_MODEL,
  MOODBOARD_REPLICATE_MODEL_ALIAS,
} from "@/lib/moodboard/constants";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { requireEndUserCloudAi } from "@/lib/server/ai/endUserCloudGuard";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(40, 60_000);
const MAX_BODY_BYTES = 16_000;
const MAX_PROMPT_CHARS = 2_000;

/**
 * One Moodboard AI image via Replicate gpt-image-2.5-flare at quality low (BYOK).
 * Clients call this once per idea (9, 16, or 25). Each call asks for one image.
 * ~$0.012 per image. A 9-pack is ~$0.11.
 */
export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
  if (!limit.ok) {
    return NextResponse.json(
      { error: { code: "PROVIDER_RATE_LIMIT", message: "Rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "Moodboard generate request is too large." } },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid Moodboard generate payload." } },
      { status: 400 },
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "A prompt is required." } },
      { status: 400 },
    );
  }

  const access = requireEndUserCloudAi(req, body.cloudConsent);
  if (!access.ok) return access.response;

  const index =
    typeof body.index === "number" && Number.isInteger(body.index) && body.index >= 1
      ? body.index
      : undefined;

  try {
    const ai = getServerAiRuntime({
      replicateToken: access.replicateToken,
      accountId: access.account.id,
    });
    const execution = await ai.execute(
      "image.generate",
      {
        prompt,
        width: 1024,
        height: 1024,
        aspectRatio: MOODBOARD_ASPECT_RATIO,
        quality: MOODBOARD_IMAGE_QUALITY,
        enhance: false,
        modelAlias: MOODBOARD_REPLICATE_MODEL_ALIAS,
      },
      {
        profile: "economy",
        provider: "replicate",
        modelAlias: MOODBOARD_REPLICATE_MODEL_ALIAS,
        cloudConsent: true,
        allowFallback: false,
        timeoutMs: 90_000,
        maxCostUsd: MOODBOARD_PER_IMAGE_USD * 2,
        cache: false,
        accountId: access.account.id,
        signal: req.signal,
      },
    );

    return NextResponse.json({
      success: true,
      index,
      dataUrl: execution.output.dataUrl,
      prompt: execution.output.prompt,
      width: execution.output.width,
      height: execution.output.height,
      provider: execution.metadata.provider,
      model: execution.metadata.model,
      estimatedUsd: MOODBOARD_PER_IMAGE_USD,
      quality: MOODBOARD_IMAGE_QUALITY,
      aspectRatio: MOODBOARD_ASPECT_RATIO,
      // Default 9-pack ceiling. The client scales this by the chosen count (9, 16, or 25).
      batchEstimateUsd: MOODBOARD_BATCH_USD,
      defaultModel: MOODBOARD_REPLICATE_MODEL,
      warnings: execution.metadata.warnings,
    });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "Moodboard image generation failed.", {
            cause: error,
          });
    return NextResponse.json(
      {
        error: {
          code: normalized.outcomeUnknown ? "OUTCOME_UNKNOWN" : normalized.code,
          message: publicErrorMessage(normalized),
        },
      },
      { status: errorStatus(normalized) },
    );
  }
}

function publicErrorMessage(error: AiRuntimeError): string {
  switch (error.code) {
    case "INVALID_INPUT":
      return "Invalid Moodboard generate request.";
    case "POLICY_DENIED":
      return "This AI operation requires explicit cloud consent.";
    case "PROVIDER_AUTH":
      return "AI provider is not configured for this session. Add your Replicate API key in AI Provider Settings.";
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
    default:
      return error.message || "Moodboard image generation failed.";
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
