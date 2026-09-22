import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOODBOARD_IMAGE_COUNT } from "@/lib/moodboard/constants";

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
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getAccountReplicateToken: () => "account-replicate-token",
  getSessionReplicateToken: () => "account-replicate-token",
}));
vi.mock("@/lib/server/ai/endUserCloudGuard", () => ({
  requireEndUserCloudAi: requireEndUserCloudAiMock,
}));

import { POST } from "@/app/api/moodboard/expand/route";

const PACK = {
  keyword: "ice",
  associations: ["matcha glass ice", "snowman", "North Pole"],
  roles: {
    subject: [
      { label: "matcha ice", query: "matcha glass ice cubes" },
      { label: "snowman", query: "snowman close up" },
      { label: "iceberg", query: "arctic iceberg" },
      { label: "skater", query: "ice skater outdoors" },
      { label: "fisherman", query: "ice fishing" },
    ],
    setting: [
      { label: "North Pole", query: "north pole ice landscape" },
      { label: "cafe", query: "japanese cafe ice drink" },
      { label: "frozen lake", query: "frozen lake aerial" },
      { label: "glacier", query: "glacier blue ice cave" },
      { label: "snow street", query: "snow covered city street" },
    ],
    prop: [
      { label: "tongs", query: "ice tongs cocktail" },
      { label: "glass", query: "whiskey glass ice" },
      { label: "mittens", query: "wool mittens snow" },
      { label: "thermos", query: "thermos in snow" },
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
  imagePrompts: Array.from({ length: 9 }, (_, index) => ({
    label: `ice ${index + 1}`,
    role: "subject",
    prompt: `Distinct ice moodboard still ${index + 1}`,
  })),
};

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Moodboard expand API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    runtimeMock.execute.mockReset();
    requireEndUserCloudAiMock.mockClear();
    requireEndUserCloudAiMock.mockImplementation((_req, cloudConsent) => {
      if (!accountMock.value) {
        return {
          ok: false as const,
          response: Response.json(
            { error: "Authentication is required for AI execution.", code: "AUTH_REQUIRED" },
            { status: 401 },
          ),
        };
      }
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
        account: accountMock.value,
        replicateToken: "account-replicate-token",
      };
    });
    runtimeMock.execute.mockResolvedValue({
      output: { text: JSON.stringify(PACK) },
      metadata: { provider: "replicate", model: "mock", durationMs: 9, usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated requests before provider execution", async () => {
    accountMock.value = null;
    requireEndUserCloudAiMock.mockReturnValueOnce({
      ok: false as const,
      response: Response.json(
        { error: "Authentication is required for AI execution.", code: "AUTH_REQUIRED" },
        { status: 401 },
      ),
    });
    const response = await POST(request({ keyword: "Bangkok", cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects missing cloud consent", async () => {
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
    const response = await POST(request({ keyword: "Bangkok" }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("requires BYOK via requireEndUserCloudAi and never calls image.generate", async () => {
    const response = await POST(request({ keyword: "ice", cloudConsent: true }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.pack.imagePrompts).toHaveLength(MOODBOARD_IMAGE_COUNT);
    expect(requireEndUserCloudAiMock).toHaveBeenCalledWith(expect.anything(), true);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("imagePrompts"),
        maxTokens: expect.any(Number),
      }),
      expect.objectContaining({ cloudConsent: true, allowFallback: false }),
    );
    expect(runtimeMock.execute.mock.calls.every((call) => call[0] === "assistant.chat")).toBe(true);
  });
});
