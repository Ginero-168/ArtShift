import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPromptHelperThumbGeneration } from "@/lib/ai/orchestration/promptHelperThumbsClient";

describe("Prompt Helper thumbs client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not POST generation without explicit cloud consent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestPromptHelperThumbGeneration(["flat"])).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends cloudConsent true with option ids when consent is granted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestPromptHelperThumbGeneration(["flat"], { cloudConsent: true })).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/prompt-helper/thumbs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ optionIds: ["flat"], cloudConsent: true }),
      }),
    );
  });
});
