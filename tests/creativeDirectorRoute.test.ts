import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreativeDirectorValidationError } from "@/lib/ai/orchestration/creativeDirector";

const prepareMock = vi.hoisted(() => vi.fn());
const reviewMock = vi.hoisted(() => vi.fn());
const accountMock = vi.hoisted(() => ({ value: { id: "account-1" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => vi.fn(() => "configured"));
const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/ai/orchestration/creativeDirector", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/orchestration/creativeDirector")>(
    "@/lib/ai/orchestration/creativeDirector",
  );
  return {
    ...actual,
    prepareCreativeDirection: prepareMock,
    reviewCreativeOutput: reviewMock,
  };
});
vi.mock("@/lib/server/ai/runtime", () => ({ getServerAiRuntime: () => runtimeMock }));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: tokenMock,
}));

import { POST as REVIEW_POST } from "../app/api/ai/director/review/route";
import { POST } from "../app/api/ai/director/route";

const body = {
  prompt: "สร้างภาพโฆษณาขวดเซรั่มแบบ studio สำหรับ Instagram 1:1",
  canvasSummary: { objectCount: 2, selectedCount: 0, width: 1080, height: 1080 },
  referenceAnalyses: [],
  cloudConsent: true,
};

function request(value: unknown, contentLength?: number): NextRequest {
  return {
    headers: new Headers(
      contentLength === undefined ? undefined : { "content-length": String(contentLength) },
    ),
    json: async () => value,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Creative Director route", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-1" };
    prepareMock.mockReset();
    reviewMock.mockReset();
    prepareMock.mockResolvedValue({
      kind: "image-task",
      outputCount: 1,
      summary: "Premium serum",
      refinedPrompt: "Premium serum bottle product photograph",
      specialist: "image_generator",
      capability: "IMAGE_DEFAULT",
      modelAlias: "image-gpt-2",
      knowledgeSkillIds: ["product-image"],
      reviewCriteria: ["clear product"],
      search: { required: false, queries: [], sources: [] },
    });
    reviewMock.mockResolvedValue({
      passed: true,
      summary: "Matches the approved direction.",
    });
  });

  it("rejects unauthenticated requests", async () => {
    accountMock.value = null;
    const response = await POST(request(body));
    expect(response.status).toBe(401);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("rejects missing cloud consent", async () => {
    const response = await POST(request({ ...body, cloudConsent: false }));
    expect(response.status).toBe(403);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("rejects raw image payloads before calling the brain", async () => {
    const response = await POST(
      request({ ...body, referenceAnalyses: [{ caption: "data:image/png;base64,AAAA" }] }),
    );
    expect(response.status).toBe(400);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("uses server-owned capabilities and the authenticated 120B runtime", async () => {
    const response = await POST(request({ ...body, availableCapabilities: ["FLUX_UNKNOWN"] }));
    expect(response.status).toBe(200);
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: body.prompt,
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
        cloudConsent: true,
        accountId: "account-1",
      }),
      expect.objectContaining({
        execute: expect.any(Function),
        searchImages: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("distinguishes a rejected Director plan from provider unavailability safely", async () => {
    prepareMock.mockRejectedValue(new CreativeDirectorValidationError());
    const response = await POST(request(body));
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload.code).toBe("DIRECTOR_INVALID_PLAN");
    expect(payload.error).toContain("ยังไม่ได้สร้าง Task");
    expect(payload.error).not.toContain("temporarily unavailable");
  });

  it("redacts provider errors", async () => {
    prepareMock.mockRejectedValue(
      new Error("https://replicate.delivery/private?token=DO_NOT_LEAK"),
    );
    const response = await POST(request(body));
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload.error).toBe("Creative Director is temporarily unavailable.");
    expect(JSON.stringify(payload)).not.toContain("DO_NOT_LEAK");
  });

  it("reviews only bounded local Vision evidence after consent", async () => {
    const response = await REVIEW_POST(
      request({
        prompt: "Premium serum campaign image",
        reviewCriteria: ["product is visually dominant"],
        outputAnalysis: {
          caption: "a serum bottle in a studio",
          objects: ["serum bottle"],
          visibleText: "",
          limitations: [],
        },
        cloudConsent: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(reviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "account-1", cloudConsent: true }),
      expect.objectContaining({ execute: expect.any(Function) }),
    );
  });
});
