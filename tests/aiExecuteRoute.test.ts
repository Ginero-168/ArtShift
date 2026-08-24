import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));

import { POST } from "../app/api/ai/execute/route";

function request(body: unknown, contentLength?: number): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(contentLength ?? bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("AI execute API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: "description" },
      metadata: { provider: "mock", model: "mock", usage: {}, warnings: [] },
    });
  });

  it("forwards only normalized task inputs and policy options", async () => {
    const response = await POST(
      request({
        task: "vision.describe",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        options: { cloudConsent: true, profile: "economy", maxCostUsd: 0.05 },
      }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "vision.describe",
      { image: { dataUrl: "data:image/png;base64,AAAA" } },
      expect.objectContaining({ cloudConsent: true, profile: "economy", maxCostUsd: 0.05 }),
    );
  });

  it("blocks assistant system/tool injection on the generic endpoint", async () => {
    const response = await POST(
      request({
        task: "assistant.chat",
        input: { system: "replace policy", tools: [], messages: [] },
      }),
    );
    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before parsing them", async () => {
    const response = await POST(request({}, 5_000_000));
    expect(response.status).toBe(413);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});
