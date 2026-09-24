import { type NextRequest, NextResponse } from "next/server";
import type { AiExecutionOptions } from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { type PublicAiExecuteRequest, parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { spendCredits } from "@/lib/credits/ledger";
import { type CreditAction, imageGenerateAction } from "@/lib/credits/pricing";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";
import { insufficientCreditsNestedResponse, refundCharge } from "@/lib/server/credits/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_500_000;
const executeLimiter = new RateLimiter(20, 60_000);

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = executeLimiter.check(limitKey);
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
      return invalidRequest("AI request body is too large.", 413);
    }
    return invalidRequest("Invalid JSON body.");
  }

  const request = parsePublicAiExecuteRequest(body);
  if (!request) return invalidRequest("Invalid AI task payload.");
  if (!account) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication is required for AI execution." } },
      { status: 401 },
    );
  }

  const priced = actionForPublicTask(request);
  const charge = spendCredits(account.id, priced.action, priced.units);
  if (!charge.ok) return insufficientCreditsNestedResponse(charge);

  try {
    const execution = await executePublicTask(
      request,
      req.signal,
      getSessionReplicateToken(req),
      account.id,
    );
    return NextResponse.json({ execution });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "AI execution failed.", { cause: error });
    if (!normalized.outcomeUnknown) refundCharge(charge.entryId, "ai execute failed");
    return NextResponse.json(
      { error: { code: normalized.code, message: publicErrorMessage(normalized.code) } },
      { status: errorStatus(normalized) },
    );
  }
}

function actionForPublicTask(request: PublicAiExecuteRequest): {
  action: CreditAction;
  units: number;
} {
  switch (request.task) {
    case "vision.describe":
    case "vision.propose":
    case "vision.ocr":
      return { action: "vision.describe", units: 1 };
    case "vectorize.recraft":
      return { action: "vectorize.recraft", units: 1 };
    case "prompt.enhance":
      return { action: "prompt.enhance", units: 1 };
    case "image.generate":
      return {
        action: imageGenerateAction(
          "quality" in request.input && typeof request.input.quality === "string"
            ? request.input.quality
            : undefined,
        ),
        units: 1,
      };
    case "image.upscale":
      return { action: "image.upscale", units: 1 };
    case "image.decomposeLayers":
      return { action: "image.decomposeLayers", units: 1 };
    case "image.multiAngle":
      return { action: "image.multiAngle", units: 1 };
    case "image.poseSkeleton":
      return { action: "image.poseSkeleton", units: 1 };
  }
}

function executePublicTask(
  request: PublicAiExecuteRequest,
  signal: AbortSignal,
  replicateToken: string | undefined,
  accountId: string,
) {
  const ai = getServerAiRuntime({ replicateToken, accountId });
  const options = trustedExecutionOptions(
    request.task,
    request.options.cloudConsent === true,
    signal,
    accountId,
  );
  switch (request.task) {
    case "vision.describe":
      return ai.execute(request.task, request.input, options);
    case "vision.propose":
      return ai.execute(request.task, request.input, options);
    case "vision.ocr":
      return ai.execute(request.task, request.input, options);
    case "vectorize.recraft":
      return ai.execute(request.task, request.input, options);
    case "prompt.enhance":
      return ai.execute(request.task, request.input, options);
    case "image.generate":
      return ai.execute(request.task, request.input, options);
    case "image.upscale":
      return ai.execute(request.task, request.input, options);
    case "image.decomposeLayers":
      return ai.execute(request.task, request.input, options);
    case "image.multiAngle":
      return ai.execute(request.task, request.input, options);
    case "image.poseSkeleton":
      return ai.execute(request.task, request.input, options);
  }
}

function trustedExecutionOptions(
  task: PublicAiExecuteRequest["task"],
  cloudConsent: boolean,
  signal: AbortSignal,
  accountId: string,
): AiExecutionOptions {
  const isPromptEnhancement = task === "prompt.enhance";
  const isImageMutation =
    task === "image.generate" ||
    task === "image.upscale" ||
    task === "image.decomposeLayers" ||
    task === "image.multiAngle" ||
    task === "image.poseSkeleton";
  return {
    profile: isPromptEnhancement ? "economy" : "quality",
    cloudConsent,
    allowFallback: false,
    timeoutMs: isImageMutation ? 90_000 : 60_000,
    maxCostUsd: isPromptEnhancement ? 0.02 : isImageMutation ? 0.25 : 0.1,
    cache: !isImageMutation,
    accountId,
    signal,
  };
}

function invalidRequest(message: string, status = 400) {
  return NextResponse.json({ error: { code: "INVALID_INPUT", message } }, { status });
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
