"use client";

import { createImage } from "@/lib/engine/factory";
import { loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import {
  isPinterestImageProxyUrl,
  type PinterestPinCard,
  pinterestImageProxyPath,
} from "@/lib/pinterest/api";
import { enqueueAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";

/**
 * Turn a dropped Pinterest proxy URL into a durable data URL before the shared
 * canvas importer caches it. Other drop URLs pass through unchanged.
 */
export async function loadDroppedImageSource(imageUrl: string): Promise<string> {
  if (!isPinterestImageProxyUrl(imageUrl)) return imageUrl;
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not download the Pin.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("Pin was not an image.");
  return readBlobAsDataUrl(blob);
}

/** Click path: same cache + image element import as a pasted image, centered on the slide. */
export async function placePinterestPinOnCanvas(
  pin: Pick<PinterestPinCard, "title" | "src">,
): Promise<void> {
  const dataURL = await loadDroppedImageSource(pinterestImageProxyPath(pin.src));
  const entry = await loadDataURL(dataURL);
  enqueueAssetAnalysis({
    fileId: entry.fileId,
    dataURL: entry.dataURL,
    width: entry.width,
    height: entry.height,
  });

  const state = useEngine.getState();
  const slide = state.currentSlide();
  if (!slide) throw new Error("No artwork slide is open.");
  const maxW = slide.width / 2;
  const maxH = slide.height / 2;
  const ratio =
    entry.width > 0 && entry.height > 0 ? Math.min(maxW / entry.width, maxH / entry.height, 1) : 1;
  const width = entry.width * ratio;
  const height = entry.height * ratio;
  const element = createImage({
    x: slide.width / 2 - width / 2,
    y: slide.height / 2 - height / 2,
    width,
    height,
    fileId: entry.fileId,
    naturalWidth: entry.width,
    naturalHeight: entry.height,
    name: pin.title || "Pin",
    sourceName: pin.title || "Pin",
  });
  state.addElement(element, "add pinterest pin");
  state.selectOnly([element.id]);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the Pin."));
    reader.readAsDataURL(blob);
  });
}
