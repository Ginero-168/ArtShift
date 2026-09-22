import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
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

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
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
    runtimeMock.execute.mockReset();
    requireEndUserCloudAiMock.mockClear();
    runtimeMock.execute.mockResolvedValue({
      output: { poses: [] },
      metadata: {
        provider: "replicate",
        model: "ultralytics/yolo26-pose",
        usage: {},
        warnings: [],
      },
    });
  });

  it("executes image.poseSkeleton with the BYOK token and returns poses", async () => {
    const response = await POST(
      request({
        task: "image.poseSkeleton",
        input: imageInput,
        options: { cloudConsent: true, provider: "openai", allowFallback: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      execution: { output: { poses: [] } },
    });
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.poseSkeleton",
      expect.objectContaining({ width: 1024, height: 768, modelSize: "n" }),
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "yolo26-pose",
        profile: "quality",
        allowFallback: false,
        cloudConsent: true,
        maxCostUsd: 0.02,
      }),
    );
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
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects other tasks on the dedicated endpoint", async () => {
    const response = await POST(request({ task: "image.upscale", input: {}, options: {} }));

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/skeleton", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}
