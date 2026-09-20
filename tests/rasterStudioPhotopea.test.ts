import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "@/lib/engine/editorController";
import { createImage } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type ImageElement } from "@/lib/engine/types";
import { commitPngRevisionToSmartObject } from "@/lib/raster/studio/commitBakedRevision";
import {
  arrayBufferToPngDataUrl,
  pngDataUrlToArrayBuffer,
} from "@/lib/raster/studio/encodeRevision";
import {
  buildPhotopeaEmbedUrl,
  classifyPhotopeaMessage,
  createPhotopeaHandshake,
  isPhotopeaMessageSource,
  isPhotopeaOrigin,
  isPngArrayBuffer,
  PHOTOPEA_ECHO_SAVE,
  PHOTOPEA_ORIGIN,
  PHOTOPEA_SAVE_SCRIPT,
} from "@/lib/raster/studio/photopea";
import { placementUnchanged, snapshotImagePlacement } from "@/lib/raster/studio/types";

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

vi.mock("@/lib/engine/imageCache", () => ({
  loadDataURL: vi.fn(async (dataURL: string) => ({
    fileId: `photopea-${dataURL.length}`,
    dataURL,
    img: {} as HTMLImageElement,
    width: 960,
    height: 540,
  })),
}));

describe("Photopea Live Messaging protocol", () => {
  it("builds a hash config without embedding pixel data", () => {
    const url = buildPhotopeaEmbedUrl();
    expect(url.startsWith(`${PHOTOPEA_ORIGIN}#`)).toBe(true);
    const config = JSON.parse(decodeURIComponent(url.slice(`${PHOTOPEA_ORIGIN}#`.length))) as {
      files?: unknown;
      environment: { customIO: { save: string }; localsave: boolean; phrases: unknown[] };
    };
    expect(config.files).toBeUndefined();
    expect(config.environment.localsave).toBe(false);
    expect(config.environment.customIO.save).toBe(PHOTOPEA_SAVE_SCRIPT);
    expect(config.environment.customIO.save).toContain('saveToOE("png")');
    expect(config.environment.phrases).toContain("Apply back to ArtShift");
  });

  it("accepts only photopea.com as the message origin", () => {
    expect(isPhotopeaOrigin(PHOTOPEA_ORIGIN)).toBe(true);
    expect(isPhotopeaOrigin("https://evil.example")).toBe(false);
    const iframeWindow = {} as Window;
    expect(
      isPhotopeaMessageSource({ origin: PHOTOPEA_ORIGIN, source: iframeWindow }, iframeWindow),
    ).toBe(true);
    expect(
      isPhotopeaMessageSource({ origin: PHOTOPEA_ORIGIN, source: iframeWindow }, {} as Window),
    ).toBe(false);
  });

  it("classifies done, echo, and binary payloads", () => {
    expect(classifyPhotopeaMessage("done")).toEqual({ kind: "done" });
    expect(classifyPhotopeaMessage(PHOTOPEA_ECHO_SAVE)).toEqual({
      kind: "echo",
      text: PHOTOPEA_ECHO_SAVE,
    });
    expect(classifyPhotopeaMessage(PNG_HEADER.buffer).kind).toBe("buffer");
    expect(classifyPhotopeaMessage({ hello: true })).toEqual({ kind: "ignore" });
    expect(isPngArrayBuffer(PNG_HEADER.buffer)).toBe(true);
    expect(isPngArrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer)).toBe(false);
  });

  it("round-trips PNG data URLs for ArrayBuffer postMessage", () => {
    const dataURL = arrayBufferToPngDataUrl(PNG_HEADER.buffer);
    const restored = pngDataUrlToArrayBuffer(dataURL);
    expect(isPngArrayBuffer(restored)).toBe(true);
    expect(new Uint8Array(restored)).toEqual(PNG_HEADER);
  });

  it("sends the working file after the first done, then treats PNG as Save", () => {
    const sent: Array<ArrayBuffer | string> = [];
    const handshake = createPhotopeaHandshake({
      fileBuffer: PNG_HEADER.buffer,
      sendBuffer: (buffer) => sent.push(buffer),
      sendScript: (script) => sent.push(script),
    });

    expect(handshake.handle({ kind: "done" })).toEqual({ type: "file-sent" });
    expect(sent[0]).toBe(PNG_HEADER.buffer);
    expect(handshake.getPhase()).toBe("awaitingOpen");
    expect(handshake.handle({ kind: "done" })).toEqual({ type: "ready" });
    expect(handshake.getPhase()).toBe("ready");

    expect(handshake.requestSave()).toBe(true);
    expect(sent[1]).toBe(PHOTOPEA_SAVE_SCRIPT);
    expect(handshake.handle({ kind: "buffer", buffer: PNG_HEADER.buffer })).toEqual({
      type: "png",
      buffer: PNG_HEADER.buffer,
    });
    expect(handshake.handle({ kind: "echo", text: PHOTOPEA_ECHO_SAVE })).toEqual({
      type: "save-echo",
    });
  });

  it("accepts File → Save PNG while ready without a prior requestSave", () => {
    const handshake = createPhotopeaHandshake({
      fileBuffer: PNG_HEADER.buffer,
      sendBuffer: vi.fn(),
      sendScript: vi.fn(),
    });
    handshake.handle({ kind: "done" });
    handshake.handle({ kind: "done" });
    expect(handshake.handle({ kind: "buffer", buffer: PNG_HEADER.buffer })).toEqual({
      type: "png",
      buffer: PNG_HEADER.buffer,
    });
  });

  it("rejects a non-PNG payload from Photopea", () => {
    const handshake = createPhotopeaHandshake({
      fileBuffer: PNG_HEADER.buffer,
      sendBuffer: vi.fn(),
      sendScript: vi.fn(),
    });
    handshake.handle({ kind: "done" });
    handshake.handle({ kind: "done" });
    const result = handshake.handle({
      kind: "buffer",
      buffer: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
    });
    expect(result).toEqual({
      type: "error",
      message: "Photopea returned a file that is not a PNG",
    });
    expect(handshake.getPhase()).toBe("error");
  });
});

describe("Photopea apply uses the Studio Save placement path", () => {
  beforeEach(() => {
    useEngine.getState().loadDoc({
      id: "doc1",
      title: "test",
      schemaVersion: ENGINE_SCHEMA_VERSION,
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "s1",
          name: "Slide 1",
          background: "#fff",
          width: 1920,
          height: 1080,
          elements: [],
          layers: [
            {
              id: "layer1",
              name: "Layer 1",
              objectIds: [],
              visible: true,
              locked: false,
              z: 1,
            },
          ],
        },
      ],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: Date.now(),
    });
  });

  it("commits Photopea PNG bytes without moving the Smart Object", async () => {
    const image = createImage({
      x: 120,
      y: 80,
      width: 480,
      height: 270,
      fileId: "photo-src",
      naturalWidth: 1920,
      naturalHeight: 1080,
    });
    image.opacity = 0.85;
    image.angle = 0.15;
    useEngine.getState().addElement(image);
    const placed = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === image.id) as ImageElement;
    const before = snapshotImagePlacement(placed);
    const controller = createEditorController({
      currentSlide: () => useEngine.getState().currentSlide(),
      updateElements: useEngine.getState().updateElements,
      applyRasterSelection: useEngine.getState().applyRasterSelection,
    });

    await commitPngRevisionToSmartObject({
      elementId: placed.id,
      placement: before,
      dataURL: arrayBufferToPngDataUrl(PNG_HEADER.buffer),
      controller,
      currentSlide: () => useEngine.getState().currentSlide(),
      historyLabel: "apply Photopea raster revision",
    });

    const after = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === placed.id) as ImageElement;
    expect(placementUnchanged(before, after)).toBe(true);
    expect(after.width).toBe(480);
    expect(after.height).toBe(270);
    expect(after.x).toBe(120);
    expect(after.y).toBe(80);
    expect(after.naturalWidth).toBe(960);
    expect(after.naturalHeight).toBe(540);
    expect(after.fileId).toBe(`photopea-${arrayBufferToPngDataUrl(PNG_HEADER.buffer).length}`);
  });
});

describe("Photopea is the primary Edit Raster path", () => {
  it("routes Edit Raster entry points to Photopea, not Raster Studio", () => {
    const session = readFileSync("lib/raster/studio/sessionStore.ts", "utf8");
    const shell = readFileSync("components/RasterStudio/RasterStudioShell.tsx", "utf8");
    const photopeaSession = readFileSync("components/RasterStudio/PhotopeaEditSession.tsx", "utf8");
    const embed = readFileSync("components/RasterStudio/PhotopeaEmbed.tsx", "utf8");
    const contextBar = readFileSync("components/Canvas/ObjectContextBar.tsx", "utf8");
    const canvas = readFileSync("components/Canvas/CanvasEditor.tsx", "utf8");
    const contextMenu = readFileSync("components/Canvas/ContextMenu.tsx", "utf8");
    const inspector = readFileSync("components/Builder/BuilderInspector.tsx", "utf8");
    const appearance = readFileSync("components/Builder/AppearancePanel.tsx", "utf8");

    expect(session).toContain('surface: "photopea"');
    expect(session).toContain("openRasterEditForElement");
    expect(session).toContain("rasterStudio");
    expect(shell).toContain("PhotopeaEditSession");
    expect(shell).toContain('surface === "photopea"');
    expect(shell).not.toContain("Open in Photopea");
    expect(shell).not.toContain("temporary hatch");
    expect(photopeaSession).toContain("commitPngRevisionToSmartObject");
    expect(photopeaSession).toContain("apply Photopea raster revision");
    expect(photopeaSession).toContain("bakeImageElementRevision");
    expect(embed).toContain("primary raster editor");
    expect(embed).toContain("photopea.com");
    expect(embed).toContain("design canvas");
    expect(embed).not.toContain("temporary hatch");
    expect(contextBar).toContain("Edit Raster");
    expect(contextBar).toContain("openRasterEditForElement");
    expect(contextBar).not.toContain("Photopea");
    expect(canvas).toContain("openRasterEditForElement");
    expect(contextMenu).toContain("openRasterEditForElement");
    expect(inspector).not.toContain("openRasterEditForElement");
    expect(inspector).not.toContain("Pixel edit");
    expect(appearance).toContain('data-appearance-row="imageAdjust"');
    expect(appearance).toContain("reset image adjustments");
  });
});
