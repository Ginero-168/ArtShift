import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => ({ value: "r8_account-token" as string | undefined }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getAccountReplicateToken: () => tokenMock.value,
  getSessionReplicateToken: () => tokenMock.value,
}));

import { POST } from "../app/api/moodboard/expand/route";

const PACK = {
  keyword: "ice",
  associations: ["matcha glass ice", "snowman", "North Pole"],
  roles: {
    subject: [
      { label: "matcha ice", query: "matcha glass ice cubes", photoCount: 2 },
      { label: "snowman", query: "snowman close up", photoCount: 1 },
      { label: "iceberg", query: "arctic iceberg", photoCount: 1 },
      { label: "skater", query: "ice skater outdoors", photoCount: 1 },
      { label: "fisherman", query: "ice fishing", photoCount: 1 },
    ],
    setting: [
      { label: "North Pole", query: "north pole ice landscape", photoCount: 1 },
      { label: "cafe", query: "japanese cafe ice drink", photoCount: 1 },
      { label: "frozen lake", query: "frozen lake aerial", photoCount: 1 },
      { label: "glacier", query: "glacier blue ice cave", photoCount: 1 },
      { label: "snow street", query: "snow covered city street", photoCount: 1 },
    ],
    prop: [
      { label: "tongs", query: "ice tongs cocktail", photoCount: 1 },
      { label: "glass", query: "whiskey glass ice", photoCount: 1 },
      { label: "mittens", query: "wool mittens snow", photoCount: 1 },
      { label: "thermos", query: "thermos in snow", photoCount: 1 },
    ],
    mood: [
      { label: "crisp" },
      { label: "quiet" },
      { label: "crystalline" },
      { label: "bitter cold" },
      { label: "fresh" },
      { label: "still" },
    ],
    color: [
      { label: "ice blue", hex: "#93c5fd" },
      { label: "matcha", hex: "#65a30d" },
      { label: "frost", hex: "#e2e8f0" },
      { label: "ink", hex: "#0f172a" },
      { label: "amber", hex: "#f59e0b" },
    ],
  },
};

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Moodboard expand API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    tokenMock.value = "r8_account-token";
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: JSON.stringify(PACK) },
      metadata: { provider: "replicate", model: "mock", durationMs: 9, usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated requests before provider execution", async () => {
    accountMock.value = null;
    const response = await POST(request({ keyword: "Bangkok", cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects missing cloud consent", async () => {
    const response = await POST(request({ keyword: "Bangkok" }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("requires BYOK and does not fall back to a shared env token", async () => {
    tokenMock.value = undefined;
    const response = await POST(request({ keyword: "Bangkok", cloudConsent: true }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_AUTH" });
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("asks the LLM for JSON associations only — never image.generate", async () => {
    const response = await POST(request({ keyword: "ice", cloudConsent: true }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pack.keyword).toBe("ice");
    expect(body.pack.roles.subject.length).toBeGreaterThanOrEqual(5);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("stock-photo search query"),
        jsonObject: true,
      }),
      expect.objectContaining({
        cloudConsent: true,
        allowFallback: false,
        accountId: "account-test",
        reasoning: { mode: "off" },
      }),
    );
    expect(runtimeMock.execute.mock.calls.every((call) => call[0] !== "image.generate")).toBe(true);
  });

  it("parses fenced model output from assistant.chat text", async () => {
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: `Here is the pack\n\`\`\`json\n${JSON.stringify(PACK)}\n\`\`\``,
        assistantMessage: { role: "assistant", content: "" },
      },
      metadata: { provider: "replicate", model: "mock", durationMs: 9, usage: {}, warnings: [] },
    });
    const response = await POST(request({ keyword: "ice", cloudConsent: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).pack.keyword).toBe("ice");
  });

  it("returns a 502 with a truncated raw preview when chat text is not JSON", async () => {
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: "Sure, I expanded Bangkok into tuk-tuks and temples. r8_account-token should stay hidden.",
      },
      metadata: { provider: "replicate", model: "mock", durationMs: 4, usage: {}, warnings: [] },
    });
    const response = await POST(request({ keyword: "Bangkok", cloudConsent: true }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("PROVIDER_SCHEMA");
    expect(body.error.message).toContain("Expand response is not a JSON object.");
    expect(body.error.message).toContain("Raw preview:");
    expect(body.error.preview).toContain("tuk-tuks");
    expect(body.error.preview).not.toContain("r8_account-token");
    expect(body.error.preview).toContain("[redacted]");
  });
});
