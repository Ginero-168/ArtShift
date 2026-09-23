import type { EngineElement } from "./engine/types";
import { extractSvgFromHtml, svgToSlideObjects } from "./svgImport";
import type { Slide, SlideObject } from "./types";

const INTERNAL_ATTR = "data-mighty-slide";
const INTERNAL_SLIDE_ATTR = "data-mighty-slide-full";
const ARTSHIFT_ELEMENTS_KIND = "artshift-elements";

const ENGINE_TYPES = new Set<string>([
  "rect",
  "diamond",
  "triangle",
  "star",
  "hexagon",
  "heart",
  "plus",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "path",
  "vectorized",
  "text",
  "image",
  "bookMockup",
  "frame",
]);

export function parseTSV(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  if (!lines.length) return [];
  return lines.map((l) => l.split("\t"));
}

export function looksLikeTable(text: string): boolean {
  if (!text.includes("\t") && !text.includes("\n")) return false;
  const rows = parseTSV(text);
  if (rows.length < 1) return false;
  return rows.some((r) => r.length > 1) || rows.length > 1;
}

export function htmlToRows(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll("td,th").forEach((cell) => {
      cells.push((cell.textContent || "").trim());
    });
    if (cells.length) rows.push(cells);
  });
  return rows.length ? rows : null;
}

export function htmlToFirstImgSrc(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img");
  return img?.getAttribute("src") || null;
}

export function htmlToInternalObjects(html: string): SlideObject[] | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.querySelector(`[${INTERNAL_ATTR}]`);
  if (!el) return null;
  try {
    const raw = el.getAttribute(INTERNAL_ATTR);
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    if (parsed?.kind === "mighty-slide" && Array.isArray(parsed.objects)) {
      return parsed.objects as SlideObject[];
    }
  } catch {
    return null;
  }
  return null;
}

export function htmlToInternalSlide(html: string): Slide | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.querySelector(`[${INTERNAL_SLIDE_ATTR}]`);
  if (!el) return null;
  try {
    const raw = el.getAttribute(INTERNAL_SLIDE_ATTR);
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    if (parsed?.kind === "mighty-slide-full" && parsed.slide) {
      return parsed.slide as Slide;
    }
  } catch {
    return null;
  }
  return null;
}

function textObjectToStyledHtml(o: Extract<SlideObject, { type: "text" }>): string {
  const styles: string[] = [
    `color: ${escapeAttr(o.fill)}`,
    `font-size: ${Math.round(o.fontSize)}px`,
    `font-family: ${escapeAttr(o.fontFamily)}`,
    `line-height: ${o.lineHeight}`,
    `text-align: ${o.align}`,
    `margin: 0 0 6px 0`,
    `white-space: pre-wrap`,
  ];
  if (o.fontStyle.includes("bold")) styles.push("font-weight: 700");
  if (o.fontStyle.includes("italic")) styles.push("font-style: italic");
  const style = styles.join("; ");
  return `<p style="${style}">${escapeHtml(o.text)}</p>`;
}

async function writeToSystemClipboard(parts: Record<string, Blob>, fallbackText: string) {
  try {
    if (
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      await navigator.clipboard.write([new ClipboardItem(parts)]);
      return;
    }
  } catch (err) {
    console.warn("clipboard.write failed, falling back to writeText", err);
  }
  try {
    await navigator.clipboard.writeText(fallbackText);
  } catch {
    /* ignore */
  }
}

export function collectClipboardAssetIds(elements: EngineElement[]): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    if ((element.type === "image" || element.type === "bookMockup") && element.fileId) {
      ids.add(element.fileId);
    } else if (element.type === "frame" && element.imageFileId) {
      ids.add(element.imageFileId);
    }
  }
  return [...ids];
}

/**
 * Make image bytes portable across browser tabs.
 *
 * `data:` URLs are copied through. `blob:` URLs only resolve in the tab that
 * created them, so this reads the blob here and stores a `data:` URL instead.
 * `http(s)` URLs are kept as URLs.
 *
 * A fileId that is not itself a URL and has no in-memory cache entry is omitted.
 * The object still pastes, but the other tab cannot reconstruct pixels it never
 * received. IndexedDB is not read: a fileId alone is not a portable bitmap.
 */
export async function embedImageSourcesForClipboard(
  sources: Record<string, string | undefined>,
): Promise<Record<string, string>> {
  const assets: Record<string, string> = {};
  await Promise.all(
    Object.entries(sources).map(async ([fileId, src]) => {
      if (!src) return;
      const embedded = await portableImageSource(src);
      if (embedded) assets[fileId] = embedded;
    }),
  );
  return assets;
}

export async function readSystemClipboardHtml(): Promise<string | null> {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.read !== "function") return null;
    const items = await clipboard.read();
    for (const item of items) {
      if (!item.types?.includes("text/html")) continue;
      const html = await (await item.getType("text/html")).text();
      if (html) return html;
    }
  } catch {
    return null;
  }
  return null;
}

export function htmlToArtShiftElements(html: string): ArtShiftElementsClipboard | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.querySelector(`[${INTERNAL_ATTR}]`);
  if (!el) return null;
  try {
    const raw = el.getAttribute(INTERNAL_ATTR);
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed?.kind !== ARTSHIFT_ELEMENTS_KIND || !Array.isArray(parsed.elements)) return null;
    const elements = parsed.elements.filter(isEngineElementPayload);
    if (!elements.length) return null;
    return { elements, assets: readAssetMap(parsed.assets) };
  } catch {
    return null;
  }
}

export async function writeObjectsToClipboard(
  objects: SlideObject[] | EngineElement[],
  assets: Record<string, string> = {},
) {
  if (!objects.length) return;
  if (isEngineElementList(objects)) {
    await writeEngineElementsToClipboard(objects, assets);
    return;
  }
  const payload = JSON.stringify({ kind: "mighty-slide", objects });
  const encoded = encodeURIComponent(payload);

  const textContent = objects
    .map((o) => (o.type === "text" ? o.text : ""))
    .filter(Boolean)
    .join("\n");
  const allText = objects.every((o) => o.type === "text");

  // Pure text selection → emit rich styled HTML so Docs/Slides keep the formatting.
  // Mixed selection → emit HTML representation.
  const visibleHtml = allText
    ? objects.map((o) => (o.type === "text" ? textObjectToStyledHtml(o) : "")).join("")
    : "";
  const html = `<div ${INTERNAL_ATTR}="${encoded}">${visibleHtml}</div>`;
  const plain = textContent || " ";

  const parts: Record<string, Blob> = {
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  };
  await writeToSystemClipboard(parts, plain);
}

export async function writeSlideToClipboard(
  slide: Slide,
  _canvasWidth: number,
  _canvasHeight: number,
) {
  const payload = JSON.stringify({ kind: "mighty-slide-full", slide });
  const encoded = encodeURIComponent(payload);
  const visible = `<p>${escapeHtml(slide.name || "slide")}</p>`;
  const html = `<div ${INTERNAL_SLIDE_ATTR}="${encoded}">${visible}</div>`;
  const plainText =
    slide.objects
      .map((o) => (o.type === "text" ? o.text : ""))
      .filter(Boolean)
      .join("\n") ||
    slide.name ||
    "slide";

  const parts: Record<string, Blob> = {
    "text/plain": new Blob([plainText], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  };
  await writeToSystemClipboard(parts, plainText);
}

export type ArtShiftElementsClipboard = {
  elements: EngineElement[];
  assets: Record<string, string>;
};

export type PasteResult =
  | { kind: "slide"; slide: Slide }
  | { kind: "elements"; elements: EngineElement[]; assets: Record<string, string> }
  | { kind: "objects"; objects: SlideObject[] }
  | { kind: "image"; src: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "text"; text: string }
  | null;

export function parseClipboardEvent(cd: DataTransfer): PasteResult {
  const html = cd.getData("text/html");
  if (html) {
    const slide = htmlToInternalSlide(html);
    if (slide) return { kind: "slide", slide };
    const artshift = htmlToArtShiftElements(html);
    if (artshift) return { kind: "elements", ...artshift };
    const internal = htmlToInternalObjects(html);
    if (internal?.length) return { kind: "objects", objects: internal };
    // Detect inline SVG first (Google Slides, Figma, etc. often wrap one in HTML).
    const svgText = extractSvgFromHtml(html);
    if (svgText) {
      const objs = svgToSlideObjects(svgText);
      if (objs?.length) return { kind: "objects", objects: objs };
    }
    const rows = htmlToRows(html);
    if (rows?.length && (rows.length > 1 || rows[0].length > 1)) return { kind: "table", rows };
    const imgSrc = htmlToFirstImgSrc(html);
    if (imgSrc && /^https?:|^data:/.test(imgSrc)) return { kind: "image", src: imgSrc };
  }
  // Raw image/svg+xml in the event's data (some browsers surface it this way).
  const svgDirect = cd.getData("image/svg+xml");
  if (svgDirect) {
    const objs = svgToSlideObjects(svgDirect);
    if (objs?.length) return { kind: "objects", objects: objs };
  }
  const file = Array.from(cd.items || []).find(
    (it) => it.kind === "file" && it.type.startsWith("image/"),
  );
  if (file) {
    const f = file.getAsFile();
    if (f) {
      // caller must handle async
      return { kind: "image", src: "__pending_file__" };
    }
  }
  const text = cd.getData("text/plain");
  if (text) {
    if (looksLikeTable(text)) return { kind: "table", rows: parseTSV(text) };
    return { kind: "text", text };
  }
  return null;
}

async function writeEngineElementsToClipboard(
  elements: EngineElement[],
  assets: Record<string, string>,
) {
  const payload = JSON.stringify({
    kind: ARTSHIFT_ELEMENTS_KIND,
    elements,
    assets,
  });
  const encoded = encodeURIComponent(payload);
  const textElements = elements.filter(
    (element): element is Extract<EngineElement, { type: "text" }> => element.type === "text",
  );
  const visibleHtml = textElements.map(engineTextToStyledHtml).join("");
  const plain =
    textElements
      .map((element) => element.text)
      .filter(Boolean)
      .join("\n") || " ";
  const html = `<div ${INTERNAL_ATTR}="${encoded}">${visibleHtml}</div>`;
  const parts: Record<string, Blob> = {
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  };
  await writeToSystemClipboard(parts, plain);
}

function engineTextToStyledHtml(element: Extract<EngineElement, { type: "text" }>): string {
  const styles = [
    `color: ${escapeAttr(element.strokeColor)}`,
    `font-size: ${Math.round(element.fontSize)}px`,
    `font-family: ${escapeAttr(element.fontFamily)}`,
    `line-height: ${element.lineHeight}`,
    `text-align: ${element.textAlign}`,
    "margin: 0 0 6px 0",
    "white-space: pre-wrap",
  ];
  if (element.fontStyle.includes("bold")) styles.push("font-weight: 700");
  if (element.fontStyle.includes("italic")) styles.push("font-style: italic");
  return `<p style="${styles.join("; ")}">${escapeHtml(element.text)}</p>`;
}

function isEngineElementList(
  objects: Array<SlideObject | EngineElement>,
): objects is EngineElement[] {
  return objects.every(
    (object) =>
      !!object &&
      typeof object === "object" &&
      "angle" in object &&
      "groupIds" in object &&
      Array.isArray((object as EngineElement).groupIds),
  );
}

function isEngineElementPayload(value: unknown): value is EngineElement {
  if (!value || typeof value !== "object") return false;
  const element = value as Partial<EngineElement>;
  return (
    typeof element.id === "string" &&
    typeof element.type === "string" &&
    ENGINE_TYPES.has(element.type) &&
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number" &&
    Array.isArray(element.groupIds)
  );
}

function readAssetMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const assets: Record<string, string> = {};
  for (const [fileId, src] of Object.entries(value as Record<string, unknown>)) {
    if (typeof src !== "string" || !src) continue;
    if (!/^(data:|blob:|https?:)/i.test(src)) continue;
    assets[fileId] = src;
  }
  return assets;
}

async function portableImageSource(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return src;
  if (/^https?:/i.test(src)) return src;
  if (src.startsWith("blob:")) {
    try {
      const blob = await (await fetch(src)).blob();
      return await blobToDataURL(blob);
    } catch {
      return null;
    }
  }
  return null;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string) {
  return escapeHtml(s);
}
