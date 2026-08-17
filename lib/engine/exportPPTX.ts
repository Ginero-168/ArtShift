/**
 * PPTX exporter for the engine doc.
 * Sends document and rasterized visual elements to server API route /api/export/pptx
 * to avoid client-side bundling of Node.js modules (fs, https).
 */

import { type RenderCtx, renderElement } from "../renderer/canvas";
import { getRenderableElements } from "./layers";
import type { EngineDoc, EngineElement, ImageElement } from "./types";

export type PptxSlideTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

/**
 * PPTX has one page layout per deck. Mixed-ratio Artworks are proportionally
 * fitted and centered into that layout instead of being stretched or clipped.
 */
export function getPptxSlideTransform(
  source: { width: number; height: number },
  target: { width: number; height: number },
): PptxSlideTransform {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
  return {
    scale,
    offsetX: (target.width - sourceWidth * scale) / 2,
    offsetY: (target.height - sourceHeight * scale) / 2,
  };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

/**
 * Rasterize a single EngineElement into a data URL at 2× resolution.
 * Used for rough shapes, freedraw, and vector paths that can't be natively mapped to basic PPTX shapes.
 */
async function rasterizeElement(
  el: EngineElement,
  images?: Map<string, HTMLImageElement>,
): Promise<string> {
  const pad = 4;
  const scale = 2;
  const w = el.width + pad * 2;
  const h = el.height + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.scale(scale, scale);

  ctx.save();
  const cx = pad + el.width / 2;
  const cy = pad + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);

  const origX = el.x;
  const origY = el.y;
  const origAngle = el.angle;
  (el as EngineElement).x = 0;
  (el as EngineElement).y = 0;
  (el as EngineElement).angle = 0;

  try {
    renderElement(el, { ctx, images } as RenderCtx);
  } finally {
    (el as EngineElement).x = origX;
    (el as EngineElement).y = origY;
    (el as EngineElement).angle = origAngle;
  }
  ctx.restore();

  return canvas.toDataURL("image/png");
}

async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src, { mode: "cors" });
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Exports the engine document to PPTX format by sending payload to /api/export/pptx.
 */
export async function exportPPTX(doc: EngineDoc, images?: Map<string, HTMLImageElement>) {
  const rasterizedImages: Record<string, string> = {};

  // Pre-rasterize rough/complex elements and convert image assets to Data URLs on client
  for (const slide of doc.slides) {
    const ordered = getRenderableElements(slide);
    for (const el of ordered) {
      if (el.type === "image") {
        const ie = el as ImageElement;
        const img = images?.get(ie.fileId);
        if (img?.src) {
          try {
            rasterizedImages[ie.fileId] = await toDataUrl(img.src);
          } catch {
            // skip if failed
          }
        }
      } else if (
        el.type !== "text" &&
        !(
          (el.type === "rect" || el.type === "ellipse" || el.type === "diamond") &&
          el.roughness === 0
        ) &&
        el.type !== "frame"
      ) {
        try {
          rasterizedImages[el.id] = await rasterizeElement(el, images);
        } catch {
          // skip
        }
      }
    }
  }

  const response = await fetch("/api/export/pptx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      doc,
      rasterizedImages,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(errorData.error || `Export failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const filename = `${slugify(doc.title || "slides")}.pptx`;
  download(blob, filename);
}
