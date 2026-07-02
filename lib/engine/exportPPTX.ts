/**
 * PPTX exporter for the engine doc.
 *
 * Maps EngineElements to PptxGenJS shapes where possible. Rough shapes
 * (roughness > 0) are rasterized to transparent PNGs and embedded as
 * images to preserve visual fidelity.
 */

import { type RenderCtx, renderElement } from "../renderer/canvas";
import type { EngineDoc, EngineElement, ImageElement, TextElement } from "./types";

const PX_TO_IN = 1 / 96;

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
 * Used for rough shapes that can't be natively mapped to PPTX shapes.
 */
async function rasterizeElement(
  el: EngineElement,
  images?: Map<string, HTMLImageElement>,
): Promise<string> {
  const pad = 4; // padding around the element
  const scale = 2;
  const w = el.width + pad * 2;
  const h = el.height + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.scale(scale, scale);

  // Translate so element draws at (pad, pad) instead of (el.x, el.y)
  ctx.save();
  const cx = pad + el.width / 2;
  const cy = pad + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);

  // Temporarily override element position so renderElement draws at origin
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

export async function exportPPTX(doc: EngineDoc, images?: Map<string, HTMLImageElement>) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  const wIn = doc.width * PX_TO_IN;
  const hIn = doc.height * PX_TO_IN;
  pptx.defineLayout({ name: "ARTSHIFT", width: wIn, height: hIn });
  pptx.layout = "ARTSHIFT";

  const px = (n: number) => n * PX_TO_IN;

  for (const slide of doc.slides) {
    const s = pptx.addSlide();
    s.background = { color: (slide.background || "#ffffff").replace("#", "") };

    const ordered = [...slide.elements].filter((e) => !e.isDeleted).sort((a, b) => a.z - b.z);

    for (const el of ordered) {
      if (el.type === "frame") continue; // frames are structural only

      const common = {
        x: px(el.x),
        y: px(el.y),
        w: px(el.width),
        h: px(el.height),
        rotate: (el.angle * 180) / Math.PI,
      };

      // Text elements
      if (el.type === "text") {
        const te = el as TextElement;
        s.addText(te.text, {
          ...common,
          fontSize: Math.max(8, Math.round(te.fontSize * 0.75)),
          fontFace: te.fontFamily.split(",")[0].replace(/['"]/g, "").trim() || "Noto Sans Thai",
          color: te.strokeColor.replace("#", ""),
          bold: te.fontStyle.includes("bold"),
          italic: te.fontStyle.includes("italic"),
          align: te.textAlign,
          valign:
            te.verticalAlign === "middle"
              ? "middle"
              : te.verticalAlign === "bottom"
                ? "bottom"
                : "top",
        });
        continue;
      }

      // Image elements
      if (el.type === "image") {
        const ie = el as ImageElement;
        const img = images?.get(ie.fileId);
        if (img?.src) {
          try {
            const data = await toDataUrl(img.src);
            s.addImage({ ...common, data });
          } catch {
            s.addText(`[image]`, { ...common, color: "888888", fontSize: 10 });
          }
        } else {
          s.addText(`[image]`, { ...common, color: "888888", fontSize: 10 });
        }
        continue;
      }

      // Simple shapes (roughness == 0) — map to native PPTX shapes
      if (
        (el.type === "rect" || el.type === "ellipse" || el.type === "diamond") &&
        el.roughness === 0
      ) {
        const ST = pptx.ShapeType as Record<string, unknown>;
        const shapeMap: Record<string, unknown> = {
          rect: ST.roundRect ?? ST.rect,
          ellipse: ST.ellipse,
          diamond: ST.diamond,
        };
        const kind = shapeMap[el.type] as Parameters<typeof s.addShape>[0];
        if (kind) {
          s.addShape(kind, {
            ...common,
            fill: {
              color: (el.backgroundColor || "ffffff")
                .replace("#", "")
                .replace("transparent", "ffffff"),
            },
            line:
              el.strokeWidth > 0
                ? { color: el.strokeColor.replace("#", ""), width: el.strokeWidth }
                : { type: "none" as const },
          });
          continue;
        }
      }

      // Rough shapes + freedraw + lines/arrows → rasterize to image
      try {
        const data = await rasterizeElement(el, images);
        const pad = 4;
        s.addImage({
          data,
          x: px(el.x - pad),
          y: px(el.y - pad),
          w: px(el.width + pad * 2),
          h: px(el.height + pad * 2),
        });
      } catch {
        // silently skip unrenderable elements
      }
    }
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  download(blob, `${slugify(doc.title || "slides")}.pptx`);
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
