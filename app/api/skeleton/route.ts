import type { NextRequest } from "next/server";
import { DEFAULT_YOLO_POSE_MODEL_SIZE } from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { requireEndUserCloudAi } from "@/lib/server/ai/endUserCloudGuard";
import {
  cancelPoseSkeletonJob,
  pollPoseSkeletonJob,
  startPoseSkeletonJob,
} from "@/lib/server/ai/poseSkeletonJob";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { refundCharge } from "@/lib/server/credits/gate";
import { jsonNoStore } from "@/lib/server/http";
import { isPoseSkeletonImageFailureMessage } from "@/lib/vision/poseImageFailure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 7_500_000;
/** One image upload. Polling has its own budget so a cold start can keep checking. */
const skeletonStartLimiter = new RateLimiter(8, 60_000);
const skeletonPollLimiter = new RateLimiter(90, 60_000);
/** Return before the nginx proxy in front of the app drops a silent upload. */
const START_DEADLINE_MS = 20_000;

const skeletonExecution = {
  profile: "quality" as const,
  provider: "replicate" as const,
  modelAlias: "yolo26-pose" as const,
  allowFallback: false as const,
};

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return invalidRequest("Skeleton request is too large.", 413);
    }
    return invalidRequest("Invalid JSON body.");
  }
  if (!isRecord(body)) return invalidRequest("Invalid Skeleton payload.");

  const action = body.action === undefined ? "start" : body.action;
  const limit = (action === "status" ? skeletonPollLimiter : skeletonStartLimiter).check(limitKey);
  if (!limit.ok) {
    return jsonNoStore(
      {
        error: {
          code: "PROVIDER_RATE_LIMIT",
          message: "Rate limit exceeded. Please wait a moment.",
        },
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (action === "status") return statusPose(req, body);
  if (action === "cancel") return cancelPose(req, body);
  if (action !== "start") return invalidRequest("Invalid Skeleton payload.");
  return startPose(req, body);
}

async function startPose(req: NextRequest, body: Record<string, unknown>) {
  if (body.task !== "image.poseSkeleton") {
    return invalidRequest("This endpoint only supports YOLO26 pose.");
  }
  const request = parsePublicAiExecuteRequest(body);
  if (request?.task !== "image.poseSkeleton") {
    return invalidRequest("Invalid Skeleton payload.");
  }
  if (
    (request.options.modelAlias && request.options.modelAlias !== skeletonExecution.modelAlias) ||
    (request.options.provider && request.options.provider !== skeletonExecution.provider) ||
    (request.options.profile && request.options.profile !== skeletonExecution.profile) ||
    (request.options.allowFallback !== undefined &&
      request.options.allowFallback !== skeletonExecution.allowFallback)
  ) {
    return invalidRequest("Invalid Skeleton payload.");
  }

  const access = requireEndUserCloudAi(req, request.options.cloudConsent, "image.poseSkeleton");
  if (!access.ok) return access.response;

  const deadline = AbortSignal.timeout(START_DEADLINE_MS);
  const signal = AbortSignal.any([req.signal, deadline]);
  try {
    const ticket = await startPoseSkeletonJob(
      access.replicateToken,
      {
        ...request.input,
        modelSize: request.input.modelSize ?? DEFAULT_YOLO_POSE_MODEL_SIZE,
      },
      signal,
    );
    return jsonNoStore({
      predictionId: ticket.predictionId,
      status: ticket.status,
      ...(ticket.status === "succeeded" ? { poses: ticket.poses ?? [] } : {}),
    });
  } catch (error) {
    if (deadline.aborted && !req.signal.aborted) {
      refundCharge(access.charge?.entryId, "skeleton start timed out");
      return poseError(
        new AiRuntimeError("TIMEOUT", "Skeleton pose failed to start before the proxy deadline."),
      );
    }
    const outcomeUnknown = error instanceof AiRuntimeError && error.outcomeUnknown;
    if (!outcomeUnknown) refundCharge(access.charge?.entryId, "skeleton start failed");
    return poseError(error);
  }
}

async function statusPose(req: NextRequest, body: Record<string, unknown>) {
  const predictionId = typeof body.predictionId === "string" ? body.predictionId : "";
  const width = body.width;
  const height = body.height;
  if (!/^[a-z0-9]{8,80}$/i.test(predictionId)) {
    return invalidRequest("Invalid Skeleton prediction.");
  }
  if (!isPoseDimension(width) || !isPoseDimension(height) || width * height > 16_000_000) {
    return invalidRequest("Invalid Skeleton prediction.");
  }

  const access = requireEndUserCloudAi(req, true);
  if (!access.ok) return access.response;

  try {
    const ticket = await pollPoseSkeletonJob(
      access.replicateToken,
      predictionId,
      width,
      height,
      req.signal,
    );
    return jsonNoStore({
      predictionId: ticket.predictionId,
      status: ticket.status,
      ...(ticket.status === "succeeded" ? { poses: ticket.poses ?? [] } : {}),
    });
  } catch (error) {
    return poseError(error);
  }
}

async function cancelPose(req: NextRequest, body: Record<string, unknown>) {
  const predictionId = typeof body.predictionId === "string" ? body.predictionId : "";
  if (!/^[a-z0-9]{8,80}$/i.test(predictionId)) {
    return invalidRequest("Invalid Skeleton prediction.");
  }
  const access = requireEndUserCloudAi(req, true);
  if (!access.ok) return access.response;
  await cancelPoseSkeletonJob(access.replicateToken, predictionId);
  return jsonNoStore({ ok: true });
}

function isPoseDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4_096;
}

function invalidRequest(message: string, status = 400) {
  return jsonNoStore({ error: { code: "INVALID_INPUT", message } }, { status });
}

function poseError(error: unknown) {
  const normalized =
    error instanceof AiRuntimeError
      ? error
      : new AiRuntimeError("PROVIDER_UNAVAILABLE", "Skeleton pose failed.", { cause: error });
  const imageFailure = isPoseSkeletonImageFailureMessage(normalized.message);
  const reported = imageFailure
    ? new AiRuntimeError("INVALID_INPUT", normalized.message, {
        cause: normalized,
        provider: normalized.provider,
        predictionId: normalized.predictionId,
      })
    : normalized;
  return jsonNoStore(
    {
      error: {
        code: reported.outcomeUnknown ? "OUTCOME_UNKNOWN" : reported.code,
        message: reported.outcomeUnknown
          ? "AI provider result is uncertain; no duplicate request was created."
          : imageFailure
            ? "The pose model could not read this image. Use a JPEG, PNG, or WebP file."
            : publicErrorMessage(reported.code),
      },
    },
    { status: errorStatus(reported) },
  );
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
      return "Skeleton timed out. The pose model may still be starting; try again.";
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
