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
      const wrapped = "```json\n" + JSON.stringify({
        caption: "Wrapped caption",
        objects: ["logo"],
        visibleText: "Welearn",
      }) + "\n```";
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
    it("calls /api/ai/vision-analyze and returns structured data on success", async () => {
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
        }),
      })) as unknown as typeof fetch;

      try {
        const result = await tryCloudVisionTurbo("data:image/jpeg;base64,TEST", new AbortController().signal);

        expect(result).toEqual({
          caption: "Turbo caption result",
          objects: ["sign", "logo"],
          visibleText: "Welearn Book Shop",
          appearanceNotes: [],
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
        const result = await tryCloudVisionTurbo("data:image/jpeg;base64,TEST", new AbortController().signal);

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
      );

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).not.toHaveBeenCalled();
      expect(mockDetect).not.toHaveBeenCalled();
      expect(mockOcr).not.toHaveBeenCalled();
      expect(result.caption).toBe("Fast cloud caption");
      expect(result.objects).toEqual(["fast-obj"]);
      expect(result.visibleText).toBe("FAST TEXT");
    });

    it("falls back to local passes when turbo returns null", async () => {
      const mockTurbo = vi.fn(async () => null);
      const mockCaption = vi.fn(async () => "Local fallback caption");
      const mockDetect = vi.fn(async () => ({ objects: [{ label: "fallback-obj" }] }));
      const mockOcr = vi.fn(async () => "FALLBACK TEXT");

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
      );

      expect(mockTurbo).toHaveBeenCalledTimes(1);
      expect(mockCaption).toHaveBeenCalledTimes(1);
      expect(mockDetect).toHaveBeenCalledTimes(1);
      expect(mockOcr).toHaveBeenCalledTimes(1);
      expect(result.caption).toBe("Local fallback caption");
      expect(result.objects).toEqual(["fallback-obj"]);
      expect(result.visibleText).toBe("FALLBACK TEXT");
    });
  });
});
