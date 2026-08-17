import { extractSvgFromHtml, svgToSlideObjects } from "./svgImport";
import type { Slide, SlideObject } from "./types";

const INTERNAL_ATTR = "data-mighty-slide";
const INTERNAL_SLIDE_ATTR = "data-mighty-slide-full";

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

export async function writeObjectsToClipboard(objects: SlideObject[]) {
  if (!objects.length) return;
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

export type PasteResult =
  | { kind: "slide"; slide: Slide }
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
