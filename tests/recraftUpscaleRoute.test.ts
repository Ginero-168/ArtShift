import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getSessionReplicateToken: () => undefined,
}));

import { POST } from "@/app/api/upscale/recraft/route";

const imageInput = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
  width: 1024,
  height: 768,
};

describe("Recraft Crisp Upscale API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { dataUrl: "data:image/png;base64,BBBB" },
      metadata: {
        provider: "replicate",
        model: "recraft-ai/recraft-crisp-upscale",
        usage: {},
        warnings: [],
      },
    });
  });

  it("executes only the fixed Upscale task and returns the normalized image output", async () => {
    const body = {
      task: "image.upscale",
      input: imageInput,
      options: { cloudConsent: true, provider: "openai", allowFallback: true },
    };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      execution: { output: { dataUrl: "data:image/png;base64,BBBB" } },
    });
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.upscale",
      body.input,
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "recraft-crisp-upscale",
        profile: "quality",
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("rejects an Upscale request without explicit cloud consent before runtime execution", async () => {
    const response = await POST(
      request({ task: "image.upscale", input: imageInput, options: { allowFallback: false } }),
    );

    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("apiKey");
  });

  it("rejects non-Upscale tasks on the dedicated endpoint", async () => {
    const response = await POST(request({ task: "vectorize.recraft", input: {}, options: {} }));

    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before parsing or provider execution", async () => {
    const response = await POST(request({}, 8_000_000));

    expect(response.status).toBe(413);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});

function request(body: unknown, contentLength?: number): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(contentLength ?? bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}
