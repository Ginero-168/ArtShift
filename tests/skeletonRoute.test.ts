import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";

const jobMock = vi.hoisted(() => ({
  startPoseSkeletonJob: vi.fn(),
  pollPoseSkeletonJob: vi.fn(),
  cancelPoseSkeletonJob: vi.fn(),
}));
const requireEndUserCloudAiMock = vi.hoisted(() =>
  vi.fn((_req: NextRequest, cloudConsent: unknown) => {
    if (cloudConsent !== true) {
      return {
        ok: false as const,
        response: Response.json(
          {
            error: "Explicit cloud consent is required before this AI operation.",
            code: "POLICY_DENIED",
          },
          { status: 403 },
        ),
      };
    }
    return {
      ok: true as const,
      account: { id: "account-test" },
      replicateToken: "account-replicate-token",
    };
  }),
);

vi.mock("@/lib/server/ai/poseSkeletonJob", () => jobMock);
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => ({ id: "account-test" }),
  getSessionReplicateToken: () => "account-replicate-token",
  getAccountReplicateToken: () => "account-replicate-token",
}));
vi.mock("@/lib/server/ai/endUserCloudGuard", () => ({
  requireEndUserCloudAi: requireEndUserCloudAiMock,
}));

import { POST } from "@/app/api/skeleton/route";

const imageInput = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
  modelSize: "n",
};

describe("Skeleton API", () => {
  beforeEach(() => {
    jobMock.startPoseSkeletonJob.mockReset();
    jobMock.pollPoseSkeletonJob.mockReset();
    jobMock.cancelPoseSkeletonJob.mockReset();
    requireEndUserCloudAiMock.mockClear();
    jobMock.startPoseSkeletonJob.mockResolvedValue({
      predictionId: "pred12345678",
      status: "starting",
    });
    jobMock.pollPoseSkeletonJob.mockResolvedValue({
      predictionId: "pred12345678",
      status: "succeeded",
      poses: [],
    });
  });

  it("starts image.poseSkeleton with the BYOK token and returns the prediction id", async () => {
    const response = await POST(
      request({
        action: "start",
        task: "image.poseSkeleton",
        input: imageInput,
        options: { cloudConsent: true, provider: "replicate", allowFallback: false },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      predictionId: "pred12345678",
      status: "starting",
    });
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(jobMock.startPoseSkeletonJob).toHaveBeenCalledWith(
      "account-replicate-token",
      expect.objectContaining({ width: 1024, height: 768, modelSize: "n" }),
      expect.any(AbortSignal),
    );
    expect(jobMock.pollPoseSkeletonJob).not.toHaveBeenCalled();
  });

  it("returns poses from one status poll without uploading the image again", async () => {
    const response = await POST(
      request({ action: "status", predictionId: "pred12345678", width: 1024, height: 768 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      predictionId: "pred12345678",
      status: "succeeded",
      poses: [],
    });
    expect(jobMock.pollPoseSkeletonJob).toHaveBeenCalledWith(
      "account-replicate-token",
      "pred12345678",
      1024,
      768,
      expect.any(AbortSignal),
    );
    expect(jobMock.startPoseSkeletonJob).not.toHaveBeenCalled();
  });

  it("rejects a Skeleton request without explicit cloud consent", async () => {
    const response = await POST(
      request({
        task: "image.poseSkeleton",
        input: imageInput,
        options: { allowFallback: false },
      }),
    );

    expect(response.status).toBe(403);
    expect(jobMock.startPoseSkeletonJob).not.toHaveBeenCalled();
  });

  it("maps a YOLO unreadable-file failure to an image error, not a 502 outage", async () => {
    jobMock.pollPoseSkeletonJob.mockRejectedValue(
      new AiRuntimeError(
        "PROVIDER_UNAVAILABLE",
        "No images or videos found in /tmp/tmprke_wtyzfile. Supported formats are:",
        { provider: "replicate" },
      ),
    );

    const response = await POST(
      request({ action: "status", predictionId: "pred12345678", width: 1024, height: 768 }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "The pose model could not read this image. Use a JPEG, PNG, or WebP file.",
      },
    });
  });

  it("rejects other tasks on the dedicated endpoint", async () => {
    const response = await POST(request({ task: "image.upscale", input: {}, options: {} }));

    expect(response.status).toBe(400);
    expect(jobMock.startPoseSkeletonJob).not.toHaveBeenCalled();
  });
});

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/skeleton", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}
