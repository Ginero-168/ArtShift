import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));
const replicateTokenMock = vi.hoisted(() => ({ value: "r8_test_token" as string | null }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getAccountReplicateToken: () => replicateTokenMock.value,
}));

import { POST as expandPost } from "../app/api/moodboard/expand/route";
import { POST as generatePost } from "../app/api/moodboard/generate/route";

function request(body: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Moodboard expand API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    replicateTokenMock.value = "r8_test_token";
    runtimeMock.execute.mockReset();
  });

  it("requires auth, consent, and BYOK", async () => {
    accountMock.value = null;
    const unauth = await expandPost(request({ keyword: "ice", count: 9, cloudConsent: true }));
    expect(unauth.status).toBe(401);

    accountMock.value = { id: "account-test" };
    const noConsent = await expandPost(request({ keyword: "ice", count: 9 }));
    expect(noConsent.status).toBe(403);

    replicateTokenMock.value = null;
    const noKey = await expandPost(request({ keyword: "ice", count: 9, cloudConsent: true }));
    expect(noKey.status).toBe(503);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("returns a parsed 9-prompt pack from assistant.chat", async () => {
    const pack = {
      keyword: "Bangkok",
      prompts: Array.from({ length: 9 }, (_, i) => ({
        index: i + 1,
        subject: `s${i}`,
        setting: `set${i}`,
        prop: `p${i}`,
        mood: `m${i}`,
        colorStyle: `c${i}`,
        prompt: `Distinct Bangkok frame ${i + 1}`,
      })),
    };
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: JSON.stringify(pack),
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: JSON.stringify(pack) },
        toolCalls: [],
      },
      metadata: { model: "google/gemini-3-flash", provider: "replicate", warnings: [] },
    });

    const response = await expandPost(
      request({ keyword: "Bangkok", count: 9, cloudConsent: true }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pack.prompts).toHaveLength(9);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("EXACTLY 9"),
        maxTokens: 4096,
      }),
      expect.objectContaining({
        cloudConsent: true,
        modelAlias: "creative-director",
        reasoning: { mode: "off" },
      }),
    );
  });
});

describe("Moodboard expand batch counts", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    replicateTokenMock.value = "r8_test_token";
    runtimeMock.execute.mockReset();
  });

  it("rejects a batch count outside 9, 16, and 25", async () => {
    const response = await expandPost(
      request({ keyword: "Bangkok", count: 8, cloudConsent: true }),
    );
    expect(response.status).toBe(400);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("asks Gemini Flash for exactly 16 ideas when that count is selected", async () => {
    const pack = {
      keyword: "Bangkok",
      prompts: Array.from({ length: 16 }, (_, i) => ({
        index: i + 1,
        subject: `s${i}`,
        setting: `set${i}`,
        prop: `p${i}`,
        mood: `m${i}`,
        colorStyle: `c${i}`,
        prompt: `Distinct Bangkok frame ${i + 1}`,
      })),
    };
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: JSON.stringify(pack),
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: JSON.stringify(pack) },
        toolCalls: [],
      },
      metadata: { model: "google/gemini-3-flash", provider: "replicate", warnings: [] },
    });

    const response = await expandPost(
      request({ keyword: "Bangkok", count: 16, cloudConsent: true }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(16);
    expect(body.pack.prompts).toHaveLength(16);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("EXACTLY 16"),
        maxTokens: 6144,
      }),
      expect.objectContaining({ modelAlias: "creative-director" }),
    );
  });
});

describe("Moodboard generate API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    replicateTokenMock.value = "r8_test_token";
    runtimeMock.execute.mockReset();
  });

  it("generates one Flare medium image per idea", async () => {
    runtimeMock.execute.mockResolvedValue({
      output: {
        dataUrl: "data:image/webp;base64,AAAA",
        prompt: "test",
        width: 1024,
        height: 1024,
        seed: 0,
      },
      metadata: {
        provider: "replicate",
        model: "openai/gpt-image-2.5-flare",
        warnings: [],
      },
    });

    const response = await generatePost(
      request({ prompt: "humid neon night market", index: 3, cloudConsent: true }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.defaultModel).toBe("openai/gpt-image-2.5-flare");
    expect(body.quality).toBe("medium");
    expect(body.aspectRatio).toBe("1:1");
    expect(body.estimatedUsd).toBe(0.047);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "image.generate",
      expect.objectContaining({
        modelAlias: "gpt-image-2.5-flare",
        quality: "medium",
        aspectRatio: "1:1",
        enhance: false,
      }),
      expect.objectContaining({
        modelAlias: "gpt-image-2.5-flare",
        provider: "replicate",
        allowFallback: false,
        cloudConsent: true,
      }),
    );
  });

  it("does not fall back to a shared server token", async () => {
    replicateTokenMock.value = null;
    const response = await generatePost(request({ prompt: "test", cloudConsent: true }));
    expect(response.status).toBe(503);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });
});
