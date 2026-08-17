/**
 * Frame Mask Shape Engine.
 * Provides vector shape clipping paths for Canva-style photo frames and masked containers.
 */

import { createFrame } from "./factory";
import type {
  EngineElement,
  FrameElement,
  FrameMaskShape,
  RectElement,
  VectorPathElement,
  VectorPathNode,
} from "./types";

/**
 * Calculates the inner photo cutout rectangle for Polaroid frame style.
 */
export function getFramePolaroidCutout(
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const padX = width * 0.08;
  const padTop = height * 0.08;
  const photoW = width - padX * 2;
  const photoH = height * 0.72;
  return {
    x: padX,
    y: padTop,
    width: Math.max(10, photoW),
    height: Math.max(10, photoH),
  };
}

/**
 * Checks if an element can be converted into a photo Frame.
 */
export function isConvertibleShape(el: EngineElement): boolean {
  return (
    el.type === "rect" ||
    el.type === "ellipse" ||
    el.type === "diamond" ||
    el.type === "triangle" ||
    el.type === "star" ||
    el.type === "hexagon" ||
    el.type === "heart" ||
    el.type === "plus" ||
    el.type === "path"
  );
}

/**
 * Converts any standard Shape or Vector Path element into a FrameElement.
 * Preserves element position, dimensions, rotation, strokes, and geometric clipping mask.
 */
export function convertShapeToFrame(el: EngineElement, imageFileId?: string): FrameElement {
  let shape: FrameMaskShape = "rect";
  let cornerRadius = 0;
  let customPathNodes: VectorPathNode[] | undefined;

  switch (el.type) {
    case "rect": {
      const cr = (el as RectElement).cornerRadius ?? 0;
      if (cr > 0) {
        shape = "roundedRect";
        cornerRadius = cr;
      } else {
        shape = "rect";
      }
      break;
    }
    case "ellipse": {
      shape = "circle";
      break;
    }
    case "diamond": {
      shape = "diamond";
      break;
    }
    case "triangle": {
      shape = "triangle";
      break;
    }
    case "star": {
      shape = "star";
      break;
    }
    case "hexagon": {
      shape = "hexagon";
      break;
    }
    case "heart": {
      shape = "heart";
      break;
    }
    case "plus": {
      shape = "plus";
      break;
    }
    case "path": {
      shape = "customPath";
      customPathNodes = (el as VectorPathElement).nodes;
      break;
    }
    default: {
      shape = "rect";
      break;
    }
  }

  const frame: FrameElement = {
    ...createFrame({
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      name: `${el.type} Frame`,
      shape,
      cornerRadius,
      imageFileId,
    }),
    id: el.id,
    angle: el.angle ?? 0,
    opacity: el.opacity ?? 1,
    strokeColor: el.strokeColor ?? "#94a3b8",
    strokeWidth: el.strokeWidth ?? 1,
    strokeStyle: el.strokeStyle ?? "solid",
    backgroundColor: el.backgroundColor ?? "transparent",
    fillStyle: el.fillStyle ?? "solid",
    customPathNodes,
  };

  return frame;
}

/**
 * Traces the 2D clipping path on a Canvas 2D context for a given frame shape.
 */
export function traceFrameShapePath(
  ctx: CanvasRenderingContext2D,
  shape: FrameMaskShape | undefined,
  width: number,
  height: number,
  cornerRadius?: number,
  customPathNodes?: VectorPathNode[],
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const actualShape = shape ?? "rect";

  ctx.beginPath();

  switch (actualShape) {
    case "circle": {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    }

    case "roundedRect": {
      const radius = Math.min(cornerRadius ?? 24, w / 2, h / 2);
      traceRoundedRect(ctx, 0, 0, w, h, radius);
      break;
    }

    case "diamond": {
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      break;
    }

    case "triangle": {
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;
    }

    case "plus": {
      const sx = w / 3;
      const sy = h / 3;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx * 2, 0);
      ctx.lineTo(sx * 2, sy);
      ctx.lineTo(w, sy);
      ctx.lineTo(w, sy * 2);
      ctx.lineTo(sx * 2, sy * 2);
      ctx.lineTo(sx * 2, h);
      ctx.lineTo(sx, h);
      ctx.lineTo(sx, sy * 2);
      ctx.lineTo(0, sy * 2);
      ctx.lineTo(0, sy);
      ctx.lineTo(sx, sy);
      ctx.closePath();
      break;
    }

    case "polaroid": {
      const cutout = getFramePolaroidCutout(w, h);
      traceRoundedRect(ctx, cutout.x, cutout.y, cutout.width, cutout.height, 4);
      break;
    }

    case "arch": {
      const radius = w / 2;
      ctx.moveTo(0, h);
      ctx.lineTo(w, h);
      ctx.lineTo(w, radius);
      ctx.arc(radius, radius, radius, 0, Math.PI, true);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;
    }

    case "heart": {
      const cx = w / 2;
      const topY = h * 0.28;
      ctx.moveTo(cx, h * 0.88);
      ctx.bezierCurveTo(cx - w * 0.5, h * 0.65, cx - w * 0.5, topY - h * 0.25, cx, topY);
      ctx.bezierCurveTo(cx + w * 0.5, topY - h * 0.25, cx + w * 0.5, h * 0.65, cx, h * 0.88);
      ctx.closePath();
      break;
    }

    case "star": {
      const points = 5;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.42;
      const cx = w / 2;
      const cy = h / 2;
      let angle = -Math.PI / 2;
      const step = Math.PI / points;

      ctx.moveTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      for (let i = 0; i < points; i++) {
        angle += step;
        ctx.lineTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        angle += step;
        ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      }
      ctx.closePath();
      break;
    }

    case "hexagon": {
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + rx * Math.cos(angle);
        const py = cy + ry * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }

    case "blob": {
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2;
      const ry = h / 2;
      ctx.moveTo(cx, cy - ry);
      ctx.bezierCurveTo(
        cx + rx * 0.95,
        cy - ry * 0.7,
        cx + rx,
        cy + ry * 0.4,
        cx + rx * 0.2,
        cy + ry * 0.95,
      );
      ctx.bezierCurveTo(
        cx - rx * 0.6,
        cy + ry,
        cx - rx,
        cy + ry * 0.5,
        cx - rx * 0.95,
        cy - ry * 0.2,
      );
      ctx.bezierCurveTo(cx - rx * 0.9, cy - ry * 0.9, cx - rx * 0.3, cy - ry, cx, cy - ry);
      ctx.closePath();
      break;
    }

    case "customPath": {
      if (customPathNodes && customPathNodes.length > 0) {
        traceVectorNodes(ctx, customPathNodes, w, h);
      } else {
        ctx.rect(0, 0, w, h);
      }
      break;
    }

    default: {
      ctx.rect(0, 0, w, h);
      break;
    }
  }
}

/**
 * Returns SVG path `d` string for a frame shape (suitable for `<path d="..." />` and `<clipPath>`).
 */
export function getFrameShapeSVGPath(
  shape: FrameMaskShape | undefined,
  width: number,
  height: number,
  cornerRadius?: number,
  customPathNodes?: VectorPathNode[],
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const actualShape = shape ?? "rect";

  switch (actualShape) {
    case "circle": {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
    }

    case "roundedRect": {
      const r = Math.min(cornerRadius ?? 24, w / 2, h / 2);
      return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    }

    case "diamond": {
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    }

    case "triangle": {
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    }

    case "plus": {
      const sx = w / 3;
      const sy = h / 3;
      return `M ${sx} 0 L ${sx * 2} 0 L ${sx * 2} ${sy} L ${w} ${sy} L ${w} ${sy * 2} L ${sx * 2} ${sy * 2} L ${sx * 2} ${h} L ${sx} ${h} L ${sx} ${sy * 2} L 0 ${sy * 2} L 0 ${sy} L ${sx} ${sy} Z`;
    }

    case "polaroid": {
      const cutout = getFramePolaroidCutout(w, h);
      const r = 4;
      const { x, y, width: cw, height: ch } = cutout;
      return `M ${x + r} ${y} L ${x + cw - r} ${y} Q ${x + cw} ${y} ${x + cw} ${y + r} L ${x + cw} ${y + ch - r} Q ${x + cw} ${y + ch} ${x + cw - r} ${y + ch} L ${x + r} ${y + ch} Q ${x} ${y + ch} ${x} ${y + ch - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }

    case "arch": {
      const radius = w / 2;
      return `M 0 ${h} L ${w} ${h} L ${w} ${radius} A ${radius} ${radius} 0 0 0 0 ${radius} Z`;
    }

    case "heart": {
      const cx = w / 2;
      const topY = h * 0.28;
      return `M ${cx} ${h * 0.88} C ${cx - w * 0.5} ${h * 0.65} ${cx - w * 0.5} ${topY - h * 0.25} ${cx} ${topY} C ${cx + w * 0.5} ${topY - h * 0.25} ${cx + w * 0.5} ${h * 0.65} ${cx} ${h * 0.88} Z`;
    }

    case "star": {
      const points = 5;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.42;
      const cx = w / 2;
      const cy = h / 2;
      let angle = -Math.PI / 2;
      const step = Math.PI / points;
      const coords: [number, number][] = [];

      for (let i = 0; i < points; i++) {
        coords.push([cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR]);
        angle += step;
        coords.push([cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR]);
        angle += step;
      }
      return `M ${coords.map((pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(" L ")} Z`;
    }

    case "hexagon": {
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const coords: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        coords.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
      }
      return `M ${coords.map((pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(" L ")} Z`;
    }

    case "blob": {
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2;
      const ry = h / 2;
      return `M ${cx} ${cy - ry} C ${cx + rx * 0.95} ${cy - ry * 0.7} ${cx + rx} ${cy + ry * 0.4} ${cx + rx * 0.2} ${cy + ry * 0.95} C ${cx - rx * 0.6} ${cy + ry} ${cx - rx} ${cy + ry * 0.5} ${cx - rx * 0.95} ${cy - ry * 0.2} C ${cx - rx * 0.9} ${cy - ry * 0.9} ${cx - rx * 0.3} ${cy - ry} ${cx} ${cy - ry} Z`;
    }

    case "customPath": {
      if (customPathNodes && customPathNodes.length > 0) {
        return vectorNodesToSVGPath(customPathNodes, w, h);
      }
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
    }

    default: {
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
    }
  }
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function traceVectorNodes(
  ctx: CanvasRenderingContext2D,
  nodes: VectorPathNode[],
  w: number,
  h: number,
): void {
  if (!nodes || nodes.length === 0) return;
  ctx.moveTo(nodes[0].x * w, nodes[0].y * h);
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev.out && curr.in) {
      ctx.bezierCurveTo(
        (prev.x + prev.out[0]) * w,
        (prev.y + prev.out[1]) * h,
        (curr.x + curr.in[0]) * w,
        (curr.y + curr.in[1]) * h,
        curr.x * w,
        curr.y * h,
      );
    } else if (prev.out) {
      ctx.quadraticCurveTo(
        (prev.x + prev.out[0]) * w,
        (prev.y + prev.out[1]) * h,
        curr.x * w,
        curr.y * h,
      );
    } else if (curr.in) {
      ctx.quadraticCurveTo(
        (curr.x + curr.in[0]) * w,
        (curr.y + curr.in[1]) * h,
        curr.x * w,
        curr.y * h,
      );
    } else {
      ctx.lineTo(curr.x * w, curr.y * h);
    }
  }
  ctx.closePath();
}

function vectorNodesToSVGPath(nodes: VectorPathNode[], w: number, h: number): string {
  if (!nodes || nodes.length === 0) return "";
  let d = `M ${(nodes[0].x * w).toFixed(2)} ${(nodes[0].y * h).toFixed(2)}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev.out && curr.in) {
      d += ` C ${((prev.x + prev.out[0]) * w).toFixed(2)} ${((prev.y + prev.out[1]) * h).toFixed(2)} ${((curr.x + curr.in[0]) * w).toFixed(2)} ${((curr.y + curr.in[1]) * h).toFixed(2)} ${(curr.x * w).toFixed(2)} ${(curr.y * h).toFixed(2)}`;
    } else if (prev.out) {
      d += ` Q ${((prev.x + prev.out[0]) * w).toFixed(2)} ${((prev.y + prev.out[1]) * h).toFixed(2)} ${(curr.x * w).toFixed(2)} ${(curr.y * h).toFixed(2)}`;
    } else if (curr.in) {
      d += ` Q ${((curr.x + curr.in[0]) * w).toFixed(2)} ${((curr.y + curr.in[1]) * h).toFixed(2)} ${(curr.x * w).toFixed(2)} ${(curr.y * h).toFixed(2)}`;
    } else {
      d += ` L ${(curr.x * w).toFixed(2)} ${(curr.y * h).toFixed(2)}`;
    }
  }
  return `${d} Z`;
}
