import { describe, expect, it, vi } from "vitest";
import {
  embedImageSourcesForClipboard,
  htmlToArtShiftElements,
  htmlToInternalObjects,
  htmlToRows,
  looksLikeTable,
  parseClipboardEvent,
  parseTSV,
  writeObjectsToClipboard,
} from "@/lib/clipboard";
import { createText } from "@/lib/engine/factory";

describe("parseTSV", () => {
  it("splits rows and cells", () => {
    expect(parseTSV("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("handles CRLF and trailing newline", () => {
    expect(parseTSV("a\tb\r\nc\td\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("looksLikeTable", () => {
  it("rejects plain words", () => {
    expect(looksLikeTable("hello world")).toBe(false);
  });
  it("accepts tab-separated content", () => {
    expect(looksLikeTable("a\tb\nc\td")).toBe(true);
  });
});

describe("htmlToRows", () => {
  it("extracts cells from <table>", () => {
    const html = "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>";
    expect(htmlToRows(html)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
  it("returns null when no table", () => {
    expect(htmlToRows("<p>nope</p>")).toBeNull();
  });
});

describe("system clipboard payload", () => {
  it("embeds data URLs and converts blob URLs so another tab can read them", async () => {
    const blob = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" });
    const blobUrl = "blob:https://artshift.io/tab-local";
    // Browsers can fetch blob: URLs. happy-dom cannot, so this stubs the read.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === blobUrl) return new Response(blob);
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    const assets = await embedImageSourcesForClipboard({
      dataFile: "data:image/png;base64,AAAA",
      blobFile: blobUrl,
      remote: "https://example.com/a.png",
      missing: undefined,
    });
    expect(assets.dataFile).toBe("data:image/png;base64,AAAA");
    expect(assets.blobFile?.startsWith("data:image/png;base64,")).toBe(true);
    expect(assets.remote).toBe("https://example.com/a.png");
    expect(assets.missing).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("writes mighty-slide HTML for legacy objects and engine elements", async () => {
    class CapturingItem {
      readonly parts: Record<string, Blob>;
      constructor(parts: Record<string, Blob>) {
        this.parts = parts;
      }
      get types() {
        return Object.keys(this.parts);
      }
    }
    vi.stubGlobal("ClipboardItem", CapturingItem);
    const htmlWrites: string[] = [];
    const plainWrites: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: CapturingItem[]) => {
          for (const item of items) {
            htmlWrites.push(await item.parts["text/html"].text());
            plainWrites.push(await item.parts["text/plain"].text());
          }
        },
        writeText: async () => {},
      },
    });

    await writeObjectsToClipboard([
      {
        id: "legacy-text",
        type: "text",
        x: 1,
        y: 2,
        width: 80,
        height: 24,
        rotation: 0,
        opacity: 1,
        text: "Legacy",
        fontSize: 16,
        fontFamily: "Inter",
        fontStyle: "bold",
        align: "left",
        fill: "#112233",
        lineHeight: 1.2,
      },
    ]);
    const legacyHtml = htmlWrites[0];
    expect(legacyHtml).toContain("data-mighty-slide");
    expect(htmlToInternalObjects(legacyHtml)?.[0]).toMatchObject({ text: "Legacy" });
    expect(legacyHtml).toContain("font-weight: 700");

    const element = createText({ x: 12, y: 16, text: "Across tabs" });
    await writeObjectsToClipboard([element], { "file-1": "data:image/png;base64,BBBB" });
    const engineHtml = htmlWrites[1];
    const plain = plainWrites[1];
    expect(engineHtml).toContain("data-mighty-slide");
    expect(engineHtml).toContain("Across tabs");
    expect(plain).toBe("Across tabs");
    const parsed = htmlToArtShiftElements(engineHtml);
    expect(parsed?.elements[0]).toMatchObject({ type: "text", text: "Across tabs" });
    expect(parsed?.assets["file-1"]).toBe("data:image/png;base64,BBBB");

    const transfer = new DataTransfer();
    transfer.setData("text/html", engineHtml);
    transfer.setData("text/plain", plain);
    expect(parseClipboardEvent(transfer)).toMatchObject({
      kind: "elements",
      elements: [expect.objectContaining({ text: "Across tabs" })],
    });

    const docs = new DataTransfer();
    docs.setData("text/html", "<p>Hello from Docs</p>");
    docs.setData("text/plain", "Hello from Docs");
    expect(parseClipboardEvent(docs)).toEqual({ kind: "text", text: "Hello from Docs" });
  });
});
