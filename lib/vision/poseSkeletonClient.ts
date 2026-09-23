import { DEFAULT_YOLO_POSE_MODEL_SIZE, type YoloPoseModelSize } from "@/lib/ai-runtime/contracts";
import {
  POSE_SKELETON_PROCESSING_MESSAGE,
  POSE_SKELETON_STARTING_MESSAGE,
} from "@/lib/vision/poseSkeleton";

/** Short status calls. A cold CPU boot can outlast one proxy connection. */
export const POSE_SKELETON_POLL_INTERVAL_MS = 2_000;
/** Above a typical Replicate CPU cold start, under the prediction Cancel-After. */
export const POSE_SKELETON_MAX_WAIT_MS = 240_000;
const MAX_TRANSIENT_POLLS = 4;

export type PoseSkeletonRequestInput = {
  dataUrl: string;
  mimeType?: string;
  width: number;
  height: number;
  modelSize?: YoloPoseModelSize;
};

export class PoseSkeletonRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PoseSkeletonRequestError";
    this.code = code;
  }
}

type PoseSkeletonResponse = {
  predictionId?: string;
  status?: string;
  poses?: unknown;
  error?: { message?: unknown; code?: unknown } | string;
  code?: unknown;
};

/**
 * Start a YOLO26 pose prediction, then poll until it finishes.
 * Each request stays short so a cold start is not reported as a dropped connection.
 */
export async function requestPoseSkeleton(
  input: PoseSkeletonRequestInput,
  options: {
    signal: AbortSignal;
    onProgress?: (message: string) => void;
    fetchImpl?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  },
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? delay;
  const maxWaitMs = options.maxWaitMs ?? POSE_SKELETON_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POSE_SKELETON_POLL_INTERVAL_MS;
  const startedAt = now();
  let predictionId: string | undefined;
  const onAbort = () => {
    if (!predictionId) return;
    void fetchImpl("/api/skeleton", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ action: "cancel", predictionId }),
      keepalive: true,
    }).catch(() => undefined);
  };
  options.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const started = await postSkeleton(
      fetchImpl,
      {
        action: "start",
        task: "image.poseSkeleton",
        input: {
          image: {
            dataUrl: input.dataUrl,
            ...(input.mimeType ? { mimeType: input.mimeType } : {}),
          },
          width: input.width,
          height: input.height,
          modelSize: input.modelSize ?? DEFAULT_YOLO_POSE_MODEL_SIZE,
        },
        options: {
          profile: "quality",
          provider: "replicate",
          modelAlias: "yolo26-pose",
          cloudConsent: true,
          allowFallback: false,
          cache: false,
        },
      },
      options.signal,
    );
    if (started.status === "succeeded") return started.poses ?? [];
    predictionId = requirePredictionId(started.predictionId);
    const overBudget = () => now() - startedAt >= maxWaitMs;
    const timeoutError = () =>
      new PoseSkeletonRequestError(
        "TIMEOUT",
        "Skeleton timed out while the pose model was still starting.",
      );
    let phase: "starting" | "processing" =
      started.status === "processing" ? "processing" : "starting";
    let transientFailures = 0;
    while (true) {
      options.onProgress?.(
        phase === "processing" ? POSE_SKELETON_PROCESSING_MESSAGE : POSE_SKELETON_STARTING_MESSAGE,
      );
      if (overBudget()) {
        onAbort();
        throw timeoutError();
      }
      let polled: PoseSkeletonResponse;
      try {
        polled = await postSkeleton(
          fetchImpl,
          {
            action: "status",
            predictionId,
            width: input.width,
            height: input.height,
          },
          options.signal,
        );
        transientFailures = 0;
      } catch (error) {
        if (isAbort(error) || options.signal.aborted) throw error;
        if (!isTransientPollError(error) || transientFailures >= MAX_TRANSIENT_POLLS) throw error;
        transientFailures += 1;
        await sleep(pollIntervalMs, options.signal);
        continue;
      }
      if (polled.status === "succeeded") return polled.poses ?? [];
      phase = polled.status === "processing" ? "processing" : "starting";
      if (overBudget()) {
        onAbort();
        throw timeoutError();
      }
      await sleep(
        Math.min(pollIntervalMs, Math.max(0, maxWaitMs - (now() - startedAt))),
        options.signal,
      );
    }
  } finally {
    options.signal.removeEventListener("abort", onAbort);
  }
}

async function postSkeleton(
  fetchImpl: typeof fetch,
  body: unknown,
  signal: AbortSignal,
): Promise<PoseSkeletonResponse> {
  let response: Response;
  try {
    response = await fetchImpl("/api/skeleton", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbort(error) || signal.aborted) throw error;
    throw new PoseSkeletonRequestError(
      "PROVIDER_UNAVAILABLE",
      "Skeleton request failed before the server responded.",
    );
  }
  const payload = (await response.json().catch(() => null)) as PoseSkeletonResponse | null;
  if (!response.ok) throw skeletonRequestError(payload, response.status);
  return payload ?? {};
}

function requirePredictionId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9]{8,80}$/i.test(value)) {
    throw new PoseSkeletonRequestError(
      "PROVIDER_SCHEMA",
      "Skeleton did not return a prediction id.",
    );
  }
  return value;
}

function skeletonRequestError(payload: unknown, status: number): PoseSkeletonRequestError {
  const record = payload && typeof payload === "object" ? (payload as PoseSkeletonResponse) : {};
  if (typeof record.code === "string") {
    const message = typeof record.error === "string" ? record.error : "Skeleton request failed.";
    return new PoseSkeletonRequestError(record.code, message);
  }
  const nested = record.error;
  if (typeof nested === "string")
    return new PoseSkeletonRequestError("PROVIDER_UNAVAILABLE", nested);
  if (nested && typeof nested === "object") {
    return new PoseSkeletonRequestError(
      typeof nested.code === "string" ? nested.code : "PROVIDER_UNAVAILABLE",
      typeof nested.message === "string" ? nested.message : "Skeleton request failed.",
    );
  }
  return new PoseSkeletonRequestError(
    "PROVIDER_UNAVAILABLE",
    `Skeleton request failed (${status}).`,
  );
}

function isTransientPollError(error: unknown): boolean {
  if (!(error instanceof PoseSkeletonRequestError)) return true;
  return error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_RATE_LIMIT";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
