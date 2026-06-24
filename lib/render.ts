import { loadCachedImage } from "./imageCache";
import { drawArrowHead, shapeDiagonal } from "./shape";
import type { SlideObject } from "./types";

export async function renderObjectsToCanvas(
  objects: SlideObject[],
  width: number,
  height: number,
  background: string | null,
  offsetX = 0,
  offsetY = 0,
  scale = 2,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  for (const raw of objects) {
    const obj = { ...raw, x: raw.x - offsetX, y: raw.y - offsetY };
    await drawObject(ctx, obj as SlideObject);
  }
  return canvas;
}

export async function renderObjectsToBlob(objects: SlideObject[]): Promise<Blob | null> {
  if (!objects.length) return null;
  const bbox = boundingBox(objects);
  const canvas = await renderObjectsToCanvas(
    objects,
    bbox.width,
    bbox.height,
    null,
    bbox.x,
    bbox.y,
    2,
  );
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function boundingBox(objects: SlideObject[]) {
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

async function drawObject(ctx: CanvasRenderingContext2D, obj: SlideObject) {
  ctx.save();
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((obj.rotation * Math.PI) / 180);
  ctx.translate(-obj.width / 2, -obj.height / 2);
  ctx.globalAlpha = obj.opacity ?? 1;

  if (obj.type === "shape") {
    ctx.fillStyle = obj.fill;
    ctx.strokeStyle = obj.stroke;
    ctx.lineWidth = obj.strokeWidth || 0;
    if (obj.shape === "rect") {
      const r = obj.cornerRadius ?? 0;
      roundRect(ctx, 0, 0, obj.width, obj.height, r);
      ctx.fill();
      if (obj.strokeWidth) ctx.stroke();
    } else if (obj.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(obj.width / 2, obj.height / 2, obj.width / 2, obj.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (obj.strokeWidth) ctx.stroke();
    } else if (obj.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(obj.width / 2, 0);
      ctx.lineTo(obj.width, obj.height);
      ctx.lineTo(0, obj.height);
      ctx.closePath();
      ctx.fill();
      if (obj.strokeWidth) ctx.stroke();
    } else if (obj.shape === "line" || obj.shape === "arrow") {
      const [sx, sy, ex, ey] = shapeDiagonal(obj);
      ctx.strokeStyle = obj.fill;
      ctx.lineWidth = Math.max(2, obj.strokeWidth || 4);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (obj.shape === "arrow") {
        drawArrowHead(ctx, sx, sy, ex, ey, obj.fill);
      }
    }
  } else if (obj.type === "text") {
    ctx.fillStyle = obj.fill;
    const bold = obj.fontStyle.includes("bold") ? "bold " : "";
    const italic = obj.fontStyle.includes("italic") ? "italic " : "";
    ctx.font = `${italic}${bold}${obj.fontSize}px ${obj.fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = obj.align;
    const lines = wrapText(ctx, obj.text, obj.width);
    const lh = obj.fontSize * obj.lineHeight;
    lines.forEach((line, i) => {
      const x = obj.align === "center" ? obj.width / 2 : obj.align === "right" ? obj.width : 0;
      ctx.fillText(line, x, i * lh);
    });
  } else if (obj.type === "image") {
    try {
      const img = await loadCachedImage(obj.src);
      ctx.drawImage(img, 0, 0, obj.width, obj.height);
    } catch {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(0, 0, obj.width, obj.height);
    }
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}
