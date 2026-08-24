import { describe, expect, it } from "vitest";
import { isAllowedRasterDataUrl, parsePptxExportPayload } from "@/lib/engine/pptxPayload";
import { ENGINE_SCHEMA_VERSION, type EngineDoc } from "@/lib/engine/types";

function makeDoc(): EngineDoc {
  return {
    id: "doc-1",
    title: "Test",
    width: 1920,
    height: 1080,
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: Date.now(),
    schemaVersion: ENGINE_SCHEMA_VERSION,
    slides: [
      {
        id: "slide-1",
        name: "Slide 1",
        background: "#ffffff",
        width: 1920,
        height: 1080,
        elements: [],
        layers: [],
      },
    ],
  };
}

describe("PPTX export payload contract", () => {
  it("accepts the editor's bounded PNG payload", () => {
    const parsed = parsePptxExportPayload({
      doc: makeDoc(),
      rasterizedImages: { "image-1": "data:image/png;base64,iVBORw0KGgo=" },
    });

    expect(parsed?.doc.id).toBe("doc-1");
  });

  it("rejects unsupported image formats before PptxGenJS sees them", () => {
    expect(isAllowedRasterDataUrl("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isAllowedRasterDataUrl("data:image/png;base64,aWNucw==")).toBe(false);
    expect(isAllowedRasterDataUrl("data:image/jpeg;base64,anhsbA==")).toBe(false);
    expect(isAllowedRasterDataUrl("data:image/webp;base64,UklGRgAAAABXRUJQ")).toBe(true);
    expect(
      parsePptxExportPayload({
        doc: makeDoc(),
        rasterizedImages: { "image-1": "data:image/svg+xml;base64,AAAA" },
      }),
    ).toBeNull();
  });

  it("rejects invalid dimensions and malformed slides", () => {
    const doc = makeDoc();
    doc.width = Number.POSITIVE_INFINITY;
    expect(parsePptxExportPayload({ doc })).toBeNull();

    const malformed = makeDoc();
    malformed.slides[0].elements = [{ bad: true }] as never;
    expect(parsePptxExportPayload({ doc: malformed })).toBeNull();
  });
});
