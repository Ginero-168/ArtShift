import { afterEach, describe, expect, it, vi } from "vitest";
import { ASPECT_RATIOS, cleanImagePrompt, generateAIImage } from "@/lib/ai/imageGeneration";

describe("GPT Image 2 generation client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("provides standard aspect ratio options", () => {
    expect(ASPECT_RATIOS.length).toBeGreaterThanOrEqual(4);
    const square = ASPECT_RATIOS.find((r) => r.id === "1:1");
    expect(square?.width).toBe(1024);
    expect(square?.height).toBe(1024);
  });

  it("throws an error if prompt is empty", async () => {
    await expect(generateAIImage({ prompt: "   " })).rejects.toThrow(
      "Please enter a prompt to generate an image.",
    );
  });

  it("fails closed without cloud consent and does not start a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAIImage({ prompt: "a cat" })).rejects.toThrow("Cloud consent is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves AbortError so cancellation stays a terminal cancellation", async () => {
    const controller = new AbortController();
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    await expect(
      generateAIImage({ prompt: "a cat", cloudConsent: true }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fetches and caches generated image data", async () => {
    const mockDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ dataUrl: mockDataUrl, seed: 999 }),
      }),
    );

    // Mock Image for imageCache
    class MockImage {
      naturalWidth = 1024;
      naturalHeight = 1024;
      crossOrigin = "";
      private _src = "";
      onload: (() => void) | null = null;
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 5);
      }
    }
    vi.stubGlobal("Image", MockImage);

    const result = await generateAIImage({
      prompt: "test prompt",
      aspectRatio: "1:1",
      seed: 999,
      cloudConsent: true,
    });

    expect(result).toBeDefined();
    expect(result.dataUrl).toBe(mockDataUrl);
    expect(result.seed).toBe(999);
    expect(result.model).toBe("openai/gpt-image-2");
    expect(result.fileId).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/ai/image",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a generated image that fails the technical quality gate", async () => {
    const mockDataUrl = "data:image/png;base64,BBBB";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ dataUrl: mockDataUrl, seed: 0 }),
      }),
    );
    class TinyImage {
      naturalWidth = 100;
      naturalHeight = 100;
      crossOrigin = "";
      onload: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", TinyImage);

    await expect(
      generateAIImage({ prompt: "a cat", aspectRatio: "1:1", cloudConsent: true }),
    ).rejects.toThrow("Generated image failed the visual quality gate");
  });

  it("fails closed instead of bypassing the server with a direct provider request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({ error: "Provider is not configured." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAIImage({ prompt: "test prompt", cloudConsent: true })).rejects.toThrow(
      "Provider is not configured.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/image");
  });

  it("preserves an uncertain provider outcome as a terminal error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({
          code: "OUTCOME_UNKNOWN",
          error: "AI provider result is uncertain; no duplicate request was created.",
        }),
      }),
    );

    await expect(generateAIImage({ prompt: "a cat", cloudConsent: true })).rejects.toMatchObject({
      name: "OutcomeUnknownError",
    });
  });

  it("enriches Thai prompts into detailed English visual prompts", async () => {
    const { enrichPrompt } = await import("@/lib/ai/imageGeneration");
    const result = enrichPrompt("สร้างรูปแมวให้หน่อย");
    expect(result).toContain("cat");
    expect(result.length).toBeGreaterThan("แมว".length);
  });

  it("normalizes common Thai image commands", () => {
    expect(cleanImagePrompt("ขอภาพแมวให้หน่อย")).toBe("แมว");
  });
});
