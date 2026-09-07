import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareDesignTurnMock = vi.hoisted(() => vi.fn());
const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => vi.fn(() => "configured"));

vi.mock("@/lib/designAgent/server", () => ({
  prepareDesignTurn: prepareDesignTurnMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: tokenMock,
}));

import { POST } from "../app/api/design-agent/route";

function request(body: unknown, contentLength?: number): NextRequest {
  return {
    headers: new Headers(
      contentLength === undefined ? undefined : { "content-length": String(contentLength) },
    ),
    json: async () => body,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

const validBody = {
  messages: [{ role: "user", content: "ช่วยจัด Layout ให้เหมาะกับงานนี้" }],
  context: {
    docId: "doc-1",
    baseRevision: 1,
    artworkId: "slide-1",
    artworkWidth: 1920,
    artworkHeight: 1080,
    hasSelection: false,
    selectedObjectIds: [],
    snapshot: {},
  },
};

describe("Design Agent route consent boundary", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    tokenMock.mockClear();
    prepareDesignTurnMock.mockReset();
    prepareDesignTurnMock.mockResolvedValue({ type: "text", text: "ok" });
  });

  it("rejects oversized bodies before remote execution", async () => {
    const response = await POST(request({}, 1_500_001));

    expect(response.status).toBe(413);
    expect(prepareDesignTurnMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before remote execution", async () => {
    accountMock.value = null;

    const response = await POST(request({ ...validBody, cloudConsent: true }));

    expect(response.status).toBe(401);
    expect(prepareDesignTurnMock).not.toHaveBeenCalled();
  });

  it("rejects missing consent before remote execution", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(prepareDesignTurnMock).not.toHaveBeenCalled();
  });

  it("forwards only an explicitly consented authorized turn", async () => {
    const response = await POST(request({ ...validBody, cloudConsent: true }));

    expect(response.status).toBe(200);
    expect(prepareDesignTurnMock).toHaveBeenCalledWith(validBody.messages, validBody.context, {
      replicateToken: "configured",
      accountId: "account-test",
      cloudConsent: true,
    });
  });

  it("redacts remote provider details from errors", async () => {
    prepareDesignTurnMock.mockRejectedValue(
      new Error("https://replicate.delivery/private?api_key=DO_NOT_LEAK"),
    );

    const response = await POST(request({ ...validBody, cloudConsent: true }));
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe("Design agent is temporarily unavailable.");
    expect(JSON.stringify(data)).not.toContain("DO_NOT_LEAK");
    expect(JSON.stringify(data)).not.toContain("replicate.delivery");
  });
});
