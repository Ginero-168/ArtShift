/**
 * Canvas2D scene renderer for the engine.
 *
 * Renders an entire slide into a 2D context. The context is expected to be
 * already transformed to slide-local coords by the caller (so we can reuse
 * this renderer for both the live editor canvas and offscreen exports).
 *
 * For Phase 1 we redraw the whole scene each frame. Dirty-rect / per-element
 * caching ships in Phase 2.
 */

import type { RoughCanvas } from "roughjs/bin/canvas";
import type { ColorAdjustments } from "../color/adjustments";
import { applyColorAdjustments } from "../color/adjustments";
import { freedrawPath } from "../engine/freehand";
import { buildRoughShape } from "../engine/rough";
import type {
  ArrowElement,
  EngineElement,
  EngineSlide,
  ImageElement,
  TextElement,
} from "../engine/types";
import { getCachedElement, setCachedElement } from "./cache";

export type RenderCtx = {
  ctx: CanvasRenderingContext2D;
  /** Optional image cache keyed by `ImageElement.fileId`. */
  images?: Map<string, HTMLImageElement>;
};

let _rcCanvas: HTMLCanvasElement | null = null;
let _rc: RoughCanvas | null = null;
let _rough: typeof import("roughjs/bin/rough") | null = null;
function roughCanvas(target: HTMLCanvasElement): RoughCanvas {
  if (_rc && _rcCanvas === target) return _rc;
  if (!_rough) _rough = require("roughjs/bin/rough");
  _rcCanvas = target;
  _rc = _rough!.default.canvas(target);
  return _rc;
}

export function renderSlide(slide: EngineSlide, render: RenderCtx, slideW: number, slideH: number) {
  const { ctx } = render;
  // Background.
  ctx.save();
  ctx.fillStyle = slide.background;
  ctx.fillRect(0, 0, slideW, slideH);
  ctx.restore();

  // Render in z-order (assumed already sorted by caller; we re-sort defensively).
  const ordered = [...slide.elements].filter((e) => !e.isDeleted).sort((a, b) => a.z - b.z);

  const frames = ordered.filter(
    (el) => el.type === "frame",
  ) as import("../engine/types").FrameElement[];

  for (const el of ordered) {
    let clipFrame: import("../engine/types").FrameElement | undefined;
    for (const f of frames) {
      if (f.childIds.includes(el.id)) {
        clipFrame = f;
        break;
      }
    }

    if (clipFrame) {
      ctx.save();
      ctx.beginPath();
      // clipFrame is unrotated for clipping simplicity in this phase
      ctx.rect(clipFrame.x, clipFrame.y, clipFrame.width, clipFrame.height);
      ctx.clip();
      renderElement(el, render);
      ctx.restore();
    } else {
      renderElement(el, render);
    }
  }
}

export function renderElement(el: EngineElement, render: RenderCtx) {
  const { ctx } = render;
  let cached = getCachedElement(el);

  if (!cached) {
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(1, Math.ceil(el.width));
    offscreen.height = Math.max(1, Math.ceil(el.height));
    const octx = offscreen.getContext("2d");
    if (octx) {
      renderElementContent(el, octx, render);
    }
    cached = offscreen;
    setCachedElement(el, cached);
  }

  ctx.save();
  ctx.globalAlpha *= el.opacity;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);
  ctx.drawImage(cached, 0, 0);
  ctx.restore();
}

function renderElementContent(el: EngineElement, ctx: CanvasRenderingContext2D, render: RenderCtx) {
  // Apply shadow if present.
  if (el.shadow) {
    ctx.shadowColor = el.shadow.color;
    ctx.shadowBlur = el.shadow.blur;
    ctx.shadowOffsetX = el.shadow.offsetX;
    ctx.shadowOffsetY = el.shadow.offsetY;
  }

  switch (el.type) {
    case "rect":
    case "ellipse":
    case "diamond":
    case "triangle":
    case "star":
    case "hexagon":
    case "heart":
    case "plus":
    case "line":
    case "arrow": {
      const hasGradient = el.fillType === "linear" || el.fillType === "radial";
      const hasPattern = !!el.fillPattern;
      if (hasGradient) {
        const gShape = buildRoughShape({ ...el, backgroundColor: "transparent" } as EngineElement);
        if (gShape) {
          const rc = roughCanvas(ctx.canvas);
          rc.draw(gShape);
        }
        const colors = el.gradientColors ?? ["#6366f1", "#a855f7"];
        let grad: CanvasGradient;
        if (el.fillType === "linear") {
          grad = ctx.createLinearGradient(0, 0, el.width, el.height);
        } else {
          grad = ctx.createRadialGradient(
            el.width / 2,
            el.height / 2,
            0,
            el.width / 2,
            el.height / 2,
            Math.max(el.width, el.height) / 2,
          );
        }
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;
        ctx.globalAlpha = el.opacity;
        fillShapePath(ctx, el);
        ctx.globalAlpha = 1;
      } else if (hasPattern) {
        const shape = buildRoughShape({ ...el, backgroundColor: "transparent" } as EngineElement);
        if (shape) {
          const rc = roughCanvas(ctx.canvas);
          rc.draw(shape);
        }
        ctx.fillStyle = el.backgroundColor === "transparent" ? el.strokeColor : el.backgroundColor;
        ctx.globalAlpha = el.opacity * 0.3;
        fillShapePath(ctx, el);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.clip();
        drawPattern(ctx, el, el.fillPattern!);
        ctx.restore();
      } else {
        const shape = buildRoughShape(el);
        if (shape) {
          const rc = roughCanvas(ctx.canvas);
          rc.draw(shape);
        }
      }
      if (el.type === "arrow") drawArrowHeads(ctx, el);
      break;
    }
    case "freedraw":
      drawFreedraw(ctx, el);
      break;
    case "text":
      drawText(ctx, el);
      break;
    case "image":
      drawImage(ctx, el as ImageElement, render);
      break;
    case "frame":
      drawFrame(ctx, el as import("../engine/types").FrameElement);
      break;
  }

  if (el.shadow) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

// ——— per-type draw helpers ———

function drawFreedraw(ctx: CanvasRenderingContext2D, el: EngineElement) {
  if (el.type !== "freedraw") return;
  const path = freedrawPath(el);
  ctx.fillStyle = el.strokeColor;
  ctx.fill(path);
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "top";
  ctx.textAlign =
    el.textAlign === "center" ? "center" : el.textAlign === "right" ? "right" : "left";
  const lines = el.text.split("\n");
  const lh = el.fontSize * el.lineHeight;
  const totalH = lines.length * lh;
  let y = 0;
  if (el.verticalAlign === "middle") y = (el.height - totalH) / 2;
  else if (el.verticalAlign === "bottom") y = el.height - totalH;

  for (const rawLine of lines) {
    const isBullet = rawLine.startsWith("- ") || rawLine.startsWith("• ");
    const line = isBullet ? rawLine.slice(2) : rawLine;
    const bulletIndent = isBullet ? el.fontSize * 0.8 : 0;

    const xAnchor =
      el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;

    // Draw bullet character.
    if (isBullet) {
      setFont(ctx, el, false, false);
      const bx = el.textAlign === "center" ? xAnchor - bulletIndent : xAnchor;
      ctx.fillText("•", bx, y);
    }

    // Parse and render rich text segments.
    const segments = parseRichText(line);
    let x = xAnchor;
    if (el.textAlign === "left") x += bulletIndent;
    if (el.textAlign === "center") x += bulletIndent / 2;

    for (const seg of segments) {
      setFont(ctx, el, seg.bold, seg.italic);
      const segWidth = ctx.measureText(seg.text).width;
      ctx.fillText(seg.text, x, y);
      x += segWidth;
    }

    y += lh;
  }
}

function setFont(ctx: CanvasRenderingContext2D, el: TextElement, bold: boolean, italic: boolean) {
  const weight = bold || el.fontStyle.includes("bold") ? "bold" : "normal";
  const style = italic || el.fontStyle.includes("italic") ? "italic" : "normal";
  ctx.font = `${weight} ${style} ${el.fontSize}px ${el.fontFamily}`;
}

type Segment = { text: string; bold: boolean; italic: boolean };

function parseRichText(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let current = "";

  function flush() {
    if (current) {
      segments.push({ text: current, bold, italic });
      current = "";
    }
  }

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      flush();
      bold = !bold;
      i += 2;
    } else if (text[i] === "*") {
      flush();
      italic = !italic;
      i += 1;
    } else {
      current += text[i];
      i++;
    }
  }
  flush();
  if (segments.length === 0) segments.push({ text, bold: false, italic: false });
  return segments;
}

const _adjCache = new Map<string, HTMLCanvasElement>();

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement, render: RenderCtx) {
  const img = render.images?.get(el.fileId);
  if (!img?.complete || img.naturalWidth === 0) {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.strokeStyle = "#9ca3af";
    ctx.strokeRect(0.5, 0.5, el.width - 1, el.height - 1);
    return;
  }

  let drawSrc: CanvasImageSource = img;

  // Apply color adjustments if present
  if (el.adjustments && Object.keys(el.adjustments).length > 0) {
    const cacheKey = `${el.fileId}:${stableStringify(el.adjustments)}`;
    let adjCanvas = _adjCache.get(cacheKey);
    if (!adjCanvas) {
      adjCanvas = document.createElement("canvas");
      adjCanvas.width = img.naturalWidth;
      adjCanvas.height = img.naturalHeight;
      const adjCtx = adjCanvas.getContext("2d")!;
      adjCtx.drawImage(img, 0, 0);
      const imageData = adjCtx.getImageData(0, 0, adjCanvas.width, adjCanvas.height);
      applyColorAdjustments(imageData, el.adjustments as Partial<ColorAdjustments>);
      adjCtx.putImageData(imageData, 0, 0);
      _adjCache.set(cacheKey, adjCanvas);
    }
    drawSrc = adjCanvas;
  }

  if (el.crop) {
    ctx.drawImage(
      drawSrc,
      el.crop.x,
      el.crop.y,
      el.crop.width,
      el.crop.height,
      0,
      0,
      el.width,
      el.height,
    );
  } else {
    ctx.drawImage(drawSrc, 0, 0, el.width, el.height);
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, el: import("../engine/types").FrameElement) {
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, el.width, el.height);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(el.name, 0, -4);
}

function drawArrowHeads(ctx: CanvasRenderingContext2D, el: ArrowElement) {
  if (el.points.length < 2) return;
  const scale = el.arrowheadScale ?? 1;
  if (el.startArrowhead !== "none") {
    const a = el.points[1];
    const b = el.points[0];
    drawArrowhead(ctx, b, a, el.startArrowhead, el.strokeColor, el.strokeWidth, scale);
  }
  if (el.endArrowhead !== "none") {
    const n = el.points.length;
    const a = el.points[n - 2];
    const b = el.points[n - 1];
    drawArrowhead(ctx, b, a, el.endArrowhead, el.strokeColor, el.strokeWidth, scale);
  }
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: [number, number],
  toward: [number, number],
  kind: ArrowElement["endArrowhead"],
  color: string,
  width: number,
  scale: number = 1,
) {
  const dx = tip[0] - toward[0];
  const dy = tip[1] - toward[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = Math.max(14, width * 6) * scale;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  switch (kind) {
    case "arrow":
    case "triangle":
    case "triangle_outline": {
      const angle = Math.PI / 7;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const lx = tip[0] - size * (ux * cos + uy * sin);
      const ly = tip[1] - size * (uy * cos - ux * sin);
      const rx = tip[0] - size * (ux * cos - uy * sin);
      const ry = tip[1] - size * (uy * cos + ux * sin);
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(lx, ly);
      if (kind === "arrow") {
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      } else {
        ctx.lineTo(rx, ry);
        ctx.closePath();
        if (kind === "triangle") ctx.fill();
        else ctx.stroke();
      }
      break;
    }
    case "dot":
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], size / 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], size / 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "bar": {
      const px = -uy;
      const py = ux;
      ctx.beginPath();
      ctx.moveTo(tip[0] + px * size * 0.4, tip[1] + py * size * 0.4);
      ctx.lineTo(tip[0] - px * size * 0.4, tip[1] - py * size * 0.4);
      ctx.stroke();
      break;
    }
    case "diamond": {
      const px = -uy;
      const py = ux;
      const m = size * 0.5;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - ux * m + px * m * 0.6, tip[1] - uy * m + py * m * 0.6);
      ctx.lineTo(tip[0] - ux * m * 2, tip[1] - uy * m * 2);
      ctx.lineTo(tip[0] - ux * m - px * m * 0.6, tip[1] - uy * m - py * m * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

function fillShapePath(ctx: CanvasRenderingContext2D, el: EngineElement) {
  ctx.beginPath();
  switch (el.type) {
    case "rect": {
      const r = (el as import("@/lib/engine/types").RectElement).cornerRadius;
      if (r > 0) {
        const rr = Math.min(r, Math.min(el.width, el.height) / 2);
        ctx.roundRect(0, 0, el.width, el.height, rr);
      } else {
        ctx.rect(0, 0, el.width, el.height);
      }
      break;
    }
    case "ellipse": {
      ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      break;
    }
    case "diamond": {
      ctx.moveTo(el.width / 2, 0);
      ctx.lineTo(el.width, el.height / 2);
      ctx.lineTo(el.width / 2, el.height);
      ctx.lineTo(0, el.height / 2);
      ctx.closePath();
      break;
    }
    case "triangle": {
      ctx.moveTo(el.width / 2, 0);
      ctx.lineTo(el.width, el.height);
      ctx.lineTo(0, el.height);
      ctx.closePath();
      break;
    }
    case "star": {
      const n = (el as import("@/lib/engine/types").StarElement).numPoints;
      const cx = el.width / 2;
      const cy = el.height / 2;
      const outerR = Math.min(el.width, el.height) / 2;
      const innerR = outerR * 0.4;
      for (let i = 0; i < n * 2; i++) {
        const angle = (Math.PI * i) / n - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case "hexagon": {
      const cx = el.width / 2;
      const cy = el.height / 2;
      const r = Math.min(el.width, el.height) / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case "heart": {
      const w = el.width;
      const h = el.height;
      ctx.moveTo(w / 2, h * 0.25);
      ctx.bezierCurveTo(w / 2, h * 0.05, w * 0.75, 0, w * 0.75, h * 0.2);
      ctx.bezierCurveTo(w * 0.75, h * 0.45, w / 2, h * 0.6, w / 2, h * 0.75);
      ctx.bezierCurveTo(w / 2, h * 0.6, w * 0.25, h * 0.45, w * 0.25, h * 0.2);
      ctx.bezierCurveTo(w * 0.25, 0, w / 2, h * 0.05, w / 2, h * 0.25);
      ctx.closePath();
      break;
    }
    case "plus": {
      const t =
        (el as import("@/lib/engine/types").PlusElement).crossThickness *
        Math.min(el.width, el.height);
      const hw = t / 2;
      const cx = el.width / 2;
      const cy = el.height / 2;
      ctx.moveTo(cx - hw, 0);
      ctx.lineTo(cx + hw, 0);
      ctx.lineTo(cx + hw, cy - hw);
      ctx.lineTo(el.width, cy - hw);
      ctx.lineTo(el.width, cy + hw);
      ctx.lineTo(cx + hw, cy + hw);
      ctx.lineTo(cx + hw, el.height);
      ctx.lineTo(cx - hw, el.height);
      ctx.lineTo(cx - hw, cy + hw);
      ctx.lineTo(0, cy + hw);
      ctx.lineTo(0, cy - hw);
      ctx.lineTo(cx - hw, cy - hw);
      ctx.closePath();
      break;
    }
    default:
      ctx.rect(0, 0, el.width, el.height);
  }
  ctx.fill();
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  pattern: "dots" | "stripes" | "grid",
) {
  const color = el.strokeColor;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  const spacing = 12;
  switch (pattern) {
    case "dots": {
      for (let x = 0; x < el.width; x += spacing) {
        for (let y = 0; y < el.height; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "stripes": {
      ctx.lineWidth = 1;
      for (let x = 0; x < el.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, el.height);
        ctx.stroke();
      }
      break;
    }
    case "grid": {
      ctx.lineWidth = 0.8;
      for (let x = 0; x < el.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, el.height);
        ctx.stroke();
      }
      for (let y = 0; y < el.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(el.width, y);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    const value = obj[key];
    sorted[key] =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? stableStringify(value as Record<string, unknown>)
        : value;
  }
  return JSON.stringify(sorted);
}
