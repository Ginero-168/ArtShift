import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOODBOARD_IMAGE_MODEL_ALIAS,
  MOODBOARD_REPLICATE_IMAGE_MODEL,
} from "@/lib/moodboard/constants";

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
  getAccountReplicateToken: () => "account-replicate-token",
  getSessionReplicateToken: () => "account-replicate-token",
}));
vi.mock("@/lib/server/ai/endUserCloudGuard", () => ({
  requireEndUserCloudAi: requireEndUserCloudAiMock,
}));

import { POST } from "@/app/api/moodboard/generate/route";

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Moodboard generate API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    requireEndUserCloudAiMock.mockClear();
    runtimeMock.execute.mockResolvedValue({
      output: {
        dataUrl: "data:image/webp;base64,AAAA",
        prompt: "ice still",
        width: 1024,
        height: 1024,
        seed: 0,
      },
      metadata: {
        provider: "replicate",
        model: MOODBOARD_REPLICATE_IMAGE_MODEL,
        usage: {},
        warnings: [],
      },
    });
  });

  it("generates one flux-schnell image with BYOK + consent", async () => {
    const response = await POST(
      request({ prompt: "Distinct ice moodboard still", cloudConsent: true }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const json = await response.json();
    expect(json.model).toBe(MOODBOARD_REPLICATE_IMAGE_MODEL);
    expect(json.execution.output.dataUrl).toContain("data:image/");
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.objectContaining({
        prompt: "Distinct ice moodboard still",
        modelAlias: MOODBOARD_IMAGE_MODEL_ALIAS,
        enhance: false,
        aspectRatio: "1:1",
      }),
      expect.objectContaining({
        provider: "replicate",
        modelAlias: MOODBOARD_IMAGE_MODEL_ALIAS,
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("rejects missing consent before execute", async () => {
    requireEndUserCloudAiMock.mockReturnValueOnce({
      ok: false as const,
      response: Response.json(
        {
          error: "Explicit cloud consent is required before this AI operation.",
          code: "POLICY_DENIED",
        },
        { status: 403 },
      ),
    });
    const response = await POST(request({ prompt: "ice" }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});
