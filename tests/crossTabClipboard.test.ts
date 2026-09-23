import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCanvasHotkey } from "@/components/Canvas/useCanvasHotkeys";
import { htmlToArtShiftElements } from "@/lib/clipboard";
import { createImage, createRect, createText } from "@/lib/engine/factory";
import * as imageCache from "@/lib/engine/imageCache";
import { createEmptyEngineDoc, useEngine } from "@/lib/engine/store";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

class CapturingItem {
  readonly parts: Record<string, Blob>;
  constructor(parts: Record<string, Blob>) {
    this.parts = parts;
  }
  get types() {
    return Object.keys(this.parts);
  }
  async getType(type: string) {
    const blob = this.parts[type];
    if (!blob) throw new Error(`missing ${type}`);
    return blob;
  }
}

function installClipboard() {
  vi.stubGlobal("ClipboardItem", CapturingItem);
  const captured: CapturingItem[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: async (items: CapturingItem[]) => {
        captured.splice(0, captured.length, ...items);
      },
      writeText: async () => {},
      read: async () => captured,
      readText: async () => "",
    },
  });
  return {
    async html() {
      const item = captured.at(-1);
      if (!item) return "";
      return (await item.getType("text/html")).text();
    },
    count: () => captured.length,
    clear: () => captured.splice(0, captured.length),
  };
}

function liveElements() {
  return (
    useEngine
      .getState()
      .currentSlide()
      ?.elements.filter((element) => !element.isDeleted) ?? []
  );
}

describe("cross-tab canvas clipboard", () => {
  let clipboard: ReturnType<typeof installClipboard>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    clipboard = installClipboard();
    useEngine.getState().loadDoc(createEmptyEngineDoc("Clipboard"));
    useEngine.setState({ clipboard: null, selectedIds: new Set() });
  });

  it("copy writes a mighty-slide HTML payload", async () => {
    const text = createText({ x: 30, y: 40, text: "Ship the poster" });
    useEngine.getState().addElement(text);
    useEngine.getState().selectOnly([text.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true }));

    await vi.waitFor(async () => {
      expect(await clipboard.html()).toContain("data-mighty-slide");
    });
    const html = await clipboard.html();
    const parsed = htmlToArtShiftElements(html);
    expect(
      parsed?.elements.map((element) => (element.type === "text" ? element.text : "")),
    ).toEqual(["Ship the poster"]);
    expect(html).toContain("Ship the poster");
    expect(useEngine.getState().clipboard).toHaveLength(1);
  });

  it("pastes mighty-slide HTML when the in-memory clipboard is empty", async () => {
    const text = createText({ x: 30, y: 40, text: "From the other tab" });
    useEngine.getState().addElement(text);
    useEngine.getState().copyElements([text.id]);
    await vi.waitFor(async () => {
      expect(await clipboard.html()).toContain("data-mighty-slide");
    });
    const html = await clipboard.html();

    useEngine.getState().loadDoc(createEmptyEngineDoc("Other tab"));
    useEngine.setState({ clipboard: null });
    expect(useEngine.getState().clipboard).toBeNull();

    expect(useEngine.getState().pasteClipboardHtml(html)).toBe(true);
    const pasted = liveElements();
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).toMatchObject({ type: "text", text: "From the other tab" });
    expect(pasted[0]?.id).not.toBe(text.id);
  });

  it("pastes classic mighty-slide object HTML into the canvas", async () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        kind: "mighty-slide",
        objects: [
          {
            id: "legacy-1",
            type: "text",
            x: 10,
            y: 12,
            width: 200,
            height: 40,
            rotation: 0,
            opacity: 1,
            text: "Legacy payload",
            fontSize: 20,
            fontFamily: "Inter",
            fontStyle: "normal",
            align: "left",
            fill: "#222",
            lineHeight: 1.2,
          },
        ],
      }),
    );
    const html = `<div data-mighty-slide="${payload}"><p>Legacy payload</p></div>`;
    useEngine.setState({ clipboard: null });
    expect(useEngine.getState().pasteClipboardHtml(html)).toBe(true);
    await vi.waitFor(() => {
      expect(
        liveElements().some(
          (element) => element.type === "text" && element.text === "Legacy payload",
        ),
      ).toBe(true);
    });
  });

  it("keeps same-tab paste on the in-memory clipboard", () => {
    const text = createText({ x: 8, y: 8, text: "Same tab" });
    useEngine.getState().addElement(text);
    useEngine.getState().selectOnly([text.id]);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true }));
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "v", code: "KeyV", metaKey: true }));
    expect(liveElements().filter((element) => element.type === "text")).toHaveLength(2);
    expect(useEngine.getState().clipboard).toHaveLength(1);
  });

  it("reads the system clipboard from paste when memory is empty", async () => {
    const rect = createRect({ x: 20, y: 20, width: 80, height: 40 });
    useEngine.getState().addElement(rect);
    useEngine.getState().copyElements([rect.id]);
    await vi.waitFor(() => expect(clipboard.count()).toBe(1));

    useEngine.getState().loadDoc(createEmptyEngineDoc("Other tab"));
    useEngine.setState({ clipboard: null });
    useEngine.getState().pasteElements();
    await vi.waitFor(() => {
      expect(liveElements().some((element) => element.type === "rect")).toBe(true);
    });
  });

  it("embeds cached image bytes and still pastes a fileId that cannot be resolved", async () => {
    const cached = createImage({
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      fileId: "cached-file",
      naturalWidth: 1,
      naturalHeight: 1,
    });
    const missing = createImage({
      x: 60,
      y: 10,
      width: 40,
      height: 40,
      fileId: "missing-file",
      naturalWidth: 8,
      naturalHeight: 8,
    });
    vi.spyOn(imageCache, "getCached").mockImplementation((fileId: string) => {
      if (fileId !== "cached-file") return undefined;
      return {
        fileId,
        dataURL: PNG,
        img: new Image(),
        width: 1,
        height: 1,
      };
    });

    useEngine.getState().addElement(cached);
    useEngine.getState().addElement(missing);
    useEngine.getState().copyElements([cached.id, missing.id]);
    await vi.waitFor(async () => {
      expect(await clipboard.html()).toContain("cached-file");
    });
    const parsed = htmlToArtShiftElements(await clipboard.html());
    expect(parsed?.assets["cached-file"]).toBe(PNG);
    expect(parsed?.assets["missing-file"]).toBeUndefined();

    useEngine.getState().loadDoc(createEmptyEngineDoc("Other tab"));
    useEngine.setState({ clipboard: null });
    expect(useEngine.getState().pasteClipboardHtml(await clipboard.html())).toBe(true);
    await vi.waitFor(() => {
      expect(liveElements().filter((element) => element.type === "image")).toHaveLength(2);
    });
    const images = liveElements().filter((element) => element.type === "image");
    expect(images.map((element) => element.fileId).sort()).toEqual(["cached-file", "missing-file"]);
  });

  it("does not treat Docs or Figma HTML as an internal paste", () => {
    expect(useEngine.getState().pasteClipboardHtml("<p>Hello from Docs</p>")).toBe(false);
    expect(
      useEngine
        .getState()
        .pasteClipboardHtml(
          '<div><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg></div>',
        ),
    ).toBe(false);
    expect(liveElements()).toHaveLength(0);
  });

  it("cut writes the system clipboard and removes the selection", async () => {
    const text = createText({ x: 4, y: 4, text: "Cut me" });
    useEngine.getState().addElement(text);
    useEngine.getState().selectOnly([text.id]);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "x", code: "KeyX", metaKey: true }));
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find((element) => element.id === text.id)?.isDeleted,
    ).toBe(true);
    await vi.waitFor(async () => {
      const parsed = htmlToArtShiftElements(await clipboard.html());
      expect(parsed?.elements[0]).toMatchObject({ type: "text", text: "Cut me" });
    });
  });
});
