import { describe, expect, it, vi } from "vitest";
import { ASPECT_RATIOS, buildPollinationsUrl, generateAIImage } from "@/lib/ai/pollinations";

describe("Pollinations.ai Text-to-Image Service", () => {
  it("builds correct URL with all parameters", () => {
    const res = buildPollinationsUrl({
      prompt: "a majestic golden eagle soaring over mountains",
      model: "flux-realism",
      width: 1280,
      height: 720,
      seed: 12345,
      enhance: true,
      nologo: true,
    });

    expect(res.url).toContain("https://image.pollinations.ai/prompt/a%20majestic%20golden%20eagle");
    expect(res.url).toContain("width=1280");
    expect(res.url).toContain("height=720");
    expect(res.url).toContain("seed=12345");
    expect(res.url).toContain("model=flux-realism");
    expect(res.url).toContain("nologo=true");
    expect(res.url).toContain("enhance=true");
    expect(res.seed).toBe(12345);
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

    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob),
      }),
    );

    // Mock FileReader
    class MockFileReader {
      result = mockDataUrl;
      onloadend: (() => void) | null = null;
      readAsDataURL() {
        if (this.onloadend) this.onloadend();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

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
  });
});
