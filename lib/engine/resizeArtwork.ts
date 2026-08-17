import { recomputeArrowBindings } from "./binding";
import { reflowBlockObjects, remapBlockLayersToArtwork } from "./layers";
import { isMediaElement } from "./mediaLayout";
import type { EngineElement, EngineSlide, WorkspaceStrictness } from "./types";

export function resizeArtworkSlide(
  slide: EngineSlide,
  width: number,
  height: number,
  strictness: WorkspaceStrictness,
  resizeContents = true,
): EngineSlide {
  const safeWidth = Math.max(64, Math.min(10000, Math.round(width)));
  const safeHeight = Math.max(64, Math.min(10000, Math.round(height)));
  if (!resizeContents) {
    return recomputeArrowBindings(
      reflowBlockObjects(remapBlockLayersToArtwork(slide, safeWidth, safeHeight), strictness),
    );
  }

  const scaleX = safeWidth / Math.max(1, slide.width);
  const scaleY = safeHeight / Math.max(1, slide.height);
  const typeScale = Math.sqrt(scaleX * scaleY);
  const scaled = slide.elements.map((element) => {
    const media = isMediaElement(element);
    const nextWidth = element.width * (media ? typeScale : scaleX);
    const nextHeight = element.height * (media ? typeScale : scaleY);
    const centerX = (element.x + element.width / 2) * scaleX;
    const centerY = (element.y + element.height / 2) * scaleY;
    const next = {
      ...element,
      x: media ? centerX - nextWidth / 2 : element.x * scaleX,
      y: media ? centerY - nextHeight / 2 : element.y * scaleY,
      width: nextWidth,
      height: nextHeight,
      strokeWidth: element.strokeWidth * typeScale,
      version: element.version + 1,
    } as EngineElement;
    if (next.type === "text") next.fontSize *= typeScale;
    if (next.shadow) {
      next.shadow = {
        ...next.shadow,
        blur: next.shadow.blur * typeScale,
        offsetX: next.shadow.offsetX * scaleX,
        offsetY: next.shadow.offsetY * scaleY,
      };
    }
    return next;
  });
  const resized = remapBlockLayersToArtwork({ ...slide, elements: scaled }, safeWidth, safeHeight);
  return recomputeArrowBindings(reflowBlockObjects(resized, strictness));
}
