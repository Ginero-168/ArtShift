import { describe, expect, it, vi } from "vitest";
import {
  parseVisionResponse,
  visionExtrasAsAppearanceNotes,
} from "@/lib/ai/orchestration/cloudVisionParser";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import {
  analyzeImageReference,
  tryCloudVisionTurbo,
} from "@/lib/ai/orchestration/referenceAnalysis";

vi.mock("@/lib/engine/imageCache", () => ({
  getCached: vi.fn(() => ({ dataURL: "data:image/png;base64,CACHED", width: 100, height: 100 })),
}));
vi.mock("@/lib/vision/assetAnalysisBrowser", () => ({ getAssetAnalysis: vi.fn(() => undefined) }));
vi.mock("@/lib/ai/orchestration/visibleReferenceRenderer", () => ({
  renderVisibleReference: vi.fn(() => ({
    dataUrl: "data:image/jpeg;base64,TEST_VISIBLE",
    width: 600,
    height: 200,
    limitations: [],
  })),
}));
vi.mock("@/lib/vision/visionEngine", () => ({
  visionCaption: vi.fn(),
  visionDetect: vi.fn(),
  visionOcr: vi.fn(),
}));

const mockRef: ComposerImageRef = {
  objectId: "img-1",
  elementVersion: 1,
  fileId: "f-1",
  displayName: "test.jpg",
  sourceWidth: 600,
  sourceHeight: 200,
  width: 600,
  height: 200,
  angle: 0,
};

describe("Cloud Vision Turbo Fast-Lane", () => {
  describe("parseVisionResponse", () => {
    it("parses clean JSON from multimodal vision output", () => {
      const json = JSON.stringify({
        caption: "A modern bookstore banner for Welearn with Manifest book",
        objects: ["banner", "book", "shelf"],
        visibleText: "Welearn Manifest คิดมาก",
        style: "minimalist 2D graphic",
        dominantColors: ["#ffffff", "#000000"],
      });
      const parsed = parseVisionResponse(json);

      expect(parsed.caption).toBe("A modern bookstore banner for Welearn with Manifest book");
      expect(parsed.objects).toEqual(["banner", "book", "shelf"]);
      expect(parsed.visibleText).toBe("Welearn Manifest คิดมาก");
      expect(parsed.style).toBe("minimalist 2D graphic");
      expect(parsed.dominantColors).toEqual(["#ffffff", "#000000"]);
    });

    it("keeps layout notes and inconsistencies from richer vision JSON", () => {
      const json = JSON.stringify({
        caption: "Top: logo. Middle: 50 baht badge. Bottom: T&Cs two columns.",
        objects: ["Naiin logo", "mug: Good Books Better Days :)"],
        visibleText: "Exclusive for\nMitrtown Office Tower\n50 บาท",
        style: "square promo coupon",
        dominantColors: ["#1e3a8a", "#facc15"],
        layoutNotes: "White T&C frame at bottom, 2 columns",
        inconsistencies: ["Header says Mitrtown; T&Cs say The Street Ratchada"],
      });
      const parsed = parseVisionResponse(json);
      expect(parsed.layoutNotes).toContain("2 columns");
      expect(parsed.inconsistencies?.[0]).toMatch(/Ratchada/);
      const notes = visionExtrasAsAppearanceNotes(parsed);
      expect(notes.some((n) => n.startsWith("Inconsistency:"))).toBe(true);
      expect(notes.some((n) => n.startsWith("Layout:"))).toBe(true);
    });

    it("strips markdown codeblock delimiters before parsing JSON", () => {
      const wrapped =
        "```json\n" +
        JSON.stringify({
          caption: "Wrapped caption",
          objects: ["logo"],
          visibleText: "Welearn",
        }) +
        "\n```";
      const parsed = parseVisionResponse(wrapped);

      expect(parsed.caption).toBe("Wrapped caption");
      expect(parsed.objects).toEqual(["logo"]);
      expect(parsed.visibleText).toBe("Welearn");
    });

    it("falls back cleanly when output is unstructured plain text", () => {
      const plain = "This is a photo of a book on a shelf with blue theme.";
      const parsed = parseVisionResponse(plain);

      expect(parsed.caption).toBe(plain);
      expect(parsed.objects).toEqual([]);
      expect(parsed.visibleText).toBe("");
    });
  });

  describe("tryCloudVisionTurbo fetch client", () => {
    it("does not call cloud vision without explicit consent", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn() as unknown as typeof fetch;
      try {
        const result = await tryCloudVisionTurbo(
          "data:image/jpeg;base64,TEST",
          new AbortController().signal,
        );
        expect(result).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("calls /api/ai/vision-analyze with cloudConsent and returns structured data on success", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            caption: "Turbo caption result",
            objects: ["sign", "logo"],
            visibleText: "Welearn Book Shop",
          },
          model: "google/gemini-3-flash",
        }),
      })) as unknown as typeof fetch;

      try {
        const result = await tryCloudVisionTurbo(
          "data:image/jpeg;base64,TEST",
          new AbortController().signal,
          undefined,
          { cloudConsent: true },
        );

        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/ai/vision-analyze",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              image: "data:image/jpeg;base64,TEST",
              cloudConsent: true,
            }),
          }),
        );
        expect(result).toEqual({
          caption: "Turbo caption result",
          objects: ["sign", "logo"],
          visibleText: "Welearn Book Shop",
          appearanceNotes: [],
          model: "google/gemini-3-flash",
          modelLabel: "Gemini 3 Flash",
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns null gracefully on network failure without throwing", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => {
        throw new Error("Network offline");
      }) as unknown as typeof fetch;

      try {
        const result = await tryCloudVisionTurbo(
          "data:image/jpeg;base64,TEST",
          new AbortController().signal,
          undefined,
          { cloudConsent: true },
        );

        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("analyzeImageReference turbo integration", () => {
    it("uses turbo when available and skips multiple local passes", async () => {
      const mockTurbo = vi.fn(async () => ({
        caption: "Fast cloud caption",
        objects: ["fast-obj"],
        visibleText: "FAST TEXT",
      }));
      const mockCaption = vi.fn();
      const mockDetect = vi.fn();
      const mockOcr = vi.fn();

      const result = await analyzeImageReference(mockRef, new AbortController().signal, undefined, {
        caption: mockCaption,
        detect: mockDetect,
        ocr: mockOcr,
        asset: () => undefined,
        turbo: mockTurbo,
      });

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).not.toHaveBeenCalled();
      expect(mockDetect).not.toHaveBeenCalled();
      expect(mockOcr).not.toHaveBeenCalled();
      expect(result.caption).toBe("Fast cloud caption");
      expect(result.objects).toEqual(["fast-obj"]);
      expect(result.visibleText).toBe("FAST TEXT");
      expect(result.source).toBe("cloud-api");
      expect(result.modelLabel).toBe("Gemini 3 Flash");
      expect(result.visionModel).toBe("google/gemini-3-flash");
    });

    it("falls back to local passes when turbo returns null", async () => {
      const mockTurbo = vi.fn(async () => null);
      const mockCaption = vi.fn(async () => "Local fallback caption");
      const mockDetect = vi.fn(async () => ({ objects: [{ label: "fallback-obj" }] }));
      const mockOcr = vi.fn(async () => "FALLBACK TEXT");

      const result = await analyzeImageReference(mockRef, new AbortController().signal, undefined, {
        caption: mockCaption,
        detect: mockDetect,
        ocr: mockOcr,
        asset: () => undefined,
        turbo: mockTurbo,
      });

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).toHaveBeenCalledTimes(1);
      expect(mockDetect).toHaveBeenCalledTimes(1);
      expect(mockOcr).toHaveBeenCalledTimes(1);
      expect(result.caption).toBe("Local fallback caption");
      expect(result.objects).toEqual(["fallback-obj"]);
      expect(result.visibleText).toBe("FALLBACK TEXT");
      expect(result.source).toBe("local-florence");
      expect(result.modelLabel).toBe("Florence-2");
    });

    it("does not auto-load Florence when cloud succeeds and local fallback is disabled", async () => {
      const mockTurbo = vi.fn(async () => ({
        caption: "API caption",
        objects: ["api-obj"],
        visibleText: "API TEXT",
        modelLabel: "Gemini 3 Flash",
      }));
      const mockCaption = vi.fn();
      const mockDetect = vi.fn();
      const mockOcr = vi.fn();

      const result = await analyzeImageReference(
        mockRef,
        new AbortController().signal,
        undefined,
        {
          caption: mockCaption,
          detect: mockDetect,
          ocr: mockOcr,
          asset: () => undefined,
          turbo: mockTurbo,
        },
        { cloudConsent: true, allowLocalFallback: false },
      );

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).not.toHaveBeenCalled();
      expect(mockDetect).not.toHaveBeenCalled();
      expect(mockOcr).not.toHaveBeenCalled();
      expect(result.source).toBe("cloud-api");
    });

    it("skips Florence when the API misses and local fallback is disabled", async () => {
      const mockTurbo = vi.fn(async () => null);
      const mockCaption = vi.fn();
      const mockDetect = vi.fn();
      const mockOcr = vi.fn();

      const result = await analyzeImageReference(
        mockRef,
        new AbortController().signal,
        undefined,
        {
          caption: mockCaption,
          detect: mockDetect,
          ocr: mockOcr,
          asset: () => undefined,
          turbo: mockTurbo,
        },
        { cloudConsent: true, allowLocalFallback: false },
      );

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).not.toHaveBeenCalled();
      expect(result.source).toBe("none");
      expect(result.limitations).toContain("cloud vision unavailable; local fallback disabled");
    });

    it("calls Gemini API before any local Florence pass on the default consent path", async () => {
      const callOrder: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => {
        callOrder.push("cloud-api");
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              caption: "Gemini caption",
              objects: ["logo"],
              visibleText: "SALE",
            },
            model: "google/gemini-3-flash",
          }),
        };
      }) as unknown as typeof fetch;

      const { visionCaption, visionDetect, visionOcr } = await import("@/lib/vision/visionEngine");
      const captionSpy = vi.mocked(visionCaption).mockImplementation(async () => {
        callOrder.push("local-florence");
        return "local caption";
      });
      const detectSpy = vi.mocked(visionDetect).mockImplementation(async () => {
        callOrder.push("local-florence");
        return { objects: [] };
      });
      const ocrSpy = vi.mocked(visionOcr).mockImplementation(async () => {
        callOrder.push("local-florence");
        return "";
      });

      try {
        const result = await analyzeImageReference(
          mockRef,
          new AbortController().signal,
          undefined,
          undefined,
          { cloudConsent: true },
        );
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(captionSpy).not.toHaveBeenCalled();
        expect(detectSpy).not.toHaveBeenCalled();
        expect(ocrSpy).not.toHaveBeenCalled();
        expect(callOrder).toEqual(["cloud-api"]);
        expect(result.source).toBe("cloud-api");
        expect(result.modelLabel).toBe("Gemini 3 Flash");
        expect(result.caption).toBe("Gemini caption");
      } finally {
        globalThis.fetch = originalFetch;
        captionSpy.mockReset();
        detectSpy.mockReset();
        ocrSpy.mockReset();
      }
    });
  });
});
