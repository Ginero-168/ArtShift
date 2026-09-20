import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportAllPNG,
  exportCurrentSlidePNG,
  exportPDF,
  exportSlideToPNG,
} from "@/lib/engine/exportPNG";
import { exportPPTX } from "@/lib/engine/exportPPTX";
import { exportAllSVG, exportCurrentSlideSVG } from "@/lib/engine/exportSVG";
import { fromJSON } from "@/lib/engine/serialize";
import {
  getExportableSlides,
  INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE,
  INFINITY_CANVAS_LABEL,
  INFINITY_CANVAS_SKIPPED_MESSAGE,
  isExportableSlide,
  isInfinityCanvasSlide,
  normalizeSlideKind,
} from "@/lib/engine/slideKind";
import { createEmptyEngineDoc, useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineSlide } from "@/lib/engine/types";

const pdfSpies = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/renderer/canvas", () => ({
  renderSlide: vi.fn(),
  renderElement: vi.fn(),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    addImage = pdfSpies.addImage;
    addPage = pdfSpies.addPage;
    save = pdfSpies.save;
  },
}));

function artworkSlide(id: string, name = "Artwork"): EngineSlide {
  return {
    id,
    name,
    kind: "artwork",
    background: "#ffffff",
    elements: [],
    layers: [],
    width: 1920,
    height: 1080,
  };
}

function infinitySlide(id: string, name = INFINITY_CANVAS_LABEL): EngineSlide {
  return {
    id,
    name,
    kind: "infinityCanvas",
    background: "#ffffff",
    elements: [],
    layers: [],
    width: 1920,
    height: 1080,
  };
}

function mixedDoc(): EngineDoc {
  return {
    id: "doc-mix",
    title: "Mixed",
    width: 1920,
    height: 1080,
    snapGrid: null,
    updatedAt: 1,
    schemaVersion: ENGINE_SCHEMA_VERSION,
    slides: [artworkSlide("a1", "Keep me"), infinitySlide("i1"), artworkSlide("a2", "Keep two")],
  };
}

describe("Infinity Canvas slide kind", () => {
  beforeEach(() => {
    pdfSpies.addImage.mockReset();
    pdfSpies.addPage.mockReset();
    pdfSpies.save.mockReset();
    const mockCtx = {
      scale: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      callback(new Blob(["png"], { type: type || "image/png" }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => "blob:mock";
      URL.revokeObjectURL = () => {};
    }
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/png;base64,AAAA";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes missing and leftover kinds", () => {
    expect(normalizeSlideKind(undefined)).toBe("artwork");
    expect(normalizeSlideKind("artwork")).toBe("artwork");
    expect(normalizeSlideKind("infinityCanvas")).toBe("infinityCanvas");
    expect(normalizeSlideKind("moodboard")).toBe("infinityCanvas");
    expect(normalizeSlideKind("unknown")).toBe("artwork");
  });

  it("creates an Infinity Canvas slide with the same empty toolchain as artwork", () => {
    useEngine.getState().loadDoc(createEmptyEngineDoc("Kind"));
    const id = useEngine.getState().addInfinityCanvasSlide();
    const created = useEngine.getState().doc.slides.find((slide) => slide.id === id);
    expect(created).toMatchObject({
      kind: "infinityCanvas",
      name: INFINITY_CANVAS_LABEL,
      width: 1920,
      height: 1080,
    });
    expect(created?.layers.length).toBeGreaterThan(0);
    expect(created?.elements).toEqual([]);
    expect(useEngine.getState().currentSlideId).toBe(id);
    expect(isInfinityCanvasSlide(created)).toBe(true);
    expect(isExportableSlide(created)).toBe(false);
  });

  it("keeps addSlide as a normal exportable artwork", () => {
    useEngine.getState().loadDoc(createEmptyEngineDoc("Kind"));
    const id = useEngine.getState().addSlide();
    const created = useEngine.getState().doc.slides.find((slide) => slide.id === id);
    expect(created?.kind).toBe("artwork");
    expect(isExportableSlide(created)).toBe(true);
  });

  it("migrates older documents without kind to artwork and leftover moodboard to Infinity Canvas", () => {
    const migrated = fromJSON({
      id: "legacy",
      title: "Legacy",
      width: 1920,
      height: 1080,
      snapGrid: null,
      updatedAt: 1,
      schemaVersion: 11,
      slides: [
        {
          id: "old",
          name: "Old",
          background: "#fff",
          elements: [],
          layers: [],
          width: 1920,
          height: 1080,
        },
        {
          id: "board",
          name: "Board",
          kind: "moodboard",
          background: "#fff",
          elements: [],
          layers: [],
          width: 1920,
          height: 1080,
        },
      ],
    });

    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    expect(ENGINE_SCHEMA_VERSION).toBe(12);
    expect(migrated.slides[0].kind).toBe("artwork");
    expect(migrated.slides[1].kind).toBe("infinityCanvas");
  });

  it("omits Infinity Canvas from exportable slides while keeping artwork", () => {
    const exportable = getExportableSlides(mixedDoc());
    expect(exportable.map((slide) => slide.id)).toEqual(["a1", "a2"]);
  });

  it("skips Infinity Canvas when exporting all PNGs and still exports artwork", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    await exportAllPNG(mixedDoc());

    expect(downloads).toEqual(["01-keep-me.png", "02-keep-two.png"]);
    await expect(exportAllPNG({ ...mixedDoc(), slides: [infinitySlide("only")] })).rejects.toThrow(
      INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE,
    );
  });

  it("refuses current-slide raster export of an Infinity Canvas", async () => {
    await expect(exportCurrentSlidePNG(infinitySlide("i1"), mixedDoc())).rejects.toThrow(
      INFINITY_CANVAS_SKIPPED_MESSAGE,
    );
    const blob = await exportSlideToPNG(artworkSlide("a1"), 1920, 1080);
    expect(blob.type).toBe("image/png");
  });

  it("skips Infinity Canvas in PDF export", async () => {
    await exportPDF(mixedDoc());
    expect(pdfSpies.addImage).toHaveBeenCalledTimes(2);
    expect(pdfSpies.addPage).toHaveBeenCalledTimes(1);
    expect(pdfSpies.save).toHaveBeenCalled();
    await expect(exportPDF({ ...mixedDoc(), slides: [infinitySlide("only")] })).rejects.toThrow(
      INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE,
    );
  });

  it("skips Infinity Canvas in SVG export", () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    exportAllSVG(mixedDoc());
    expect(downloads).toEqual(["01-keep-me.svg", "02-keep-two.svg"]);
    expect(() => exportCurrentSlideSVG(infinitySlide("i1"))).toThrow(
      INFINITY_CANVAS_SKIPPED_MESSAGE,
    );
  });

  it("sends only exportable slides to the PPTX route", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.doc.slides.map((slide: EngineSlide) => slide.id)).toEqual(["a1", "a2"]);
      return {
        ok: true,
        blob: async () => new Blob(["pptx"]),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await exportPPTX(mixedDoc());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Infinity Canvas UI wiring", () => {
  it("lets the slide rail create Infinity Canvas and documents the export skip", () => {
    const rail = readFileSync("components/Canvas/SlideRail.tsx", "utf8");
    expect(rail).toContain("addInfinityCanvasSlide");
    expect(rail).toContain(`New ${INFINITY_CANVAS_LABEL}`);
    expect(rail).toContain("INFINITY_CANVAS_EXPORT_NOTE");
  });

  it("draws a frameless infinite board in the editor canvas", () => {
    const root = readFileSync("components/Canvas/CanvasRoot.tsx", "utf8");
    expect(root).toContain("isInfinityCanvasSlide");
    expect(root).toContain("fillBackground: !infinite");
    expect(root).toContain("drawInfinityBoard");
  });
});
