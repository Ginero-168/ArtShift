/**
 * Sampled clone-stamp preview: blit source pixels into the brush circle
 * under the cursor (Affinity/PS-style), not just a path + marker.
 */

export type ClonePoint = [number, number];

/** Source sample center for the brush sitting at `hover`. */
export function cloneSamplePoint(
  source: ClonePoint,
  destStart: ClonePoint | null,
  hover: ClonePoint,
): ClonePoint {
  if (!destStart) return source;
  return [source[0] + hover[0] - destStart[0], source[1] + hover[1] - destStart[1]];
}

/**
 * Draw a circular sampled preview at `destCenter`, taking pixels from
 * `sampleCenter` on `source`. Hardness feathers the stamp edge.
 */
export function paintCloneBlitPreview(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  sampleCenter: ClonePoint,
  destCenter: ClonePoint,
  size: number,
  hardness: number,
): boolean {
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  const width = target.width;
  const height = target.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const radius = Math.max(0.5, size / 2);
  const hard = Math.max(0, Math.min(1, hardness));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(destCenter[0], destCenter[1], radius, radius, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(source, destCenter[0] - sampleCenter[0], destCenter[1] - sampleCenter[1]);
  ctx.restore();
  ctx.globalCompositeOperation = "destination-in";
  const gradient = ctx.createRadialGradient(
    destCenter[0],
    destCenter[1],
    radius * hard,
    destCenter[0],
    destCenter[1],
    radius,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(Math.max(0.05, Math.min(0.95, hard)), "rgba(255,255,255,0.92)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(destCenter[0], destCenter[1], radius, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  return true;
}
