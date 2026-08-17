import {
  type BookMockupSurface,
  getBookMockupGeometry,
  type MockupPoint,
  type MockupQuad,
} from "../engine/bookMockup";
import type { BookMockupElement } from "../engine/types";

export function drawBookMockup(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  image?: HTMLImageElement,
) {
  const geometry = getBookMockupGeometry(el);
  if (el.showShadow !== false) {
    drawGroundShadow(ctx, el, geometry.shadow);
  }

  const visible = geometry.surfaces
    .filter((surface) => surface.visible)
    .sort((a, b) => a.depth - b.depth);
  for (const surface of visible) {
    if (surface.id === "frontCover") {
      drawFrontCover(ctx, el, surface, image);
    } else if (
      surface.id === "pageFore" ||
      surface.id === "pageTop" ||
      surface.id === "pageBottom"
    ) {
      drawPageSurface(ctx, el, surface);
    } else {
      drawCoverSurface(ctx, el, surface);
    }
  }

  drawHingeAndFinish(ctx, el, geometry.front, geometry.hinge, geometry.binding);
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  shadow: ReturnType<typeof getBookMockupGeometry>["shadow"],
) {
  const shadowAlpha = clamp(el.shadowOpacity, 0, 0.8);
  const localScale = Math.min(el.width, el.height) / 600;
  ctx.save();
  ctx.translate(shadow.cx, shadow.cy);
  ctx.rotate(shadow.rotation);
  ctx.filter = `blur(${Math.max(0, el.shadowBlur) * localScale * 0.35}px)`;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadow.radiusX);
  gradient.addColorStop(0, `rgba(8, 12, 20, ${shadowAlpha})`);
  gradient.addColorStop(0.58, `rgba(8, 12, 20, ${shadowAlpha * 0.52})`);
  gradient.addColorStop(1, "rgba(8, 12, 20, 0)");
  ctx.fillStyle = gradient;
  ctx.scale(1, shadow.radiusY / Math.max(1, shadow.radiusX));
  ctx.beginPath();
  ctx.arc(0, 0, shadow.radiusX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrontCover(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  surface: BookMockupSurface,
  image?: HTMLImageElement,
) {
  // Always fill solid opaque backing so transparent PNGs/textures don't make the book see-through
  pathQuad(ctx, surface.quad);
  ctx.fillStyle =
    el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : "#ffffff";
  ctx.fill();

  if (image?.complete && image.naturalWidth > 0) {
    drawImageInQuad(ctx, image, surface.quad);
  } else {
    drawCoverPlaceholder(ctx, el, surface.quad);
  }
  applyIllumination(ctx, surface.quad, surface.illumination);
}

function drawCoverPlaceholder(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  quad: MockupQuad,
) {
  const bounds = quadBounds(quad);
  pathQuad(ctx, quad);
  const placeholder = ctx.createLinearGradient(
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  );
  placeholder.addColorStop(0, "#e9edf3");
  placeholder.addColorStop(1, "#cbd3df");
  ctx.fillStyle = placeholder;
  ctx.fill();
  ctx.save();
  pathQuad(ctx, quad);
  ctx.clip();

  // Subtle inner border
  const padX = bounds.width * 0.08;
  const padY = bounds.height * 0.08;
  ctx.strokeStyle = "rgba(71, 84, 103, 0.18)";
  ctx.lineWidth = Math.max(1, el.width * 0.002);
  ctx.strokeRect(
    bounds.x + padX,
    bounds.y + padY,
    bounds.width - padX * 2,
    bounds.height - padY * 2,
  );

  ctx.fillStyle = "#536176";
  ctx.font = `700 ${Math.max(11, bounds.width * 0.075)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CHOOSE COVER", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  ctx.restore();
}

function drawPageSurface(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  surface: BookMockupSurface,
) {
  const base = el.pageColor ?? "#f8f4ec";
  const quad = surface.quad;
  const bounds = quadBounds(quad);
  pathQuad(ctx, quad);
  const gradient = ctx.createLinearGradient(
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  );
  gradient.addColorStop(0, shadeHex(base, 8));
  gradient.addColorStop(0.42, base);
  gradient.addColorStop(1, shadeHex(base, -18));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.save();
  pathQuad(ctx, quad);
  ctx.clip();
  ctx.strokeStyle = "rgba(92, 75, 52, 0.13)";
  ctx.lineWidth = Math.max(0.35, Math.min(el.width, el.height) * 0.001);
  const count = surface.id === "pageFore" ? 24 : 15;
  for (let index = 1; index < count; index++) {
    const amount = index / count;
    let from: MockupPoint;
    let to: MockupPoint;
    if (surface.id === "pageFore") {
      from = lerp(quad[0], quad[3], amount);
      to = lerp(quad[1], quad[2], amount);
    } else {
      from = lerp(quad[0], quad[1], amount);
      to = lerp(quad[3], quad[2], amount);
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();

  // Contact shadow where the page block meets the cover.
  const contact = ctx.createLinearGradient(quad[0].x, quad[0].y, quad[3].x, quad[3].y);
  contact.addColorStop(0, "rgba(24, 20, 16, 0.18)");
  contact.addColorStop(0.12, "rgba(24, 20, 16, 0)");
  contact.addColorStop(0.88, "rgba(24, 20, 16, 0)");
  contact.addColorStop(1, "rgba(24, 20, 16, 0.12)");
  pathQuad(ctx, quad);
  ctx.fillStyle = contact;
  ctx.fill();
  applyIllumination(ctx, quad, surface.illumination);
}

function drawCoverSurface(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  surface: BookMockupSurface,
) {
  const isSpine = surface.id === "spine";
  const isBack = surface.id === "backCover";
  const base = isBack ? shadeHex(el.spineColor, -12) : el.spineColor;
  const bounds = quadBounds(surface.quad);
  const gradient = ctx.createLinearGradient(
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  );
  gradient.addColorStop(0, shadeHex(base, isSpine ? 18 : 10));
  gradient.addColorStop(0.48, base);
  gradient.addColorStop(1, shadeHex(base, isSpine ? -32 : -20));
  pathQuad(ctx, surface.quad);
  ctx.fillStyle = gradient;
  ctx.fill();
  applyIllumination(ctx, surface.quad, surface.illumination);
  pathQuad(ctx, surface.quad);
  ctx.strokeStyle = "rgba(8, 12, 20, 0.22)";
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

function drawHingeAndFinish(
  ctx: CanvasRenderingContext2D,
  el: BookMockupElement,
  front: MockupQuad,
  hinge: MockupQuad,
  binding: "paperback" | "hardcover",
) {
  const hingeStart = midpoint(hinge[0], hinge[3]);
  const hingeEnd = midpoint(hinge[1], hinge[2]);
  ctx.save();
  pathQuad(ctx, front);
  ctx.clip();

  // Subtle natural joint crease along the spine hinge
  const crease = ctx.createLinearGradient(hingeStart.x, hingeStart.y, hingeEnd.x, hingeEnd.y);
  const creaseAlpha = binding === "hardcover" ? 0.14 : 0.06;
  crease.addColorStop(0, `rgba(6, 10, 18, ${creaseAlpha})`);
  crease.addColorStop(0.4, "rgba(6, 10, 18, 0.02)");
  crease.addColorStop(0.75, "rgba(255, 255, 255, 0.06)");
  crease.addColorStop(1, "rgba(255, 255, 255, 0)");
  pathQuad(ctx, hinge);
  ctx.fillStyle = crease;
  ctx.fill();

  // Delicate groove indent line for hardcover
  if (binding === "hardcover") {
    ctx.beginPath();
    ctx.moveTo(hinge[1].x, hinge[1].y);
    ctx.lineTo(hinge[2].x, hinge[2].y);
    ctx.strokeStyle = "rgba(6, 10, 18, 0.14)";
    ctx.lineWidth = Math.max(0.6, el.width * 0.0014);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hinge[1].x + 0.6, hinge[1].y);
    ctx.lineTo(hinge[2].x + 0.6, hinge[2].y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = Math.max(0.6, el.width * 0.0014);
    ctx.stroke();
  }

  // Specular light pass
  const bounds = quadBounds(front);
  const angle = ((el.lightAngle ?? -38) * Math.PI) / 180;
  const dx = Math.cos(angle) * bounds.width * 0.7;
  const dy = Math.sin(angle) * bounds.height * 0.7;
  const gloss = ctx.createLinearGradient(
    bounds.x + bounds.width / 2 - dx,
    bounds.y + bounds.height / 2 - dy,
    bounds.x + bounds.width / 2 + dx,
    bounds.y + bounds.height / 2 + dy,
  );
  const glossStrength = clamp(el.lightIntensity, 0, 1) * (binding === "hardcover" ? 0.14 : 0.09);
  gloss.addColorStop(0, `rgba(255, 255, 255, ${glossStrength})`);
  gloss.addColorStop(0.35, "rgba(255, 255, 255, 0)");
  gloss.addColorStop(1, "rgba(0, 0, 0, 0.03)");
  ctx.fillStyle = gloss;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();

  // Crisp front border edge
  pathQuad(ctx, front);
  ctx.strokeStyle = binding === "hardcover" ? "rgba(5, 8, 15, 0.32)" : "rgba(5, 8, 15, 0.2)";
  ctx.lineWidth = Math.max(0.75, el.width * (binding === "hardcover" ? 0.0024 : 0.0015));
  ctx.stroke();
}

function applyIllumination(ctx: CanvasRenderingContext2D, quad: MockupQuad, illumination: number) {
  const neutral = 0.52;
  if (illumination > neutral) {
    pathQuad(ctx, quad);
    ctx.fillStyle = `rgba(255,255,255,${clamp((illumination - neutral) * 0.48, 0, 0.34)})`;
    ctx.fill();
  } else {
    pathQuad(ctx, quad);
    ctx.fillStyle = `rgba(5,8,14,${clamp((neutral - illumination) * 0.82, 0, 0.48)})`;
    ctx.fill();
  }
}

function drawImageInQuad(ctx: CanvasRenderingContext2D, image: HTMLImageElement, quad: MockupQuad) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;

  // Outer clip to the exact quad boundary
  ctx.save();
  pathQuad(ctx, quad);
  ctx.clip();

  // Subdivide into a grid of triangles for smooth perspective mapping without vertical strip artifacts
  const segments = 12;
  const grid: { x: number; y: number; u: number; v: number }[][] = [];

  for (let gy = 0; gy <= segments; gy++) {
    const row: { x: number; y: number; u: number; v: number }[] = [];
    const v = gy / segments;
    for (let gx = 0; gx <= segments; gx++) {
      const u = gx / segments;
      const top = lerp(quad[0], quad[1], u);
      const bottom = lerp(quad[3], quad[2], u);
      const pt = lerp(top, bottom, v);
      row.push({ x: pt.x, y: pt.y, u, v });
    }
    grid.push(row);
  }

  for (let gy = 0; gy < segments; gy++) {
    for (let gx = 0; gx < segments; gx++) {
      const p00 = grid[gy][gx];
      const p10 = grid[gy][gx + 1];
      const p01 = grid[gy + 1][gx];
      const p11 = grid[gy + 1][gx + 1];

      // Triangle 1: p00, p10, p01 (top-left, top-right, bottom-left)
      drawTriangle(
        ctx,
        image,
        p00.u * sourceWidth,
        p00.v * sourceHeight,
        p10.u * sourceWidth,
        p10.v * sourceHeight,
        p01.u * sourceWidth,
        p01.v * sourceHeight,
        p00.x,
        p00.y,
        p10.x,
        p10.y,
        p01.x,
        p01.y,
      );

      // Triangle 2: p10, p11, p01 (top-right, bottom-right, bottom-left)
      drawTriangle(
        ctx,
        image,
        p10.u * sourceWidth,
        p10.v * sourceHeight,
        p11.u * sourceWidth,
        p11.v * sourceHeight,
        p01.u * sourceWidth,
        p01.v * sourceHeight,
        p10.x,
        p10.y,
        p11.x,
        p11.y,
        p01.x,
        p01.y,
      );
    }
  }

  ctx.restore();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const denom = (u0 - u2) * (v1 - v2) - (u1 - u2) * (v0 - v2);
  if (Math.abs(denom) < 1e-6) return;

  const a = ((x0 - x2) * (v1 - v2) - (x1 - x2) * (v0 - v2)) / denom;
  const b = ((y0 - y2) * (v1 - v2) - (y1 - y2) * (v0 - v2)) / denom;
  const c = ((x1 - x2) * (u0 - u2) - (x0 - x2) * (u1 - u2)) / denom;
  const d = ((y1 - y2) * (u0 - u2) - (y0 - y2) * (u1 - u2)) / denom;
  const e = x0 - a * u0 - c * v0;
  const f = y0 - b * u0 - d * v0;

  // Slightly expand triangle clipping path to prevent subpixel hairline gaps
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  const expand = 0.5;

  const dx0 = x0 - cx;
  const dy0 = y0 - cy;
  const len0 = Math.hypot(dx0, dy0) || 1;
  const ex0 = x0 + (dx0 / len0) * expand;
  const ey0 = y0 + (dy0 / len0) * expand;

  const dx1 = x1 - cx;
  const dy1 = y1 - cy;
  const len1 = Math.hypot(dx1, dy1) || 1;
  const ex1 = x1 + (dx1 / len1) * expand;
  const ey1 = y1 + (dy1 / len1) * expand;

  const dx2 = x2 - cx;
  const dy2 = y2 - cy;
  const len2 = Math.hypot(dx2, dy2) || 1;
  const ex2 = x2 + (dx2 / len2) * expand;
  const ey2 = y2 + (dy2 / len2) * expand;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex0, ey0);
  ctx.lineTo(ex1, ey1);
  ctx.lineTo(ex2, ey2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function pathQuad(ctx: CanvasRenderingContext2D, quad: MockupQuad) {
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let index = 1; index < quad.length; index++) ctx.lineTo(quad[index].x, quad[index].y);
  ctx.closePath();
}

function quadBounds(quad: MockupQuad) {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function lerp(a: MockupPoint, b: MockupPoint, amount: number): MockupPoint {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

function midpoint(a: MockupPoint, b: MockupPoint) {
  return lerp(a, b, 0.5);
}

function shadeHex(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const value = Number.parseInt(normalized, 16);
  const channel = (shift: number) =>
    Math.min(255, Math.max(0, ((value >> shift) & 0xff) + amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
