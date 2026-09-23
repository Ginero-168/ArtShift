import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ execute: vi.fn() }));
const accountMock = vi.hoisted(() => ({ value: { id: "account-plan" } as { id: string } | null }));

vi.mock("@/lib/server/ai/runtime", () => ({
  getServerAiRuntime: () => runtimeMock,
}));
vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getSessionReplicateToken: () => "r8_session_token",
}));

import { POST } from "../app/api/ai/prompt-helper/plan/route";

function request(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    json: async () => body,
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("Prompt Helper plan route", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-plan" };
    runtimeMock.execute.mockReset();
    runtimeMock.execute.mockResolvedValue({
      output: { text: '{"axes":[]}' },
      metadata: { provider: "mock", model: "mock", usage: {}, warnings: [] },
    });
  });

  it("rejects unauthenticated planning", async () => {
    accountMock.value = null;
    const response = await POST(request({ prompt: "แมวส้ม", cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("rejects planning without explicit cloud consent", async () => {
    const response = await POST(request({ prompt: "แมวส้ม" }));
    expect(response.status).toBe(403);
    expect(runtimeMock.execute).not.toHaveBeenCalled();
  });

  it("passes cloudConsent into ai.execute after the route check", async () => {
    const response = await POST(request({ prompt: "แมวส้มบนโต๊ะไม้", cloudConsent: true }));
    expect(response.status).toBe(200);
    expect(runtimeMock.execute).toHaveBeenCalledWith(
      "assistant.chat",
      expect.objectContaining({ maxTokens: 6000 }),
      expect.objectContaining({
        cloudConsent: true,
        allowFallback: false,
        accountId: "account-plan",
      }),
    );
  });

  it("returns dragon axes from a Gemini plan and a banner that matches them", async () => {
    runtimeMock.execute.mockResolvedValue({
      output: {
        text: JSON.stringify({
          situation: "subject_explore",
          rationale:
            "เลือกแกนที่ช่วยเสริมความอลังการและจินตนาการของมังกร ทั้งบรรยากาศ สเกล และรายละเอียดของเกล็ด",
          preferBrandAxes: false,
          axes: [
            {
              id: "species",
              title: "ชนิดมังกร",
              options: [
                {
                  id: "wyvern",
                  label: "ไวเวิร์น",
                  modifier: "มังกรไวเวิร์นสองปีก",
                  character: "สองปีก",
                },
                {
                  id: "eastern",
                  label: "มังกรตะวันออก",
                  modifier: "มังกรตะวันออกลำตัวยาว",
                  character: "ยาว",
                },
              ],
            },
            {
              id: "breath",
              title: "ลมหายใจ",
              options: [
                { id: "fire", label: "ไฟ", modifier: "พ่นเปลวไฟ", character: "ไฟ" },
                { id: "frost", label: "น้ำแข็ง", modifier: "พ่นลมหายใจน้ำแข็ง", character: "เย็น" },
              ],
            },
          ],
        }),
      },
      metadata: { provider: "mock", model: "gemini-test", usage: {}, warnings: [] },
    });

    const response = await POST(request({ prompt: "สร้างรูปมังกร", cloudConsent: true }));
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      planSource: string;
      rationale: string;
      card: { dimensions: { id: string; title: string }[] };
    };
    expect(json.planSource).toBe("gemini");
    expect(json.card.dimensions.map((dim) => dim.id)).toEqual(["species", "breath"]);
    expect(json.card.dimensions.map((dim) => dim.title)).toEqual(["ชนิดมังกร", "ลมหายใจ"]);
    expect(json.rationale).toBe("เลือกแกนให้เข้ากับพรอมป์นี้: ชนิดมังกร, ลมหายใจ");
    expect(json.rationale).not.toContain("เกล็ด");

    const userMessage = runtimeMock.execute.mock.calls[0]?.[1] as {
      messages?: { content?: string }[];
    };
    expect(userMessage.messages?.[0]?.content).toContain("สร้างรูปมังกร");
    expect(userMessage.messages?.[0]?.content).not.toContain("atm_epic");
  });

  it("keeps the generic catalog only when the model plan cannot be used", async () => {
    runtimeMock.execute.mockResolvedValue({
      output: { text: "not a plan" },
      metadata: { provider: "mock", model: "gemini-test", usage: {}, warnings: [] },
    });
    const response = await POST(request({ prompt: "สร้างรูปมังกร", cloudConsent: true }));
    const json = (await response.json()) as {
      planSource: string;
      rationale: string;
      card: { dimensions: { id: string }[] };
    };
    expect(json.planSource).toBe("baseline");
    expect(json.rationale).toBe("");
    const ids = json.card.dimensions.map((dim) => dim.id);
    expect(ids).toContain("atmosphere");
    expect(ids).toContain("lighting");
    expect(ids).not.toContain("species");
  });
});
