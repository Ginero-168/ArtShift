import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: anthropicMock.create };
  },
}));

import { POST } from "../app/api/ai/image/route";

const imageBuffer = new Uint8Array(1001).buffer;

function request(body: Record<string, unknown>): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

function stubImageFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "image/jpeg" },
    arrayBuffer: async () => imageBuffer,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AI image generation API", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    anthropicMock.create.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("honors enhance=false without calling the prompt LLM", async () => {
    const fetchMock = stubImageFetch();

    const response = await POST(
      request({ prompt: "แมวสีส้ม", enhance: false, width: 512, height: 512 }),
    );

    expect(response.status).toBe(200);
    expect(anthropicMock.create).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain("enhance=false");
  });

  it("uses the documented Sonnet default for prompt enhancement", async () => {
    const fetchMock = stubImageFetch();
    anthropicMock.create.mockResolvedValue({
      content: [{ type: "text", text: "A highly detailed orange cat" }],
    });

    const response = await POST(request({ prompt: "แมวสีส้ม", enhance: true }));

    expect(response.status).toBe(200);
    expect(anthropicMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-5" }),
    );
    expect(fetchMock.mock.calls[0][0]).toContain("A%20highly%20detailed%20orange%20cat");
  });

  it("falls back to local enrichment when prompt enhancement fails", async () => {
    const fetchMock = stubImageFetch();
    anthropicMock.create.mockRejectedValueOnce(new Error("upstream unavailable"));

    const response = await POST(request({ prompt: "แมวสีส้ม", enhance: true }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.prompt).toContain("cat");
    expect(fetchMock).toHaveBeenCalled();
  });
});
