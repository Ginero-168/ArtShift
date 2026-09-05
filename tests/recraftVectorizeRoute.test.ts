import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getSessionReplicateToken: () => undefined,
}));

import { POST } from "@/app/api/vectorize/recraft/route";

describe("Recraft vectorize API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { svg: '<svg viewBox="0 0 256 256"><path d="M0 0Z"/></svg>' },
      metadata: {
        provider: "replicate",
        model: "recraft-ai/recraft-vectorize",
        usage: {},
        warnings: [],
      },
    });
  });

  it("forwards only the fixed Recraft task and preserves the validated SVG response", async () => {
    const body = {
      task: "vectorize.recraft",
      input: { image: { dataUrl: "data:image/png;base64,AAAA" }, width: 256, height: 256 },
      options: { cloudConsent: true, provider: "pollinations", allowFallback: true },
    };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      execution: { output: { svg: expect.stringContaining("<svg") } },
    });
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "vectorize.recraft",
      body.input,
      expect.objectContaining({
        provider: "replicate",
        modelAlias: "recraft-vectorize",
        profile: "quality",
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("rejects oversized Recraft bodies before parsing or provider execution", async () => {
    const response = await POST(request({}, 8_000_000));

    expect(response.status).toBe(413);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects non-Recraft tasks on the dedicated endpoint", async () => {
    const response = await POST(request({ task: "vision.describe", input: {}, options: {} }));

    expect(response.status).toBe(400);
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
