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
import { resolveMultiGradientStops } from "../color/swatches";
import { getFramePolaroidCutout, traceFrameShapePath } from "../engine/frameMask";
import { freedrawPath } from "../engine/freehand";
import { getRenderableElements } from "../engine/layers";
import { buildRoughShape } from "../engine/rough";
import {
  createCanvasTextMeasure,
  layoutText,
  measureRichText,
  parseRichText,
  setCanvasTextFont,
} from "../engine/textLayout";
import type {
  ArrowElement,
  BookMockupElement,
  EngineElement,
  EngineSlide,
  ImageElement,
  TextElement,
} from "../engine/types";
import type { RasterMaskStroke } from "../raster/types";
import { drawBookMockup } from "./bookMockup";
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

export function renderSlide(
  slide: EngineSlide,
  render: RenderCtx,
  slideW: number,
  slideH: number,
  options: { afterBackground?: () => void; showFrames?: boolean } = {},
) {
  const { ctx } = render;
  // Background.
  ctx.save();
  ctx.fillStyle = slide.background;
  ctx.fillRect(0, 0, slideW, slideH);
  ctx.restore();
  options.afterBackground?.();

  const ordered = getRenderableElements(slide).filter(
    (element) => options.showFrames || element.type !== "frame",
  );

  const frames = ordered.filter(
    (el) => el.type === "frame",
  ) as import("../engine/types").FrameElement[];
  const frameByChild = new Map<string, import("../engine/types").FrameElement>();
  for (const frame of frames) {
    for (const childId of frame.childIds) {
      // Preserve the previous behavior when malformed data references an
      // Object from more than one frame: the first frame wins.
      if (!frameByChild.has(childId)) frameByChild.set(childId, frame);
    }
  }

  for (const el of ordered) {
    const clipFrame = frameByChild.get(el.id);

    if (clipFrame) {
      ctx.save();
      ctx.translate(clipFrame.x, clipFrame.y);
      traceFrameShapePath(
        ctx,
        clipFrame.shape,
        clipFrame.width,
        clipFrame.height,
        clipFrame.cornerRadius,
      );
      ctx.clip();
      ctx.translate(-clipFrame.x, -clipFrame.y);
      renderElement(el, render);
      ctx.restore();
    } else {
      renderElement(el, render);
    }
  }
}

export function renderElement(el: EngineElement, render: RenderCtx) {
  if (el.isDeleted || el.hidden || el.visible === false) return;
  const { ctx } = render;
  let cached = getCachedElement(el);

  if (!cached) {
    const pad = Math.max(32, (el.strokeWidth ?? 2) * 4 + 48);
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(1, Math.ceil(el.width + pad * 2));
    offscreen.height = Math.max(1, Math.ceil(el.height + pad * 2));
    const octx = offscreen.getContext("2d");
    if (octx) {
      octx.translate(pad, pad);
      renderElementContent(el, octx, render);
    }
    cached = { canvas: offscreen, pad };
    setCachedElement(el, cached);
  }

  ctx.save();
  ctx.globalAlpha *= el.opacity;
  ctx.globalCompositeOperation = el.blendMode ?? "source-over";
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(el.angle);
  ctx.translate(-el.width / 2 - cached.pad, -el.height / 2 - cached.pad);
  ctx.drawImage(cached.canvas, 0, 0);
  ctx.restore();
}

function renderElementContent(el: EngineElement, ctx: CanvasRenderingContext2D, render: RenderCtx) {
  // Apply shadow or glow if present.
  if (el.shadow) {
    ctx.shadowColor = el.shadow.color;
    ctx.shadowBlur = el.shadow.blur;
    ctx.shadowOffsetX = el.shadow.offsetX;
    ctx.shadowOffsetY = el.shadow.offsetY;
  } else if (el.glow) {
    ctx.shadowColor = el.glow.color;
    ctx.shadowBlur = el.glow.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
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
        const grad = createShapeGradient(ctx, el);
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
    case "path":
      drawVectorPath(ctx, el);
      break;
    case "text":
      drawText(ctx, el);
      break;
    case "image":
      drawImage(ctx, el as ImageElement, render);
      break;
    case "bookMockup":
      drawBookMockup(
        ctx,
        el as BookMockupElement,
        render.images?.get((el as BookMockupElement).fileId),
      );
      break;
    case "frame":
      drawFrame(ctx, el as import("../engine/types").FrameElement, render);
      break;
  }

  if (el.shadow || el.glow) {
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

function drawVectorPath(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").VectorPathElement,
) {
  if (el.nodes.length < 2) return;
  const path = new Path2D();
  const first = pathNodePoint(el, el.nodes[0]);
  path.moveTo(first.x, first.y);
  for (let index = 1; index < el.nodes.length; index++) {
    appendPathSegment(path, el, el.nodes[index - 1], el.nodes[index]);
  }
  if (el.closed) {
    appendPathSegment(path, el, el.nodes.at(-1)!, el.nodes[0]);
    path.closePath();
  }
  if (el.closed && el.backgroundColor !== "transparent") {
    ctx.fillStyle = vectorFillStyle(ctx, el);
    ctx.fill(path, el.fillRule);
  }
  if (el.strokeWidth > 0 && el.strokeColor !== "transparent") {
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.setLineDash(
      el.strokeStyle === "dashed" ? [12, 8] : el.strokeStyle === "dotted" ? [2, 7] : [],
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);

    if (el.nodes.length >= 2 && !el.closed) {
      const scale = el.arrowheadScale ?? 1;
      const firstNode = el.nodes[0];
      const secondNode = el.nodes[1];
      const lastNode = el.nodes[el.nodes.length - 1];
      const prevLastNode = el.nodes[el.nodes.length - 2];

      if (el.startArrowhead && el.startArrowhead !== "none" && firstNode && secondNode) {
        const p0 = pathNodePoint(el, firstNode);
        const p1 = firstNode.out
          ? {
              x: (firstNode.x + firstNode.out[0]) * el.width,
              y: (firstNode.y + firstNode.out[1]) * el.height,
            }
          : pathNodePoint(el, secondNode);
        drawArrowhead(
          ctx,
          [p0.x, p0.y],
          [p1.x, p1.y],
          el.startArrowhead,
          el.strokeColor,
          el.strokeWidth,
          scale,
        );
      }
      if (el.endArrowhead && el.endArrowhead !== "none" && lastNode && prevLastNode) {
        const pn = pathNodePoint(el, lastNode);
        const pnPrev = lastNode.in
          ? {
              x: (lastNode.x + lastNode.in[0]) * el.width,
              y: (lastNode.y + lastNode.in[1]) * el.height,
            }
          : pathNodePoint(el, prevLastNode);
        drawArrowhead(
          ctx,
          [pn.x, pn.y],
          [pnPrev.x, pnPrev.y],
          el.endArrowhead,
          el.strokeColor,
          el.strokeWidth,
          scale,
        );
      }
    }
  }
}

function appendPathSegment(
  path: Path2D,
  el: import("../engine/types").VectorPathElement,
  from: import("../engine/types").VectorPathNode,
  to: import("../engine/types").VectorPathNode,
) {
  const end = pathNodePoint(el, to);
  if (from.out || to.in) {
    const start = pathNodePoint(el, from);
    const out = from.out ?? [0, 0];
    const incoming = to.in ?? [0, 0];
    path.bezierCurveTo(
      start.x + out[0] * el.width,
      start.y + out[1] * el.height,
      end.x + incoming[0] * el.width,
      end.y + incoming[1] * el.height,
      end.x,
      end.y,
    );
  } else {
    path.lineTo(end.x, end.y);
  }
}

function pathNodePoint(
  el: import("../engine/types").VectorPathElement,
  node: import("../engine/types").VectorPathNode,
) {
  return { x: node.x * el.width, y: node.y * el.height };
}

export function createShapeGradient(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
): CanvasGradient {
  const rawColors = el.gradientColors ?? ["#6366f1", "#a855f7"];
  const angleDeg = el.gradientAngle ?? 90;
  const stops = resolveMultiGradientStops(rawColors, el.gradientStops);

  let grad: CanvasGradient;
  if (el.fillType === "linear") {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = el.width / 2;
    const cy = el.height / 2;
    const len =
      (Math.abs(el.width * Math.cos(angleRad)) + Math.abs(el.height * Math.sin(angleRad))) / 2;
    const x0 = cx - Math.cos(angleRad) * len;
    const y0 = cy - Math.sin(angleRad) * len;
    const x1 = cx + Math.cos(angleRad) * len;
    const y1 = cy + Math.sin(angleRad) * len;
    grad = ctx.createLinearGradient(x0, y0, x1, y1);
  } else {
    const cx = el.width / 2;
    const cy = el.height / 2;
    const r = Math.max(el.width, el.height) / 2;
    const minOffset = stops.length > 0 ? stops[0].offset : 0;
    const maxOffset = stops.length > 0 ? stops[stops.length - 1].offset : 1;
    grad = ctx.createRadialGradient(
      cx,
      cy,
      Math.max(0, r * minOffset),
      cx,
      cy,
      Math.max(1, r * Math.max(0.1, maxOffset)),
    );
  }

  for (const stop of stops) {
    grad.addColorStop(stop.offset, stop.color);
  }
  return grad;
}

function vectorFillStyle(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").VectorPathElement,
): string | CanvasGradient {
  if (el.fillType !== "linear" && el.fillType !== "radial") return el.backgroundColor;
  return createShapeGradient(ctx, el);
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  const measure = createCanvasTextMeasure(ctx, el);
  const layout = layoutText(el, measure);
  const { padding, lines, lineHeight: lh, contentHeight: totalH } = layout;
  if (el.backgroundColor !== "transparent") {
    ctx.save();
    ctx.fillStyle = el.backgroundColor;
    roundedRectPath(ctx, 0, 0, el.width, el.height, el.cornerRadius ?? 0);
    ctx.fill();
    ctx.restore();
  }

  // Handle Text on Path / Curved Text
  if (el.pathCurvature && el.pathCurvature !== 0) {
    drawCurvedText(ctx, el, layout);
    return;
  }

  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "top";
  ctx.textAlign =
    el.textAlign === "center" ? "center" : el.textAlign === "right" ? "right" : "left";
  let y = padding;
  const lastSafeStart = Math.max(padding, el.height - padding - totalH);
  if (el.verticalAlign === "middle") {
    y = Math.min(lastSafeStart, Math.max(padding, (el.height - totalH) / 2));
  } else if (el.verticalAlign === "bottom") {
    y = lastSafeStart;
  }

  for (const line of lines) {
    // Parse and render rich text segments.
    const segments = parseRichText(line.text);
    const lineWidth = measureRichText(line.text, measure);
    let x = padding + line.bulletIndent;
    if (el.textAlign === "center") x = (el.width - lineWidth + line.bulletIndent) / 2;
    if (el.textAlign === "right") x = el.width - padding - lineWidth;

    // Draw bullet character before switching to left-aligned segment drawing.
    if (line.bullet) {
      setCanvasTextFont(ctx, el, false, false);
      ctx.textAlign = "left";
      ctx.fillText("•", x - line.bulletIndent, y);
    }

    ctx.textAlign = "left";
    for (const seg of segments) {
      setCanvasTextFont(ctx, el, seg.bold, seg.italic);
      const segWidth = ctx.measureText(seg.text).width;
      ctx.fillText(seg.text, x, y);
      x += segWidth;
    }

    y += lh;
  }
}

function drawCurvedText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  layout: import("../engine/textLayout").TextLayout,
) {
  const curvature = el.pathCurvature ?? 0;
  if (curvature === 0) return;

  const rawText = layout.lines.map((l) => l.text).join(" ");
  if (!rawText.trim()) return;

  const chars: string[] = Array.from(rawText);
  const charWidths = chars.map((c) => {
    setCanvasTextFont(ctx, el, false, false);
    return ctx.measureText(c).width;
  });
  const totalTextWidth = charWidths.reduce((a, b) => a + b, 0);
  if (totalTextWidth <= 0) return;

  // Normalized curvature -1..1
  const k = curvature / 100;
  const maxSweep = Math.PI * 0.85; // Max 153 degrees arc
  const sweepAngle = k * maxSweep;
  const radius = Math.max(20, Math.abs(totalTextWidth / sweepAngle));

  const cx = el.width / 2;
  const cy = k > 0 ? el.height / 2 + radius - 20 : el.height / 2 - radius + 20;

  let currentDist = 0;
  const startAngle = k > 0 ? -Math.PI / 2 - sweepAngle / 2 : Math.PI / 2 - sweepAngle / 2;

  ctx.save();
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const charW = charWidths[i];
    const midDist = currentDist + charW / 2;
    const progress = totalTextWidth > 0 ? midDist / totalTextWidth : 0.5;
    const angle = startAngle + progress * sweepAngle;

    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    const tangent = k > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(tangent);
    setCanvasTextFont(ctx, el, false, false);
    ctx.fillText(char, 0, 0);
    ctx.restore();

    currentDist += charW;
  }

  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

type AdjustedImage = { canvas: HTMLCanvasElement; scaleX: number; scaleY: number };
const _adjCache = new Map<string, AdjustedImage>();
const MAX_ADJUSTMENT_CACHE_ENTRIES = 24;

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
  let sourceScaleX = 1;
  let sourceScaleY = 1;

  // Apply color adjustments if present
  if (el.adjustments && Object.keys(el.adjustments).length > 0) {
    const cacheKey = `${el.fileId}:${stableStringify(el.adjustments)}`;
    let adjusted = _adjCache.get(cacheKey);
    if (!adjusted) {
      const maxDimension = 4096;
      const ratio = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const adjCtx = canvas.getContext("2d")!;
      try {
        adjCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = adjCtx.getImageData(0, 0, canvas.width, canvas.height);
        applyColorAdjustments(imageData, el.adjustments as Partial<ColorAdjustments>);
        adjCtx.putImageData(imageData, 0, 0);
        adjusted = {
          canvas,
          scaleX: canvas.width / Math.max(1, img.naturalWidth),
          scaleY: canvas.height / Math.max(1, img.naturalHeight),
        };
        _adjCache.set(cacheKey, adjusted);
        while (_adjCache.size > MAX_ADJUSTMENT_CACHE_ENTRIES) {
          const oldest = _adjCache.keys().next().value;
          if (!oldest) break;
          _adjCache.delete(oldest);
        }
      } catch {
        // A remote server may deny pixel reads. Keep the original image usable
        // and leave adjustments pending instead of crashing the render loop.
        adjusted = undefined;
      }
    }
    if (adjusted) {
      drawSrc = adjusted.canvas;
      sourceScaleX = adjusted.scaleX;
      sourceScaleY = adjusted.scaleY;
    }
  }

  ctx.save();
  applyImageMask(ctx, el);
  if ((el.filterBlur ?? 0) > 0) ctx.filter = `blur(${el.filterBlur}px)`;
  if (el.crop) {
    ctx.drawImage(
      drawSrc,
      el.crop.x * sourceScaleX,
      el.crop.y * sourceScaleY,
      el.crop.width * sourceScaleX,
      el.crop.height * sourceScaleY,
      0,
      0,
      el.width,
      el.height,
    );
  } else {
    ctx.drawImage(drawSrc, 0, 0, el.width, el.height);
  }
  ctx.filter = "none";
  applyRasterMask(ctx, el.rasterMask, el.width, el.height);
  ctx.restore();
}

function applyRasterMask(
  ctx: CanvasRenderingContext2D,
  strokes: RasterMaskStroke[] | undefined,
  width: number,
  height: number,
) {
  if (!strokes?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    const points = stroke.points;
    if (!points.length) continue;
    ctx.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity));
    ctx.lineWidth = Math.max(1, Math.min(Math.max(width, height), stroke.size));
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    if (points.length === 1) {
      ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let index = 1; index < points.length; index++) {
      ctx.lineTo(points[index][0], points[index][1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function applyImageMask(ctx: CanvasRenderingContext2D, el: ImageElement) {
  const mask = el.mask;
  if (!mask || mask.shape === "rect") return;
  ctx.beginPath();
  if (mask.shape === "ellipse") {
    ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
  } else if (mask.shape === "hexagon") {
    const inset = el.width * 0.25;
    ctx.moveTo(inset, 0);
    ctx.lineTo(el.width - inset, 0);
    ctx.lineTo(el.width, el.height / 2);
    ctx.lineTo(el.width - inset, el.height);
    ctx.lineTo(inset, el.height);
    ctx.lineTo(0, el.height / 2);
    ctx.closePath();
  } else {
    roundedRectPath(ctx, 0, 0, el.width, el.height, mask.radius ?? 32);
  }
  ctx.clip();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").FrameElement,
  render: RenderCtx,
) {
  const w = el.width;
  const h = el.height;
  const shape = el.shape ?? "rect";
  const img = el.imageFileId ? render.images?.get(el.imageFileId) : undefined;

  if (shape === "polaroid") {
    // Draw white polaroid photo card base with subtle shadow
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.14)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    traceFrameShapePath(ctx, "roundedRect", w, h, 6);
    ctx.fill();
    ctx.restore();

    // Polaroid card outline
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    traceFrameShapePath(ctx, "roundedRect", w, h, 6);
    ctx.stroke();
  }

  const bounds =
    shape === "polaroid" ? getFramePolaroidCutout(w, h) : { x: 0, y: 0, width: w, height: h };

  const drawContent = (targetCtx: CanvasRenderingContext2D) => {
    if (img && img.width > 0 && img.height > 0) {
      const baseScale = Math.max(bounds.width / img.width, bounds.height / img.height);
      const zoom = el.cropZoom ?? 1;
      const finalW = img.width * baseScale * zoom;
      const finalH = img.height * baseScale * zoom;
      const panX = el.cropOffsetX ?? 0;
      const panY = el.cropOffsetY ?? 0;
      const cx = bounds.x + bounds.width / 2 + panX;
      const cy = bounds.y + bounds.height / 2 + panY;
      const rotation = el.cropRotation ?? 0;

      if (rotation !== 0) {
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.rotate((rotation * Math.PI) / 180);
        targetCtx.drawImage(img, -finalW / 2, -finalH / 2, finalW, finalH);
        targetCtx.restore();
      } else {
        targetCtx.drawImage(img, cx - finalW / 2, cy - finalH / 2, finalW, finalH);
      }
    } else {
      drawCanvaLandscapePlaceholder(targetCtx, bounds);
    }
  };

  if (el.feather && el.feather > 0 && typeof document !== "undefined") {
    const featherPx = Math.min(80, Math.max(1, el.feather));
    const margin = Math.min(featherPx * 1.5, w * 0.45, h * 0.45);
    const blurRadius = Math.max(1, margin * 0.42);
    const innerW = w - margin * 2;
    const innerH = h - margin * 2;

    const contentCanvas = document.createElement("canvas");
    contentCanvas.width = Math.ceil(w);
    contentCanvas.height = Math.ceil(h);
    const contentCtx = contentCanvas.getContext("2d");

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = Math.ceil(w);
    maskCanvas.height = Math.ceil(h);
    const maskCtx = maskCanvas.getContext("2d");

    if (contentCtx && maskCtx) {
      // 1. Draw photo covering [0, 0, w, h] so photo is fully present across the blur zone
      drawContent(contentCtx);

      // 2. Draw inset vector shape with Gaussian blur
      maskCtx.save();
      maskCtx.translate(margin, margin);
      maskCtx.filter = `blur(${blurRadius}px)`;
      maskCtx.fillStyle = "#ffffff";
      traceFrameShapePath(maskCtx, shape, innerW, innerH, el.cornerRadius, el.customPathNodes);
      maskCtx.fill();
      maskCtx.restore();

      // 3. Composite blurred mask over content buffer
      contentCtx.globalCompositeOperation = "destination-in";
      contentCtx.drawImage(maskCanvas, 0, 0);

      // 4. Render feathered photo directly onto main canvas within [0, 0, w, h]
      ctx.drawImage(contentCanvas, 0, 0);
    }
  } else {
    // Crisp vector mask clip
    ctx.save();
    traceFrameShapePath(ctx, shape, w, h, el.cornerRadius, el.customPathNodes);
    ctx.clip();
    drawContent(ctx);
    ctx.restore();
  }

  // Draw frame border/stroke if configured (only when not feathered)
  if (
    el.strokeWidth &&
    el.strokeWidth > 0 &&
    shape !== "polaroid" &&
    (!el.feather || el.feather === 0)
  ) {
    ctx.save();
    ctx.strokeStyle = el.strokeColor ?? "#94a3b8";
    ctx.lineWidth = el.strokeWidth;
    if (el.strokeStyle === "dashed") ctx.setLineDash([6, 6]);
    else if (el.strokeStyle === "dotted") ctx.setLineDash([2, 4]);
    traceFrameShapePath(ctx, shape, w, h, el.cornerRadius, el.customPathNodes);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCanvaLandscapePlaceholder(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const { x, y, width: w, height: h } = bounds;

  // 1. Sky Gradient Background
  const skyGrad = ctx.createLinearGradient(x, y, x, y + h);
  skyGrad.addColorStop(0, "#bae6fd"); // soft sky blue
  skyGrad.addColorStop(0.65, "#e0f2fe");
  skyGrad.addColorStop(1, "#f0f9ff");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, h);

  // 2. Bright Golden Sun
  const sunRadius = Math.max(4, Math.min(w, h) * 0.12);
  const sunX = x + w * 0.74;
  const sunY = y + h * 0.28;
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Fluffy Cloud
  const cloudX = x + w * 0.28;
  const cloudY = y + h * 0.35;
  const cloudR = Math.max(3, Math.min(w, h) * 0.08);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(cloudX, cloudY, cloudR, 0, Math.PI * 2);
  ctx.arc(cloudX + cloudR * 0.9, cloudY - cloudR * 0.3, cloudR * 0.8, 0, Math.PI * 2);
  ctx.arc(cloudX + cloudR * 1.7, cloudY, cloudR * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 4. Distant Rolling Green Hill (Background Hill)
  ctx.fillStyle = "#86efac"; // light grass green
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.65);
  ctx.bezierCurveTo(x + w * 0.25, y + h * 0.48, x + w * 0.5, y + h * 0.72, x + w, y + h * 0.58);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();

  // 5. Front Rolling Green Hill
  ctx.fillStyle = "#4ade80"; // vibrant grass green
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h * 0.72);
  ctx.bezierCurveTo(x + w * 0.7, y + h * 0.52, x + w * 0.35, y + h * 0.78, x, y + h * 0.68);
  ctx.closePath();
  ctx.fill();

  // 6. Subtle Mountain/Photo Glyph Badge in Center
  const badgeSize = Math.max(16, Math.min(w, h) * 0.22);
  const badgeX = x + (w - badgeSize) / 2;
  const badgeY = y + (h - badgeSize) / 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 6)
    : ctx.rect(badgeX, badgeY, badgeSize, badgeSize);
  ctx.fill();

  // Mountain icon inside badge
  ctx.fillStyle = "#64748b";
  ctx.beginPath();
  const mx = badgeX + badgeSize * 0.2;
  const my = badgeY + badgeSize * 0.75;
  ctx.moveTo(mx, my);
  ctx.lineTo(mx + badgeSize * 0.3, my - badgeSize * 0.4);
  ctx.lineTo(mx + badgeSize * 0.6, my);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(mx + badgeSize * 0.25, my);
  ctx.lineTo(mx + badgeSize * 0.45, my - badgeSize * 0.25);
  ctx.lineTo(mx + badgeSize * 0.65, my);
  ctx.fill();
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
