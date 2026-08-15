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
  drawGroundShadow(ctx, el, geometry.shadow);

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
  ctx.strokeStyle = "rgba(71, 84, 103, 0.16)";
  ctx.lineWidth = Math.max(1, el.width * 0.003);
  for (let offset = -bounds.height; offset < bounds.width + bounds.height; offset += 20) {
    ctx.beginPath();
    ctx.moveTo(bounds.x + offset, bounds.y);
    ctx.lineTo(bounds.x + offset + bounds.height, bounds.y + bounds.height);
    ctx.stroke();
  }
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
  const base = el.pageColor ?? "#f3eee2";
  const quad = surface.quad;
  const bounds = quadBounds(quad);
  pathQuad(ctx, quad);
  const gradient = ctx.createLinearGradient(
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  );
  gradient.addColorStop(0, shadeHex(base, 12));
  gradient.addColorStop(0.42, base);
  gradient.addColorStop(1, shadeHex(base, -24));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.save();
  pathQuad(ctx, quad);
  ctx.clip();
  ctx.strokeStyle = "rgba(92, 75, 52, 0.16)";
  ctx.lineWidth = Math.max(0.35, Math.min(el.width, el.height) * 0.0011);
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
  contact.addColorStop(0, "rgba(24, 20, 16, 0.22)");
  contact.addColorStop(0.12, "rgba(24, 20, 16, 0)");
  contact.addColorStop(0.86, "rgba(24, 20, 16, 0)");
  contact.addColorStop(1, "rgba(24, 20, 16, 0.16)");
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
  ctx.strokeStyle = "rgba(8, 12, 20, 0.26)";
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

  const crease = ctx.createLinearGradient(hingeStart.x, hingeStart.y, hingeEnd.x, hingeEnd.y);
  crease.addColorStop(0, `rgba(6, 10, 18, ${binding === "hardcover" ? 0.34 : 0.22})`);
  crease.addColorStop(0.28, "rgba(6, 10, 18, 0.08)");
  crease.addColorStop(0.58, `rgba(255, 255, 255, ${binding === "hardcover" ? 0.16 : 0.1})`);
  crease.addColorStop(1, "rgba(255, 255, 255, 0)");
  pathQuad(ctx, hinge);
  ctx.fillStyle = crease;
  ctx.fill();

  // A broad, restrained specular pass makes the cover react to the same key
  // light while preserving the printed cover artwork.
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
  const glossStrength = clamp(el.lightIntensity, 0, 1) * (binding === "hardcover" ? 0.2 : 0.12);
  gloss.addColorStop(0, `rgba(255,255,255,${glossStrength})`);
  gloss.addColorStop(0.35, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = gloss;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();

  pathQuad(ctx, front);
  ctx.strokeStyle = binding === "hardcover" ? "rgba(5, 8, 15, 0.46)" : "rgba(5, 8, 15, 0.3)";
  ctx.lineWidth = Math.max(0.8, el.width * (binding === "hardcover" ? 0.0032 : 0.002));
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
  const slices = Math.max(72, Math.min(240, Math.round(sourceWidth / 5)));

  for (let index = 0; index < slices; index++) {
    const amount0 = index / slices;
    const amount1 = (index + 1) / slices;
    const sourceX0 = sourceWidth * amount0;
    const sourceX1 = sourceWidth * amount1;
    const sourceSliceWidth = Math.max(0.5, sourceX1 - sourceX0);
    const top0 = lerp(quad[0], quad[1], amount0);
    const top1 = lerp(quad[0], quad[1], amount1);
    const bottom0 = lerp(quad[3], quad[2], amount0);
    const bottom1 = lerp(quad[3], quad[2], amount1);

    const a = (top1.x - top0.x) / sourceSliceWidth;
    const b = (top1.y - top0.y) / sourceSliceWidth;
    const c = (bottom0.x - top0.x) / sourceHeight;
    const d = (bottom0.y - top0.y) / sourceHeight;
    const e = top0.x - a * sourceX0;
    const f = top0.y - b * sourceX0;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(top0.x, top0.y);
    ctx.lineTo(top1.x + 1, top1.y);
    ctx.lineTo(bottom1.x + 1, bottom1.y);
    ctx.lineTo(bottom0.x, bottom0.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(
      image,
      sourceX0,
      0,
      sourceSliceWidth + 1,
      sourceHeight,
      sourceX0,
      0,
      sourceSliceWidth + 1,
      sourceHeight,
    );
    ctx.restore();
  }
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
