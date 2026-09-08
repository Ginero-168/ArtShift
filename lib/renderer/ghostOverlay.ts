import type { RenderCtx } from "./canvas";

/**
 * Data required to render a non-destructive Ghost Overlay on top of the Artwork.
 */
export type GhostVariationOverlay = {
  variationId: string;
  image: HTMLImageElement | ImageBitmap | CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  label?: string;
  isPlacementLocked?: boolean;
};

export type GhostPlacementIntent =
  | "center"
  | "fill-background"
  | "fit-artwork"
  | "preserve-selection";

/**
 * Calculates optimal ghost bounding box based on image aspect ratio and Artwork bounds.
 */
export function calculateGhostBounds(
  artworkWidth: number,
  artworkHeight: number,
  imageWidth: number,
  imageHeight: number,
  intent: GhostPlacementIntent = "center",
  selectionBounds?: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (intent === "preserve-selection" && selectionBounds) {
    return { ...selectionBounds };
  }

  if (intent === "fill-background") {
    return { x: 0, y: 0, width: artworkWidth, height: artworkHeight };
  }

  const imageAspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;
  const targetArea = intent === "fit-artwork" ? 0.9 : 0.65;

  let width = artworkWidth * targetArea;
  let height = width / imageAspect;

  if (height > artworkHeight * targetArea) {
    height = artworkHeight * targetArea;
    width = height * imageAspect;
  }

  width = Math.round(width);
  height = Math.round(height);
  const x = Math.round((artworkWidth - width) / 2);
  const y = Math.round((artworkHeight - height) / 2);

  return { x, y, width, height };
}

/**
 * Renders the candidate variation as a non-destructive Ghost Overlay on the 2D canvas.
 * It draws the image with slight transparency, an animated/dashed accent outline,
 * and an informative badge tag without mutating document elements.
 */
export function drawGhostVariationOverlay(overlay: GhostVariationOverlay, render: RenderCtx): void {
  const { ctx } = render;
  const { x, y, width, height, opacity = 0.85, label = "AI Variation Preview" } = overlay;

  ctx.save();

  // 1. Draw Ghost Image
  ctx.globalAlpha = Math.max(0.1, Math.min(1.0, opacity));
  try {
    ctx.drawImage(overlay.image, x, y, width, height);
  } catch {
    // If image is not yet fully decoded, fallback gracefully
  }

  // 2. Draw Accent Outline (Ghost bounding box)
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = "#8b5cf6"; // Violet brand accent
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, width, height);

  // 3. Draw Corner Anchors
  ctx.setLineDash([]);
  ctx.fillStyle = "#8b5cf6";
  const anchorSize = 8;
  const halfAnchor = anchorSize / 2;

  // Corners
  ctx.fillRect(x - halfAnchor, y - halfAnchor, anchorSize, anchorSize);
  ctx.fillRect(x + width - halfAnchor, y - halfAnchor, anchorSize, anchorSize);
  ctx.fillRect(x - halfAnchor, y + height - halfAnchor, anchorSize, anchorSize);
  ctx.fillRect(x + width - halfAnchor, y + height - halfAnchor, anchorSize, anchorSize);

  // 4. Draw Pill Badge Tag
  const badgeText = `✨ ${label}`;
  ctx.font = "12px sans-serif";
  const textMetrics = ctx.measureText(badgeText);
  const paddingX = 8;
  const badgeHeight = 22;
  const badgeWidth = textMetrics.width + paddingX * 2;
  const badgeX = x + 6;
  const badgeY = Math.max(6, y - badgeHeight - 4);

  // Pill background
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)"; // Slate-900 with alpha
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
  ctx.fill();

  // Pill border
  ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pill text
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, badgeX + paddingX, badgeY + badgeHeight / 2);

  ctx.restore();
}
