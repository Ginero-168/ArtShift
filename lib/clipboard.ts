import { renderObjectsToBlob, renderObjectsToCanvas } from "./render";
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

  const png = allText ? null : await renderObjectsToBlob(objects);
  const pngDataUrl = png ? await blobToDataUrl(png) : null;
  const bbox = objects.length ? computeBbox(objects) : null;

  // Pure text selection → emit rich styled HTML so Docs/Slides keep the formatting.
  // Mixed selection → emit a PNG <img> so external apps get a faithful picture.
  let visibleHtml: string;
  if (allText) {
    visibleHtml = objects.map((o) => (o.type === "text" ? textObjectToStyledHtml(o) : "")).join("");
  } else if (pngDataUrl && bbox) {
    visibleHtml = `<img src="${pngDataUrl}" width="${Math.round(bbox.width)}" height="${Math.round(bbox.height)}" alt="">`;
  } else {
    visibleHtml = "";
  }
  const html = `<div ${INTERNAL_ATTR}="${encoded}">${visibleHtml}</div>`;
  const plain = textContent || " ";

  const parts: Record<string, Blob> = {
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  };
  if (png) parts["image/png"] = png;
  await writeToSystemClipboard(parts, plain);
}

export async function writeSlideToClipboard(
  slide: Slide,
  canvasWidth: number,
  canvasHeight: number,
) {
  const payload = JSON.stringify({ kind: "mighty-slide-full", slide });
  const encoded = encodeURIComponent(payload);

  // Render the full slide (with background) to PNG so pasting into Docs/Slides gets a picture.
  let pngBlob: Blob | null = null;
  try {
    const canvas = await renderObjectsToCanvas(
      slide.objects,
      canvasWidth,
      canvasHeight,
      slide.background || "#ffffff",
      0,
      0,
      2,
    );
    pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
  } catch {
    pngBlob = null;
  }
  const pngDataUrl = pngBlob ? await blobToDataUrl(pngBlob) : null;

  const visible = pngDataUrl
    ? `<img src="${pngDataUrl}" width="${canvasWidth}" height="${canvasHeight}" alt="${escapeAttr(slide.name || "slide")}">`
    : `<p>${escapeHtml(slide.name || "slide")}</p>`;
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
  if (pngBlob) parts["image/png"] = pngBlob;
  await writeToSystemClipboard(parts, plainText);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function computeBbox(objects: SlideObject[]) {
  const xs = objects.map((o) => o.x);
  const ys = objects.map((o) => o.y);
  const xe = objects.map((o) => o.x + o.width);
  const ye = objects.map((o) => o.y + o.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xe) - x),
    height: Math.max(1, Math.max(...ye) - y),
  };
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
