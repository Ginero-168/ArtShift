import { afterEach, describe, expect, it, vi } from "vitest";
import { ASPECT_RATIOS, cleanImagePrompt, generateAIImage } from "@/lib/ai/pollinations";

describe("Pollinations.ai Text-to-Image Service", () => {
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
      naturalWidth = 100;
      naturalHeight = 100;
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
      model: "flux",
      seed: 999,
    });

    expect(result).toBeDefined();
    expect(result.dataUrl).toBe(mockDataUrl);
    expect(result.seed).toBe(999);
    expect(result.model).toBe("flux");
    expect(result.fileId).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/ai/image",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails closed instead of bypassing the server with a direct provider request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({ error: "Provider is not configured." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAIImage({ prompt: "test prompt" })).rejects.toThrow(
      "Provider is not configured.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/image");
  });

  it("enriches Thai prompts into detailed English visual prompts", async () => {
    const { enrichPrompt } = await import("@/lib/ai/pollinations");
    const result = enrichPrompt("สร้างรูปแมวให้หน่อย");
    expect(result).toContain("cat");
    expect(result.length).toBeGreaterThan("แมว".length);
  });

  it("normalizes common Thai image commands", () => {
    expect(cleanImagePrompt("ขอภาพแมวให้หน่อย")).toBe("แมว");
  });
});
