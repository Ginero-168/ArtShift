import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));

import { POST } from "../app/api/ai/image/route";

function request(body: Record<string, unknown>): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

const imageExecution = {
  output: {
    dataUrl: "data:image/png;base64,AAAA",
    prompt: "A highly detailed orange cat",
    width: 512,
    height: 512,
    seed: 42,
  },
  metadata: {
    provider: "pollinations",
    model: "flux",
    usage: {},
    warnings: [],
  },
};

describe("AI image generation API", () => {
  beforeEach(() => {
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue(imageExecution);
  });

  it("honors enhance=false without calling the prompt task", async () => {
    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: false, width: 512, height: 512 }),
    );

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledTimes(1);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.objectContaining({ prompt: "แมวสีส้ม", width: 512, height: 512 }),
      expect.objectContaining({ allowFallback: false }),
    );
  });

  it("routes prompt enhancement and image generation through the AI Runtime", async () => {
    runtimeMock.execute
      .mockResolvedValueOnce({ output: { prompt: "A highly detailed orange cat" } })
      .mockResolvedValueOnce(imageExecution);

    const response = await POST(request({ prompt: "แมวสีส้ม", enhance: true }));

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      1,
      "prompt.enhance",
      expect.objectContaining({ purpose: "image" }),
      expect.objectContaining({ cloudConsent: true, allowFallback: false }),
    );
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      2,
      "image.generate",
      expect.objectContaining({ prompt: "A highly detailed orange cat" }),
      expect.objectContaining({ allowFallback: false }),
    );
  });

  it("uses local prompt enrichment when the cloud prompt task is unavailable", async () => {
    runtimeMock.execute
      .mockRejectedValueOnce(new Error("prompt provider unavailable"))
      .mockResolvedValueOnce(imageExecution);

    const response = await POST(request({ prompt: "แมวสีส้ม", enhance: true }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenNthCalledWith(
      2,
      "image.generate",
      expect.objectContaining({ prompt: expect.stringContaining("cat") }),
      expect.any(Object),
    );
    expect(data.warnings).toContain(
      "Cloud prompt enhancement was unavailable; local enrichment was used.",
    );
  });
});
