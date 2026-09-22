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

import { POST } from "@/app/api/multi-angle/route";

const imageInput = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
  rotateDegrees: 24,
  moveForward: 3,
  verticalTilt: 1,
  useWideAngle: false,
  goFast: true,
  multipleAnglesStrength: 1,
};

describe("Multi-Angle API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    requireEndUserCloudAiMock.mockClear();
    runtimeMock.execute.mockResolvedValue({
      output: { dataUrl: "data:image/webp;base64,BBBB" },
      metadata: {
        provider: "replicate",
        model: "qwen/qwen-edit-multiangle",
        usage: {},
        warnings: [],
      },
    });
  });

  it("executes image.multiAngle with the BYOK token and returns a data URL", async () => {
    const response = await POST(
      request({
        task: "image.multiAngle",
        input: imageInput,
        options: { cloudConsent: true, provider: "openai", allowFallback: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      execution: { output: { dataUrl: "data:image/webp;base64,BBBB" } },
    });
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.multiAngle",
      expect.objectContaining({ rotateDegrees: 24, moveForward: 3, verticalTilt: 1 }),
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "qwen-edit-multiangle",
        profile: "quality",
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("rejects a Multi-Angle request without explicit cloud consent", async () => {
    const response = await POST(
      request({
        task: "image.multiAngle",
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
  return new Request("http://localhost/api/multi-angle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}
