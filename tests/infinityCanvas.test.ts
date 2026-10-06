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
import { createRect } from "@/lib/engine/factory";
import { fromJSON } from "@/lib/engine/serialize";
import {
  getExportableSlides,
  INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE,
  INFINITY_CANVAS_LABEL,
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

  it("treats every board as the infinite canvas", () => {
    expect(normalizeSlideKind(undefined)).toBe("infinityCanvas");
    expect(normalizeSlideKind("artwork")).toBe("infinityCanvas");
    expect(normalizeSlideKind("infinityCanvas")).toBe("infinityCanvas");
    expect(normalizeSlideKind("moodboard")).toBe("infinityCanvas");
    expect(normalizeSlideKind("unknown")).toBe("infinityCanvas");
  });

  it("opens a new project as one infinite canvas and does not add another page", () => {
    const doc = createEmptyEngineDoc("Kind");
    useEngine.getState().loadDoc(doc);
    const before = useEngine.getState().doc.slides;
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      kind: "infinityCanvas",
      name: "Canvas",
      width: 1920,
      height: 1080,
    });
    expect(isInfinityCanvasSlide(before[0])).toBe(true);
    expect(isExportableSlide(before[0])).toBe(true);
    const id = useEngine.getState().addSlide();
    useEngine.getState().addInfinityCanvasSlide();
    expect(useEngine.getState().doc.slides).toHaveLength(1);
    expect(useEngine.getState().currentSlideId).toBe(id);
  });

  it("folds an older deck into one infinite canvas", () => {
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
    expect(migrated.slides).toHaveLength(1);
    expect(migrated.slides[0]).toMatchObject({ id: "old", kind: "infinityCanvas" });
  });

  it("places a second page to the right of the first", () => {
    const first = createRect({ x: 0, y: 0, width: 100, height: 40 });
    const second = createRect({ x: 0, y: 0, width: 80, height: 40 });
    const migrated = fromJSON({
      id: "deck",
      title: "Deck",
      width: 1920,
      height: 1080,
      snapGrid: null,
      updatedAt: 1,
      schemaVersion: ENGINE_SCHEMA_VERSION,
      slides: [
        {
          id: "left",
          name: "Left",
          background: "#fff",
          elements: [first],
          layers: [],
          width: 1920,
          height: 1080,
        },
        {
          id: "right",
          name: "Right",
          background: "#fff",
          elements: [second],
          layers: [],
          width: 1920,
          height: 1080,
        },
      ],
    });
    const placed = migrated.slides[0]?.elements.find((element) => element.id === second.id);
    expect(migrated.slides).toHaveLength(1);
    expect(placed?.x).toBe(260);
  });

  it("exports a mixed deck as one canvas", () => {
    const exportable = getExportableSlides(mixedDoc());
    expect(exportable.map((slide) => slide.id)).toEqual(["a1"]);
    expect(exportable[0]?.kind).toBe("infinityCanvas");
  });

  it("exports the infinite canvas as PNG", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    await exportAllPNG(mixedDoc());

    expect(downloads).toEqual(["01-keep-me.png"]);
    await exportAllPNG({ ...mixedDoc(), slides: [infinitySlide("only")] });
    expect(downloads).toEqual(["01-keep-me.png", "01-infinity-canvas.png"]);
    await expect(exportAllPNG({ ...mixedDoc(), slides: [] })).rejects.toThrow(
      INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE,
    );
  });

  it("exports the current infinite canvas as PNG", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    await exportCurrentSlidePNG(infinitySlide("i1"), mixedDoc());
    expect(downloads).toEqual(["infinity-canvas.png"]);
    const artwork = await exportSlideToPNG(artworkSlide("a1"), 1920, 1080);
    expect(artwork.type).toBe("image/png");
  });

  it("exports a mixed deck as one PDF page", async () => {
    await exportPDF(mixedDoc());
    expect(pdfSpies.addImage).toHaveBeenCalledTimes(1);
    expect(pdfSpies.addPage).not.toHaveBeenCalled();
    expect(pdfSpies.save).toHaveBeenCalled();
    await exportPDF({ ...mixedDoc(), slides: [infinitySlide("only")] });
    expect(pdfSpies.addImage).toHaveBeenCalledTimes(2);
  });

  it("exports a mixed deck as one SVG", () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    exportAllSVG(mixedDoc());
    expect(downloads).toEqual(["01-keep-me.svg"]);
    expect(() => exportCurrentSlideSVG(infinitySlide("i1"))).not.toThrow();
  });

  it("sends the folded canvas to the PPTX route", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.doc.slides.map((slide: EngineSlide) => slide.id)).toEqual(["a1"]);
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
  it("does not mount a slide rail in the editor", () => {
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    expect(editor).not.toContain("SlideRail");
    expect(editor).not.toContain("not exported");
  });

  it("draws a frameless infinite board in the editor canvas", () => {
    const root = readFileSync("components/Canvas/CanvasRoot.tsx", "utf8");
    expect(root).toContain("isInfinityCanvasSlide");
    expect(root).toContain("fillBackground: !infinite");
    expect(root).toContain("drawInfinityBoard");
    expect(root).not.toContain("rgba(214, 68, 24, 0.35)");
  });
});
