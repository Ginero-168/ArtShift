import type { EngineSlide } from "../engine/types";
import { getLocalRasterProcessor } from "../raster/localRasterProcessor";
import { type RenderCtx, renderSlide } from "./canvas";

export function renderSlideThumbnail(slide: EngineSlide, render: RenderCtx) {
  renderSlide(slide, render, slide.width, slide.height, { showFrames: true });
}

/**
 * Render a thumbnail at a modest source size, then move the pixel resize to
 * the shared RasterProcessor. Vector/text scene traversal remains synchronous
 * because it needs the browser font/image caches; the expensive pixel copy is
 * cancellable and Worker-backed when available.
 */
export async function renderSlideThumbnailAsync(
  slide: EngineSlide,
  canvas: HTMLCanvasElement,
  images: Map<string, HTMLImageElement>,
  signal?: AbortSignal,
): Promise<void> {
  const targetWidth = Math.max(1, canvas.width);
  const targetHeight = Math.max(1, canvas.height);
  const sourceScale = Math.min(
    1,
    640 / Math.max(1, slide.width),
    Math.sqrt(1_000_000 / Math.max(1, slide.width * slide.height)),
  );
  const sourceWidth = Math.max(targetWidth, Math.round(slide.width * sourceScale));
  const sourceHeight = Math.max(targetHeight, Math.round(slide.height * sourceScale));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  const targetContext = canvas.getContext("2d");
  if (!sourceContext || !targetContext) return;

  sourceContext.setTransform(sourceWidth / slide.width, 0, 0, sourceHeight / slide.height, 0, 0);
  renderSlideThumbnail(slide, { ctx: sourceContext, images });
  if (signal?.aborted) return;

  const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const result = await getLocalRasterProcessor().execute(
    {
      kind: "thumbnail",
      pixels: {
        width: sourcePixels.width,
        height: sourcePixels.height,
        data: sourcePixels.data,
      },
      width: targetWidth,
      height: targetHeight,
    },
    { signal },
  );
  if (signal?.aborted || result.kind !== "pixels") return;
  targetContext.setTransform(1, 0, 0, 1, 0, 0);
  const pixels = new Uint8ClampedArray(result.data.length);
  pixels.set(result.data);
  targetContext.putImageData(new ImageData(pixels, result.width, result.height), 0, 0);
}
