import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const requireEndUserCloudAiMock = vi.hoisted(() =>
  vi.fn((req: NextRequest, cloudConsent: unknown) => {
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

import { POST } from "@/app/api/layer/decompose/route";

const imageInput = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
  numLayers: 4,
};

describe("Layer decompose API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    requireEndUserCloudAiMock.mockClear();
    runtimeMock.execute.mockResolvedValue({
      output: {
        layers: [
          { dataUrl: "data:image/png;base64,BBBB" },
          { dataUrl: "data:image/png;base64,CCCC" },
          { dataUrl: "data:image/png;base64,DDDD" },
          { dataUrl: "data:image/png;base64,EEEE" },
        ],
      },
      metadata: {
        provider: "replicate",
        model: "qwen/qwen-image-layered",
        usage: {},
        warnings: [],
      },
    });
  });

  it("executes image.decomposeLayers with BYOK token and returns layer data URLs", async () => {
    const body = {
      task: "image.decomposeLayers",
      input: imageInput,
      options: { cloudConsent: true, provider: "openai", allowFallback: true },
    };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      execution: {
        output: {
          layers: [
            { dataUrl: "data:image/png;base64,BBBB" },
            { dataUrl: "data:image/png;base64,CCCC" },
            { dataUrl: "data:image/png;base64,DDDD" },
            { dataUrl: "data:image/png;base64,EEEE" },
          ],
        },
      },
    });
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.decomposeLayers",
      expect.objectContaining({ numLayers: 4 }),
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "qwen-image-layered",
        profile: "quality",
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("rejects a Layer request without explicit cloud consent before runtime execution", async () => {
    const response = await POST(
      request({
        task: "image.decomposeLayers",
        input: imageInput,
        options: { allowFallback: false },
      }),
    );

    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects non-Layer tasks on the dedicated endpoint", async () => {
    const response = await POST(request({ task: "image.upscale", input: {}, options: {} }));

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/layer/decompose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}
