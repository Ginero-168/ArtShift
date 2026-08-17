/**
 * PNG / PDF exporter for engine slides.
 *
 * Renders the slide into an offscreen canvas at native resolution
 * (1920×1080 by default) using the same Canvas2D renderer the editor
 * uses, then returns a Blob suitable for download.
 */

import { renderSlide } from "../renderer/canvas";
import type { EngineDoc, EngineSlide } from "./types";

export async function exportSlideToPNG(
  slide: EngineSlide,
  width: number,
  height: number,
  images?: Map<string, HTMLImageElement>,
  scale = 2,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context");
  ctx.scale(scale, scale);
  renderSlide(slide, { ctx, images }, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("PNG encoding failed"));
    }, "image/png");
  });
}

/** Export slide to WebP blob with configurable quality and scale. */
export async function exportSlideToWebP(
  slide: EngineSlide,
  width: number,
  height: number,
  images?: Map<string, HTMLImageElement>,
  quality = 0.88,
  scale = 2,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context");
  ctx.scale(scale, scale);
  renderSlide(slide, { ctx, images }, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("WebP encoding failed"));
      },
      "image/webp",
      quality,
    );
  });
}

/** Export slide to JPEG blob with configurable quality and scale. */
export async function exportSlideToJPEG(
  slide: EngineSlide,
  width: number,
  height: number,
  images?: Map<string, HTMLImageElement>,
  quality = 0.9,
  scale = 2,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width * scale, height * scale);
  ctx.scale(scale, scale);
  renderSlide(slide, { ctx, images }, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("JPEG encoding failed"));
      },
      "image/jpeg",
      quality,
    );
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function slugify(s: string) {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/gi, "-")
      .replace(/^-|-$/g, "") || "slides"
  );
}

/** Export current slide as PNG and download. */
export async function exportCurrentSlidePNG(
  slide: EngineSlide,
  _doc: EngineDoc,
  images?: Map<string, HTMLImageElement>,
) {
  const blob = await exportSlideToPNG(slide, slide.width, slide.height, images, 2);
  download(blob, `${slugify(slide.name || "slide")}.png`);
}

/** Export current slide as WebP (optimized for web & social ads). */
export async function exportCurrentSlideWebP(
  slide: EngineSlide,
  _doc: EngineDoc,
  images?: Map<string, HTMLImageElement>,
  quality = 0.88,
) {
  const blob = await exportSlideToWebP(slide, slide.width, slide.height, images, quality, 2);
  download(blob, `${slugify(slide.name || "slide")}.webp`);
}

/** Export current slide as JPEG and download. */
export async function exportCurrentSlideJPEG(
  slide: EngineSlide,
  _doc: EngineDoc,
  images?: Map<string, HTMLImageElement>,
  quality = 0.9,
) {
  const blob = await exportSlideToJPEG(slide, slide.width, slide.height, images, quality, 2);
  download(blob, `${slugify(slide.name || "slide")}.jpg`);
}

/** Export all slides as individual PNGs. */
export async function exportAllPNG(doc: EngineDoc, images?: Map<string, HTMLImageElement>) {
  for (let i = 0; i < doc.slides.length; i++) {
    const slide = doc.slides[i];
    const blob = await exportSlideToPNG(slide, slide.width, slide.height, images, 2);
    download(blob, `${String(i + 1).padStart(2, "0")}-${slugify(slide.name)}.png`);
  }
}

/** Export all slides as individual WebPs. */
export async function exportAllWebP(
  doc: EngineDoc,
  images?: Map<string, HTMLImageElement>,
  quality = 0.88,
) {
  for (let i = 0; i < doc.slides.length; i++) {
    const slide = doc.slides[i];
    const blob = await exportSlideToWebP(slide, slide.width, slide.height, images, quality, 2);
    download(blob, `${String(i + 1).padStart(2, "0")}-${slugify(slide.name)}.webp`);
  }
}

/** Export all slides stitched into a single PDF. */
export async function exportPDF(doc: EngineDoc, images?: Map<string, HTMLImageElement>) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation:
      (doc.slides[0]?.width ?? doc.width) >= (doc.slides[0]?.height ?? doc.height)
        ? "landscape"
        : "portrait",
    unit: "px",
    format: [doc.slides[0]?.width ?? doc.width, doc.slides[0]?.height ?? doc.height],
    hotfixes: ["px_scaling"],
  });

  for (let i = 0; i < doc.slides.length; i++) {
    if (i > 0) {
      const slide = doc.slides[i];
      pdf.addPage(
        [slide.width, slide.height],
        slide.width >= slide.height ? "landscape" : "portrait",
      );
    }
    const slide = doc.slides[i];
    const blob = await exportSlideToPNG(slide, slide.width, slide.height, images, 2);
    const dataUrl = await blobToDataURL(blob);
    pdf.addImage(dataUrl, "PNG", 0, 0, slide.width, slide.height);
  }

  pdf.save(`${slugify(doc.title || "slides")}.pdf`);
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
