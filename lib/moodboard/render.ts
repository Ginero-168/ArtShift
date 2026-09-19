import { getCached } from "@/lib/engine/imageCache";
import type { EngineSlide, MoodboardItem } from "@/lib/engine/types";
import { moodboardContentBounds } from "./layout";
import { isMoodboardSlide } from "./types";

export const MOODBOARD_BOARD_FILL = "#f4f4f5";

export function renderMoodboardThumbnail(
  slide: EngineSlide,
  ctx: CanvasRenderingContext2D,
  destW: number,
  destH: number,
  images?: Map<string, HTMLImageElement>,
): void {
  const items = isMoodboardSlide(slide) ? (slide.moodboard?.items ?? []) : [];
  const bounds = moodboardContentBounds(items);
  ctx.fillStyle = slide.background || MOODBOARD_BOARD_FILL;
  ctx.fillRect(0, 0, destW, destH);
  if (!items.length) {
    ctx.fillStyle = "#9a8f7e";
    ctx.font = `${Math.max(10, Math.round(destW * 0.11))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Moodboard", destW / 2, destH / 2);
    return;
  }

  const scale = Math.min(destW / bounds.width, destH / bounds.height);
  ctx.save();
  ctx.translate((destW - bounds.width * scale) / 2, (destH - bounds.height * scale) / 2);
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);
  for (const item of items) {
    drawMoodboardItem(ctx, item, images);
  }
  ctx.restore();
}

export function drawMoodboardItem(
  ctx: CanvasRenderingContext2D,
  item: MoodboardItem,
  images?: Map<string, HTMLImageElement>,
): void {
  ctx.save();
  ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
  ctx.rotate(item.rotation || 0);
  ctx.translate(-item.width / 2, -item.height / 2);

  if (item.kind === "note") {
    ctx.fillStyle = item.color || "#fde68a";
    ctx.fillRect(0, 0, item.width, item.height);
    ctx.fillStyle = "#78350f";
    ctx.font = `${Math.max(12, item.height * 0.14)}px sans-serif`;
    ctx.fillText((item.text || "Note").slice(0, 28), 10, 24);
  } else if (item.kind === "chip") {
    ctx.fillStyle = item.color || "#e5e7eb";
    roundRect(ctx, 0, 0, item.width, item.height, 12);
    ctx.fill();
    ctx.fillStyle = contrastInk(item.color);
    ctx.font = `${Math.max(11, item.height * 0.38)}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText((item.text || item.role || "").slice(0, 18), 12, item.height / 2);
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, item.width, item.height);
    const img =
      (item.fileId ? images?.get(item.fileId) || getCached(item.fileId)?.img : undefined) ??
      (item.src ? images?.get(item.src) : undefined);
    if (img) {
      ctx.drawImage(img, 6, 6, item.width - 12, item.height - 28);
    } else {
      ctx.fillStyle = item.placeholder ? "#e2e8f0" : "#e4e4e7";
      ctx.fillRect(6, 6, item.width - 12, item.height - 28);
      ctx.fillStyle = "#8a8174";
      ctx.font = "12px sans-serif";
      ctx.fillText((item.text || item.query || "Photo").slice(0, 22), 10, item.height / 2);
    }
    ctx.fillStyle = "#6b7280";
    ctx.font = "10px sans-serif";
    const credit = item.credit?.photographer
      ? `${item.credit.photographer}${item.credit.provider ? ` · ${item.credit.provider}` : ""}`
      : item.text || "";
    ctx.fillText(credit.slice(0, 28), 8, item.height - 10);
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
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function contrastInk(color?: string): string {
  if (!color?.startsWith("#")) return "#111827";
  const hex =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma > 150 ? "#111827" : "#fff7ed";
}
