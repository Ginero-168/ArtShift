import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());
const accountMock = vi.hoisted(() => ({ value: { id: "account-1" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => vi.fn(() => "configured"));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => ({ execute: executeMock }),
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: tokenMock,
}));

import { POST } from "../app/api/ai/recall/route";

const lastGeneration = {
  userPrompt: "ป้าย Nain ลด 35%",
  refinedPrompt: "Pink floral Nain 35% off banner",
  width: 2048,
  height: 688,
  aspectRatio: "3:1",
  outputElementId: "out-1",
  ingredients: [{ objectId: "cover-a", displayName: "Cover A" }],
};

const body = {
  followUpPrompt: "ปรับเป็นแนวตั้ง",
  conversationHistory: [
    { role: "user", content: "ทำป้าย Nain โทนชมพู ลด 35%" },
    { role: "assistant", content: "สร้างเสร็จแล้วครับ" },
  ],
  lastGeneration,
  cloudConsent: true,
};

function request(value: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => value,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Follow-up recall route", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-1" };
    executeMock.mockReset();
    executeMock.mockResolvedValue({
      output: {
        text: JSON.stringify({
          summary: "Nain pink 35% campaign using Cover A. Rebuild as vertical 9:16.",
          agreedConstraints: ["keep 35% copy"],
          styleNotes: "pink floral",
          campaignNotes: "Nain sale",
          followUpIntent: "Vertical 9:16 revision of the last banner",
          keepCopy: true,
          keepIngredients: true,
        }),
        stopReason: "end_turn",
        assistantMessage: { role: "assistant", content: "" },
        toolCalls: [],
      },
      metadata: { model: "google/gemini-3-flash" },
    });
  });

  it("rejects unauthenticated requests", async () => {
    accountMock.value = null;
    const response = await POST(request(body));
    expect(response.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("rejects missing cloud consent", async () => {
    const response = await POST(request({ ...body, cloudConsent: false }));
    expect(response.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("calls Gemini 3 Flash and returns a recall summary", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.model).toBe("google/gemini-3-flash");
    expect(payload.recall.summary).toContain("Nain");
    expect(payload.recall.followUpIntent).toContain("1:3");
    expect(payload.recall.resolvedExactSize).toBe("1:3");
    expect(executeMock).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({
        system: expect.stringContaining("Memory Recall"),
      }),
      expect.objectContaining({
        modelAlias: "creative-director",
        cloudConsent: true,
      }),
    );
  });

  it("forwards lastGeneration exact 29×7cm into Gemini recall, not just the follow-up text", async () => {
    const response = await POST(
      request({
        ...body,
        lastGeneration: {
          ...lastGeneration,
          userPrompt: "สร้างป้าย shelftalk 29x7 cm",
          sourceWidth: 29,
          sourceHeight: 7,
          sizeLabel: "29x7cm",
          sizeUnit: "cm",
          ratioClamped: true,
          printWidth: 2848,
          printHeight: 688,
        },
      }),
    );
    expect(response.status).toBe(200);
    const chatInput = executeMock.mock.calls[0]?.[1] as { messages?: { content?: unknown }[] };
    const userText = JSON.stringify(chatInput?.messages ?? []);
    expect(userText).toContain("29x7cm");
    expect(userText).toContain("29");
    expect(userText).toContain("7");
    const payload = await response.json();
    expect(payload.recall.resolvedExactSize).toMatch(/7x29/i);
    expect(payload.recall.followUpIntent).not.toContain("9:16");
  });

  it("accepts 24 conversation turns for follow-up memory", async () => {
    const conversationHistory = Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index} Nain campaign`,
    }));
    const response = await POST(request({ ...body, conversationHistory }));
    expect(response.status).toBe(200);
  });

  it("rejects 25 conversation turns", async () => {
    const conversationHistory = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    }));
    const response = await POST(request({ ...body, conversationHistory }));
    expect(response.status).toBe(400);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
