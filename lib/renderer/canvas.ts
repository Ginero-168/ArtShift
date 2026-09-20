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
import { appearanceRenderPad } from "../appearance/bounds";
import { readAppearance } from "../appearance/legacyAdapter";
import {
  appearanceMaxStrokeWidth,
  type CanvasPaintPass,
  canvasGaussianBlurRadius,
  canvasPaintPasses,
  canvasShadowPasses,
  usesStackedPaint,
} from "../appearance/renderPlan";
import type {
  AppearancePaint,
  BackgroundAppearance,
  FillAppearance,
  StrokeAppearance,
} from "../appearance/types";
import type { ColorAdjustments } from "../color/adjustments";
import { resolveMultiGradientStops } from "../color/swatches";
import { getFramePolaroidCutout, traceFrameShapePath } from "../engine/frameMask";
import { freedrawPath, strokeOutlineFor } from "../engine/freehand";
import { getRenderableElements } from "../engine/layers";
import { buildRoughShape } from "../engine/rough";
import {
  createCanvasTextMeasure,
  layoutText,
  letterSpacingPx,
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
import { getVectorPathSubpathRanges } from "../engine/vectorPath";
import { getRasterRetouchSource } from "../raster/retouchSource";
import { createRasterSelectionMaskDataUrl } from "../raster/selection";
import { getRasterSelectionMaskSource } from "../raster/selectionMask";
import { drawRasterStroke } from "../raster/strokeDraw";
import type { RasterMaskStroke, RasterRetouchEdit } from "../raster/types";
import { getRasterAdjustedImage, getRasterAdjustedImageSync } from "./adjustmentCache";
import { drawBookMockup } from "./bookMockup";
import { getCachedElement, setCachedElement } from "./cache";

export type RenderCtx = {
  ctx: CanvasRenderingContext2D;
  /** Optional image cache keyed by `ImageElement.fileId`. */
  images?: Map<string, HTMLImageElement>;
  /** Defer pixel filters to the Worker; exports leave this false for determinism. */
  deferRasterJobs?: boolean;
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
    const letterPad = el.type === "text" ? Math.ceil(letterSpacingPx(el as TextElement) * 4) : 0;
    const pad = Math.max(
      32,
      appearanceMaxStrokeWidth(el) * 4 + 48,
      canvasGaussianBlurRadius(el) * 2 + 24,
      appearanceRenderPad(readAppearance(el)) + 16,
      letterPad,
    );
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
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.translate(-el.width / 2 - cached.pad, -el.height / 2 - cached.pad);
  const effectPasses = canvasShadowPasses(el);
  const blur = canvasGaussianBlurRadius(el);
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  if (effectPasses.length === 0) {
    ctx.drawImage(cached.canvas, 0, 0);
  } else {
    // Canvas shadow* draws source + halo. Paint each halo, then the still once
    // on top so multi-layer text-shadow/glow is not XOR'd and glyphs are not
    // restacked as N opaque copies. Tapered extrude copies scale toward the
    // element center — those cannot use shadowOffset, so they tint + transform.
    let tint: HTMLCanvasElement | null = null;
    let tintColor: string | null = null;
    for (const pass of effectPasses) {
      const scale = pass.scale ?? 1;
      if (scale === 1) {
        ctx.shadowColor = pass.color;
        ctx.shadowBlur = pass.blur;
        ctx.shadowOffsetX = pass.offsetX;
        ctx.shadowOffsetY = pass.offsetY;
        ctx.drawImage(cached.canvas, 0, 0);
        continue;
      }
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      if (!tint || tintColor !== pass.color) {
        tint ??= document.createElement("canvas");
        tint.width = cached.canvas.width;
        tint.height = cached.canvas.height;
        const tctx = tint.getContext("2d");
        if (tctx) {
          tctx.clearRect(0, 0, tint.width, tint.height);
          tctx.drawImage(cached.canvas, 0, 0);
          tctx.globalCompositeOperation = "source-in";
          tctx.fillStyle = pass.color;
          tctx.fillRect(0, 0, tint.width, tint.height);
          tctx.globalCompositeOperation = "source-over";
        }
        tintColor = pass.color;
      }
      ctx.save();
      const cx = cached.pad + el.width / 2;
      const cy = cached.pad + el.height / 2;
      ctx.translate(cx + pass.offsetX, cy + pass.offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      if (pass.blur > 0) ctx.filter = `blur(${pass.blur}px)`;
      ctx.drawImage(tint, 0, 0);
      ctx.restore();
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(cached.canvas, 0, 0);
  }
  if (blur > 0) ctx.filter = "none";
  ctx.restore();
}

function renderElementContent(el: EngineElement, ctx: CanvasRenderingContext2D, render: RenderCtx) {
  // Shadow / glow are applied when compositing the cached bitmap so both can
  // paint in stack order. Canvas2D still has one shadow state per draw.
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
      const paintPasses = canvasPaintPasses(el);
      if (usesStackedPaint(paintPasses)) {
        paintStackedGeometry(ctx, el, paintPasses);
        if (el.type === "arrow") {
          const frontStroke = frontStrokePass(paintPasses);
          drawArrowHeads(
            ctx,
            frontStroke
              ? ({
                  ...el,
                  strokeColor: frontStroke.color,
                  strokeWidth: frontStroke.width,
                } as ArrowElement)
              : el,
          );
        }
        break;
      }
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
}

// ——— per-type draw helpers ———

function frontStrokePass(passes: CanvasPaintPass[]): StrokeAppearance | undefined {
  for (let index = passes.length - 1; index >= 0; index--) {
    const pass = passes[index];
    if (pass.kind === "stroke") return pass.item;
  }
  return undefined;
}

function paintStackedGeometry(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  passes: CanvasPaintPass[],
) {
  for (const pass of passes) {
    ctx.save();
    applyPaintLayer(ctx, pass.item);
    if (pass.kind === "fill") {
      paintFillPass(ctx, el, pass.item);
    } else if (pass.kind === "stroke") {
      applyStrokeAppearance(ctx, pass.item);
      strokeElementGeometry(ctx, el);
    }
    ctx.restore();
  }
}

function paintFillPass(ctx: CanvasRenderingContext2D, el: EngineElement, item: FillAppearance) {
  const paint = item.paint;
  if (paint.type === "pattern") {
    const backdrop = paint.background === "transparent" ? paint.foreground : paint.background;
    ctx.fillStyle = backdrop;
    fillElementGeometry(ctx, el);
    ctx.save();
    clipElementGeometry(ctx, el);
    drawPattern(ctx, el, paint.pattern, paint.foreground);
    ctx.restore();
    return;
  }
  if (!applyFillAppearance(ctx, el, paint)) return;
  fillElementGeometry(ctx, el);
}

function applyFillAppearance(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  paint: AppearancePaint,
): boolean {
  if (paint.type === "solid") {
    if (paint.color === "transparent" || paint.color === "none") return false;
    ctx.fillStyle = paint.color;
    return true;
  }
  if (paint.type === "linearGradient" || paint.type === "radialGradient") {
    ctx.fillStyle = createAppearanceGradient(ctx, el, paint);
    return true;
  }
  if (paint.type === "conicGradient") {
    ctx.fillStyle = createConicAppearanceGradient(ctx, el, paint);
    return true;
  }
  ctx.fillStyle = paint.foreground;
  return true;
}

function applyPaintLayer(
  ctx: CanvasRenderingContext2D,
  item: { opacity: number; blendMode?: string; offsetX?: number; offsetY?: number },
) {
  ctx.globalAlpha *= item.opacity;
  if (item.blendMode && item.blendMode !== "source-over") {
    ctx.globalCompositeOperation = item.blendMode as GlobalCompositeOperation;
  }
  const offsetX = item.offsetX ?? 0;
  const offsetY = item.offsetY ?? 0;
  if (offsetX || offsetY) ctx.translate(offsetX, offsetY);
}

function applyStrokeAppearance(ctx: CanvasRenderingContext2D, item: StrokeAppearance) {
  ctx.strokeStyle = item.color;
  ctx.lineWidth = Math.max(0, item.width);
  ctx.lineCap = item.cap ?? "round";
  ctx.lineJoin = item.join ?? "round";
  ctx.setLineDash(
    item.dash
      ? item.dash
      : item.style === "dashed"
        ? [item.width * 4, item.width * 4]
        : item.style === "dotted"
          ? [item.width, item.width * 2]
          : [],
  );
}

function isPolylineElement(
  el: EngineElement,
): el is import("../engine/types").LineElement | ArrowElement {
  return el.type === "line" || el.type === "arrow";
}

function fillElementGeometry(ctx: CanvasRenderingContext2D, el: EngineElement) {
  if (isPolylineElement(el)) return;
  traceShapePath(ctx, el);
  ctx.fill();
}

function strokeElementGeometry(ctx: CanvasRenderingContext2D, el: EngineElement) {
  if (isPolylineElement(el)) {
    tracePolylinePath(ctx, el);
    ctx.stroke();
    return;
  }
  traceShapePath(ctx, el);
  ctx.stroke();
}

function clipElementGeometry(ctx: CanvasRenderingContext2D, el: EngineElement) {
  if (isPolylineElement(el)) return;
  traceShapePath(ctx, el);
  ctx.clip();
}

function tracePolylinePath(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").LineElement | ArrowElement,
) {
  if (el.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0][0], el.points[0][1]);
  for (let index = 1; index < el.points.length; index++) {
    ctx.lineTo(el.points[index][0], el.points[index][1]);
  }
}

function drawFreedraw(ctx: CanvasRenderingContext2D, el: EngineElement) {
  if (el.type !== "freedraw") return;
  const passes = canvasPaintPasses(el);
  if (!usesStackedPaint(passes)) {
    const path = freedrawPath(el);
    ctx.fillStyle = el.strokeColor;
    ctx.fill(path);
    return;
  }
  for (const pass of passes) {
    ctx.save();
    applyPaintLayer(ctx, pass.item);
    if (pass.kind === "stroke") {
      ctx.fillStyle = pass.item.color;
      ctx.fill(freedrawPathForWidth(el, pass.item.width));
    } else if (applyFillAppearance(ctx, el, pass.item.paint)) {
      ctx.fill(freedrawPath(el));
    }
    ctx.restore();
  }
}

function freedrawPathForWidth(
  el: import("../engine/types").FreedrawElement,
  width: number,
): Path2D {
  const outline = strokeOutlineFor(el, { size: Math.max(0.5, width) * 2 });
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) {
    path.lineTo(outline[index][0], outline[index][1]);
  }
  path.closePath();
  return path;
}

function drawVectorPath(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").VectorPathElement,
) {
  if (el.nodes.length < 2) return;
  const path = new Path2D();
  for (const { start, end } of getVectorPathSubpathRanges(el)) {
    if (end - start < 2) continue;
    const first = pathNodePoint(el, el.nodes[start]);
    path.moveTo(first.x, first.y);
    for (let index = start + 1; index < end; index++) {
      appendPathSegment(path, el, el.nodes[index - 1], el.nodes[index]);
    }
    if (el.closed) {
      appendPathSegment(path, el, el.nodes[end - 1], el.nodes[start]);
      path.closePath();
    }
  }
  const paintPasses = canvasPaintPasses(el);
  if (usesStackedPaint(paintPasses)) {
    for (const pass of paintPasses) {
      ctx.save();
      applyPaintLayer(ctx, pass.item);
      if (pass.kind === "fill") {
        if (el.closed && applyFillAppearance(ctx, el, pass.item.paint)) {
          ctx.fill(path, el.fillRule);
        }
      } else if (pass.kind === "stroke") {
        applyStrokeAppearance(ctx, pass.item);
        ctx.stroke(path);
      }
      ctx.restore();
    }
    const frontStroke = frontStrokePass(paintPasses);
    if (frontStroke) drawVectorPathArrowheads(ctx, el, frontStroke.color, frontStroke.width);
    return;
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
    drawVectorPathArrowheads(ctx, el, el.strokeColor, el.strokeWidth);
  }
}

function drawVectorPathArrowheads(
  ctx: CanvasRenderingContext2D,
  el: import("../engine/types").VectorPathElement,
  color: string,
  width: number,
) {
  if (el.nodes.length < 2 || el.closed) return;
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
    drawArrowhead(ctx, [p0.x, p0.y], [p1.x, p1.y], el.startArrowhead, color, width, scale);
  }
  if (el.endArrowhead && el.endArrowhead !== "none" && lastNode && prevLastNode) {
    const pn = pathNodePoint(el, lastNode);
    const pnPrev = lastNode.in
      ? {
          x: (lastNode.x + lastNode.in[0]) * el.width,
          y: (lastNode.y + lastNode.in[1]) * el.height,
        }
      : pathNodePoint(el, prevLastNode);
    drawArrowhead(ctx, [pn.x, pn.y], [pnPrev.x, pnPrev.y], el.endArrowhead, color, width, scale);
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
  return createSizedGradient(
    ctx,
    el.width,
    el.height,
    el.fillType === "linear" ? "linear" : "radial",
    angleDeg,
    rawColors,
    el.gradientStops,
  );
}

function createAppearanceGradient(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  paint: Extract<AppearancePaint, { type: "linearGradient" | "radialGradient" }>,
): CanvasGradient {
  return createSizedGradient(
    ctx,
    el.width,
    el.height,
    paint.type === "linearGradient" ? "linear" : "radial",
    paint.type === "linearGradient" ? paint.angle : 90,
    paint.stops.map((stop) => stop.color),
    paint.stops.map((stop) => stop.offset),
  );
}

function createConicAppearanceGradient(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  paint: Extract<AppearancePaint, { type: "conicGradient" }>,
): CanvasGradient {
  const cx = el.width / 2;
  const cy = el.height / 2;
  if (typeof ctx.createConicGradient === "function") {
    const grad = ctx.createConicGradient((paint.angle * Math.PI) / 180, cx, cy);
    const stops = resolveMultiGradientStops(
      paint.stops.map((stop) => stop.color),
      paint.stops.map((stop) => stop.offset),
    );
    for (const stop of stops) {
      grad.addColorStop(stop.offset, stop.color);
    }
    return grad;
  }
  return createSizedGradient(
    ctx,
    el.width,
    el.height,
    "radial",
    paint.angle,
    paint.stops.map((stop) => stop.color),
    paint.stops.map((stop) => stop.offset),
  );
}

function createSizedGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  type: "linear" | "radial",
  angleDeg: number,
  rawColors: string[],
  rawOffsets?: number[],
): CanvasGradient {
  const stops = resolveMultiGradientStops(rawColors, rawOffsets);

  let grad: CanvasGradient;
  if (type === "linear") {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const len = (Math.abs(width * Math.cos(angleRad)) + Math.abs(height * Math.sin(angleRad))) / 2;
    const x0 = cx - Math.cos(angleRad) * len;
    const y0 = cy - Math.sin(angleRad) * len;
    const x1 = cx + Math.cos(angleRad) * len;
    const y1 = cy + Math.sin(angleRad) * len;
    grad = ctx.createLinearGradient(x0, y0, x1, y1);
  } else {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.max(width, height) / 2;
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
  const paintPasses = canvasPaintPasses(el);

  if (paintPasses.length > 0) {
    for (const pass of paintPasses) {
      ctx.save();
      applyPaintLayer(ctx, pass.item);
      if (pass.kind === "background") {
        paintTextBackground(ctx, el, pass.item);
      } else if (pass.kind === "fill") {
        paintTextFill(ctx, el, layout, pass.item);
      } else {
        applyStrokeAppearance(ctx, pass.item);
        if (el.pathCurvature && el.pathCurvature !== 0) {
          paintCurvedTextGlyphs(ctx, el, layout, "stroke");
        } else {
          paintTextGlyphs(ctx, el, layout, "stroke");
        }
      }
      ctx.restore();
    }
    return;
  }

  if (el.backgroundColor !== "transparent") {
    ctx.save();
    ctx.fillStyle = el.backgroundColor;
    roundedRectPath(ctx, 0, 0, el.width, el.height, el.cornerRadius ?? 0);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = el.strokeColor;
  if (el.pathCurvature && el.pathCurvature !== 0) {
    paintCurvedTextGlyphs(ctx, el, layout, "fill");
    return;
  }
  paintTextGlyphs(ctx, el, layout, "fill");
}

function paintTextFill(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  layout: import("../engine/textLayout").TextLayout,
  item: FillAppearance,
) {
  const paintGlyphs = (target: CanvasRenderingContext2D) => {
    if (el.pathCurvature && el.pathCurvature !== 0) {
      paintCurvedTextGlyphs(target, el, layout, "fill");
    } else {
      paintTextGlyphs(target, el, layout, "fill");
    }
  };
  if (item.paint.type === "pattern") {
    paintGlyphClippedPattern(ctx, el, item, paintGlyphs);
    return;
  }
  if (!applyFillAppearance(ctx, el, item.paint)) return;
  paintGlyphs(ctx);
}

function paintGlyphClippedPattern(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  item: FillAppearance,
  paintGlyphs: (target: CanvasRenderingContext2D) => void,
) {
  const paint = item.paint;
  if (paint.type !== "pattern") return;
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  const transform = ctx.getTransform();
  layerContext.setTransform(
    transform.a,
    transform.b,
    transform.c,
    transform.d,
    transform.e,
    transform.f,
  );
  layerContext.globalAlpha = ctx.globalAlpha;
  if (paint.background !== "transparent" && paint.background !== "none") {
    layerContext.fillStyle = paint.background;
    layerContext.fillRect(0, 0, el.width, el.height);
  }
  drawPattern(layerContext, el, paint.pattern, paint.foreground, 0.92);
  layerContext.globalAlpha = 1;
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.fillStyle = "#000000";
  paintGlyphs(layerContext);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function paintTextBackground(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  item: BackgroundAppearance,
) {
  if (!applyFillAppearance(ctx, el, item.paint)) return;
  roundedRectPath(ctx, 0, 0, el.width, el.height, el.cornerRadius ?? 0);
  ctx.fill();
}

function paintTextGlyphs(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  layout: import("../engine/textLayout").TextLayout,
  mode: "fill" | "stroke",
) {
  const measure = createCanvasTextMeasure(ctx, el);
  const { padding, lines, lineHeight: lh, contentHeight: totalH } = layout;
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

  const drawRun = (text: string, x: number, baseline: number) => {
    if (mode === "stroke") ctx.strokeText(text, x, baseline);
    else ctx.fillText(text, x, baseline);
  };

  for (const line of lines) {
    const segments = parseRichText(line.text);
    const lineWidth = measureRichText(line.text, measure);
    let x = padding + line.bulletIndent;
    if (el.textAlign === "center") x = (el.width - lineWidth + line.bulletIndent) / 2;
    if (el.textAlign === "right") x = el.width - padding - lineWidth;

    if (line.bullet) {
      setCanvasTextFont(ctx, el, false, false);
      ctx.textAlign = "left";
      drawRun("•", x - line.bulletIndent, y);
    }

    ctx.textAlign = "left";
    for (const seg of segments) {
      setCanvasTextFont(ctx, el, seg.bold, seg.italic);
      const segWidth = ctx.measureText(seg.text).width;
      drawRun(seg.text, x, y);
      x += segWidth;
    }

    y += lh;
  }
}

function paintCurvedTextGlyphs(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  layout: import("../engine/textLayout").TextLayout,
  mode: "fill" | "stroke",
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

  const k = curvature / 100;
  const maxSweep = Math.PI * 0.85;
  const sweepAngle = k * maxSweep;
  const radius = Math.max(20, Math.abs(totalTextWidth / sweepAngle));

  const cx = el.width / 2;
  const cy = k > 0 ? el.height / 2 + radius - 20 : el.height / 2 - radius + 20;

  let currentDist = 0;
  const startAngle = k > 0 ? -Math.PI / 2 - sweepAngle / 2 : Math.PI / 2 - sweepAngle / 2;

  ctx.save();
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
    if (mode === "stroke") ctx.strokeText(char, 0, 0);
    else ctx.fillText(char, 0, 0);
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
    const adjusted = render.deferRasterJobs
      ? getRasterAdjustedImage(el.fileId, img, el.adjustments as Partial<ColorAdjustments>)
      : getRasterAdjustedImageSync(el.fileId, img, el.adjustments as Partial<ColorAdjustments>);
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
  applyRasterMask(ctx, el.rasterMask, el);
  applyRasterRetouch(ctx, el.rasterEdits, el);
  ctx.restore();
}

function applyRasterRetouch(
  ctx: CanvasRenderingContext2D,
  edits: RasterRetouchEdit[] | undefined,
  element: ImageElement,
) {
  if (!edits?.length) return;
  for (const edit of edits) {
    const source = getRasterRetouchSource(edit.dataUrl);
    if (!source) continue;
    const selectionMaskDataUrl = edit.selection
      ? createRasterSelectionMaskDataUrl(edit.selection, element.width, element.height)
      : undefined;
    if (edit.selection && !selectionMaskDataUrl) continue;
    const selectionMask = selectionMaskDataUrl
      ? getRasterSelectionMaskSource(selectionMaskDataUrl)
      : undefined;
    if (edit.selection && !selectionMask) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, edit.opacity));
    if (selectionMask) {
      const layer = document.createElement("canvas");
      layer.width = ctx.canvas.width;
      layer.height = ctx.canvas.height;
      const layerContext = layer.getContext("2d");
      if (!layerContext) {
        ctx.restore();
        continue;
      }
      const transform = ctx.getTransform();
      layerContext.setTransform(
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
      );
      layerContext.globalAlpha = ctx.globalAlpha;
      layerContext.drawImage(source, edit.x, edit.y, edit.width, edit.height);
      layerContext.globalAlpha = 1;
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.drawImage(selectionMask, 0, 0, element.width, element.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(layer, 0, 0);
    } else {
      ctx.drawImage(source, edit.x, edit.y, edit.width, edit.height);
    }
    ctx.restore();
  }
}

function applyRasterMask(
  ctx: CanvasRenderingContext2D,
  strokes: RasterMaskStroke[] | undefined,
  element?: ImageElement,
) {
  if (!strokes?.length) return;
  ctx.save();
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    const selectionMaskDataUrl = stroke.selection
      ? createRasterSelectionMaskDataUrl(
          stroke.selection,
          element?.width ?? 0,
          element?.height ?? 0,
        )
      : stroke.selectionMaskDataUrl;
    if (stroke.selection) {
      // A Selection-constrained stroke must never fall back to an unrestricted
      // paint/erase operation while its bitmap mask is being decoded.
      if (!selectionMaskDataUrl || !element) continue;
      const selectionMask = getRasterSelectionMaskSource(selectionMaskDataUrl);
      if (selectionMask) drawClippedRasterStroke(ctx, element, stroke, selectionMask);
      continue;
    }
    if (stroke.selectionMaskDataUrl && element) {
      const selectionMask = getRasterSelectionMaskSource(stroke.selectionMaskDataUrl);
      if (selectionMask) drawClippedRasterStroke(ctx, element, stroke, selectionMask);
      continue;
    }
    ctx.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
    ctx.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity));
    drawRasterStroke(
      ctx,
      stroke,
      stroke.mode === "paint" ? (stroke.color ?? "#111827") : "#ffffff",
    );
  }
  ctx.restore();
}

function drawClippedRasterStroke(
  ctx: CanvasRenderingContext2D,
  element: ImageElement,
  stroke: RasterMaskStroke,
  selectionMask: CanvasImageSource,
) {
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;

  const transform = ctx.getTransform();
  layerContext.setTransform(
    transform.a,
    transform.b,
    transform.c,
    transform.d,
    transform.e,
    transform.f,
  );
  layerContext.globalAlpha = 1;
  drawRasterStroke(
    layerContext,
    stroke,
    stroke.mode === "paint" ? (stroke.color ?? "#111827") : "#ffffff",
  );

  // Keep only the part of the stroke inside the saved Selection.
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(selectionMask, 0, 0, element.width, element.height);

  // Composite in canvas pixels so the element-local translation is not applied twice.
  // Opacity is applied once here so overlapping stamps do not stack into rings.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity));
  ctx.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
  ctx.drawImage(layer, 0, 0);
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
  traceShapePath(ctx, el);
  ctx.fill();
}

function traceShapePath(ctx: CanvasRenderingContext2D, el: EngineElement) {
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
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  el: EngineElement,
  pattern: "dots" | "stripes" | "grid",
  color: string = el.strokeColor,
  alpha = 0.25,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
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
