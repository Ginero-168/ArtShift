"use client";

import { createImage, createText } from "@/lib/engine/factory";
import { fileToDataURL, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, MoodboardItem } from "@/lib/engine/types";
import { isMoodboardSlide } from "./types";

export type CopyToSlideResult =
  | { ok: true; slideId: string; elementCount: number }
  | { ok: false; message: string };

/**
 * Copy selected (or all) Moodboard items onto a new artwork slide as normal
 * EngineElements so layers, transforms, and properties work as usual.
 */
export async function copyMoodboardItemsToArtworkSlide(
  itemIds?: string[],
): Promise<CopyToSlideResult> {
  const engine = useEngine.getState();
  const slide = engine.currentSlide();
  if (!slide || !isMoodboardSlide(slide) || !slide.moodboard) {
    return { ok: false, message: "Switch to a Moodboard slide first." };
  }

  const board = slide.moodboard;
  const selected = itemIds?.length
    ? new Set(itemIds)
    : engine.selectedIds.size
      ? engine.selectedIds
      : null;
  const items = board.items.filter((item) => (selected ? selected.has(item.id) : true));
  if (!items.length) {
    return { ok: false, message: "Nothing to copy. Add or select items first." };
  }

  const elements: EngineElement[] = [];
  let cursorX = 80;
  let cursorY = 80;
  const maxRowHeight = 220;
  const slideWidth = 1920;

  for (const item of items) {
    const placed = await moodboardItemToElement(item, cursorX, cursorY);
    if (!placed) continue;
    elements.push(placed);
    cursorX += placed.width + 24;
    if (cursorX > slideWidth - 120) {
      cursorX = 80;
      cursorY += maxRowHeight + 24;
    }
  }

  if (!elements.length) {
    return { ok: false, message: "Could not convert the selected items into slide objects." };
  }

  engine.addSlide("artwork");
  engine.addElements(elements, "copy moodboard to slide");
  return { ok: true, slideId: useEngine.getState().currentSlideId, elementCount: elements.length };
}

async function moodboardItemToElement(
  item: MoodboardItem,
  x: number,
  y: number,
): Promise<EngineElement | null> {
  if (item.kind === "image" && (item.fileId || item.src)) {
    try {
      let fileId = item.fileId;
      let naturalWidth = Math.round(item.width);
      let naturalHeight = Math.round(item.height);
      if (item.src?.startsWith("data:")) {
        const entry = await loadDataURL(item.src, fileId);
        fileId = entry.fileId;
        naturalWidth = entry.width;
        naturalHeight = entry.height;
      } else if (item.src?.startsWith("https:")) {
        const response = await fetch(item.src);
        if (!response.ok) return labelElement(item, x, y);
        const blob = await response.blob();
        const file = new File([blob], item.text || "reference.png", {
          type: blob.type || "image/png",
        });
        const dataURL = await fileToDataURL(file);
        const entry = await loadDataURL(dataURL);
        fileId = entry.fileId;
        naturalWidth = entry.width;
        naturalHeight = entry.height;
      }
      if (!fileId) return labelElement(item, x, y);
      return createImage({
        x,
        y,
        width: item.width,
        height: item.height,
        fileId,
        naturalWidth,
        naturalHeight,
        name: item.text || "Moodboard image",
      });
    } catch {
      return labelElement(item, x, y);
    }
  }
  return labelElement(item, x, y);
}

function labelElement(item: MoodboardItem, x: number, y: number): EngineElement {
  return createText({
    x,
    y,
    width: Math.max(160, item.width),
    height: Math.max(48, item.height),
    text: item.text || item.query || item.role || "Label",
    fontSize: item.kind === "chip" ? 18 : 22,
  });
}
