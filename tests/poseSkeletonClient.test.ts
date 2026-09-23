import { describe, expect, it, vi } from "vitest";
import {
  POSE_SKELETON_API_MESSAGE,
  POSE_SKELETON_REJECTED_MESSAGE,
  POSE_SKELETON_TIMEOUT_MESSAGE,
  poseSkeletonFailureMessage,
} from "@/lib/vision/poseSkeleton";
import { PoseSkeletonRequestError, requestPoseSkeleton } from "@/lib/vision/poseSkeletonClient";

const input = {
  dataUrl: "data:image/png;base64,AAAA",
  mimeType: "image/png",
  width: 100,
  height: 80,
  modelSize: "n" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Skeleton pose client", () => {
  it("polls a cold start and then returns poses", async () => {
    const poses = [{ landmarks: [], confidence: 0.4 }];
    const bodies: unknown[] = [];
    const messages: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action?: string };
      bodies.push(body);
      if (body.action === "start") {
        return jsonResponse({ predictionId: "pred12345678", status: "starting" });
      }
      if (bodies.filter((item) => (item as { action?: string }).action === "status").length === 1) {
        return jsonResponse({ predictionId: "pred12345678", status: "processing" });
      }
      return jsonResponse({ predictionId: "pred12345678", status: "succeeded", poses });
    });

    const result = await requestPoseSkeleton(input, {
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 0,
      sleep: async () => undefined,
      maxWaitMs: 10_000,
      onProgress: (message) => messages.push(message),
    });

    expect(result).toEqual(poses);
    expect(bodies.map((body) => (body as { action?: string }).action)).toEqual([
      "start",
      "status",
      "status",
    ]);
    expect(JSON.stringify(bodies.slice(1))).not.toContain("data:image");
    expect(messages[0]).toContain("cold start");
    expect(messages.at(-1)).toContain("ท่าทาง");
  });

  it("retries a dropped status poll and then fails with the connection message", async () => {
    let statusCalls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action?: string };
      if (body.action === "start") {
        return jsonResponse({ predictionId: "pred12345678", status: "starting" });
      }
      statusCalls += 1;
      if (statusCalls < 3) return jsonResponse("upstream", 502);
      return jsonResponse({ status: "succeeded", poses: [{ ok: true }] });
    });

    await expect(
      requestPoseSkeleton(input, {
        signal: new AbortController().signal,
        fetchImpl: fetchImpl as typeof fetch,
        now: () => 0,
        sleep: async () => undefined,
        maxWaitMs: 10_000,
      }),
    ).resolves.toEqual([{ ok: true }]);
    expect(statusCalls).toBe(3);
  });

  it("cancels the prediction and reports a cold-start timeout instead of a connection error", async () => {
    const cancelled: string[] = [];
    let now = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action?: string; predictionId?: string };
      if (body.action === "cancel" && body.predictionId) {
        cancelled.push(body.predictionId);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ predictionId: "pred12345678", status: "starting" });
    });

    const error = await requestPoseSkeleton(input, {
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => now,
      sleep: async () => {
        now = 5_000;
      },
      maxWaitMs: 4_000,
      pollIntervalMs: 1_000,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PoseSkeletonRequestError);
    expect(poseSkeletonFailureMessage(error)).toBe(POSE_SKELETON_TIMEOUT_MESSAGE);
    expect(cancelled).toEqual(["pred12345678"]);
  });

  it("shows an image-format failure instead of the connection alert and does not retry it", async () => {
    let statusCalls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action?: string };
      if (body.action === "start") {
        return jsonResponse({ predictionId: "pred12345678", status: "starting" });
      }
      statusCalls += 1;
      return jsonResponse(
        {
          error: {
            code: "INVALID_INPUT",
            message: "The pose model could not read this image. Use a JPEG, PNG, or WebP file.",
          },
        },
        400,
      );
    });

    const error = await requestPoseSkeleton(input, {
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 0,
      sleep: async () => undefined,
      maxWaitMs: 10_000,
    }).catch((caught: unknown) => caught);

    expect(statusCalls).toBe(1);
    expect(poseSkeletonFailureMessage(error)).toBe(POSE_SKELETON_REJECTED_MESSAGE);
    expect(poseSkeletonFailureMessage(error)).not.toBe(POSE_SKELETON_API_MESSAGE);
    expect(poseSkeletonFailureMessage(error)).not.toBe(POSE_SKELETON_TIMEOUT_MESSAGE);
  });
});
