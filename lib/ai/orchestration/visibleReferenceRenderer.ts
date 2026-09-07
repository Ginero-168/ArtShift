import { getCached, getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { renderElement } from "@/lib/renderer/canvas";
import type { ComposerImageRef } from "./imageReferences";

export type VisibleReferenceRender = {
  dataUrl: string;
  width: number;
  height: number;
  limitations: string[];
};

const MAX_RENDER_DIMENSION = 1_024;
const RENDER_PADDING = 8;

/**
 * Renders the current Canvas appearance of one snapshotted image-like element
 * into a bounded transparent PNG. This is browser-only and never writes to the
 * engine document or history.
 */
export function renderVisibleReference(ref: ComposerImageRef): VisibleReferenceRender {
  const cached = getCached(ref.fileId);
  if (!cached?.dataURL)
    throw new Error(`selected image is no longer available locally: ${ref.displayName}`);
  const slide = useEngine.getState().currentSlide();
  const element = slide?.elements.find((candidate) => candidate.id === ref.objectId);
  if (
    !element ||
    (element.type !== "image" && element.type !== "bookMockup") ||
    element.version !== ref.elementVersion ||
    element.fileId !== ref.fileId
  ) {
    throw new Error(`selected image changed before analysis: ${ref.displayName}`);
  }

  const containingLayer = slide?.layers.find((layer) => layer.objectIds.includes(element.id));
  const limitations: string[] = [];
  if (element.hidden || element.visible === false || containingLayer?.visible === false) {
    limitations.push("reference is hidden on Canvas");
  }
  if (typeof document === "undefined") {
    return {
      dataUrl: cached.dataURL,
      width: cached.width,
      height: cached.height,
      limitations: [...limitations, "visible Canvas render unavailable; source image used"],
    };
  }

  try {
    const angle = element.angle ?? 0;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const boundsWidth = Math.max(
      1,
      cos * element.width + sin * element.height + RENDER_PADDING * 2,
    );
    const boundsHeight = Math.max(
      1,
      sin * element.width + cos * element.height + RENDER_PADDING * 2,
    );
    const scale = Math.min(
      1,
      MAX_RENDER_DIMENSION / boundsWidth,
      MAX_RENDER_DIMENSION / boundsHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(boundsWidth * scale));
    canvas.height = Math.max(1, Math.ceil(boundsHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("visible reference canvas context unavailable");

    ctx.scale(scale, scale);
    ctx.translate(
      boundsWidth / 2 - (element.x + element.width / 2),
      boundsHeight / 2 - (element.y + element.height / 2),
    );
    renderElement(element, { ctx, images: getImageCache(), deferRasterJobs: false });

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      limitations,
    };
  } catch {
    return {
      dataUrl: cached.dataURL,
      width: cached.width,
      height: cached.height,
      limitations: [...limitations, "visible Canvas render failed; source image used"],
    };
  }
}
