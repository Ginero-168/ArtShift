import { getBookMockupGeometry } from "./bookMockup";
import type { BookMockupElement, EngineElement, ImageElement } from "./types";

export type MediaElement = ImageElement | BookMockupElement;
export type MediaRect = { x: number; y: number; width: number; height: number };

const MIN_MEDIA_SIZE = 2;
const BOOK_ASPECT_KEYS = new Set([
  "naturalWidth",
  "naturalHeight",
  "yaw",
  "pitch",
  "roll",
  "perspective",
  "depth",
  "binding",
  "coverThickness",
  "coverOverhang",
]);

export function isMediaElement(element: EngineElement): element is MediaElement {
  return element.type === "image" || element.type === "bookMockup";
}

/** The aspect ratio of the pixels/surfaces that the selection box represents. */
export function getMediaAspectRatio(element: MediaElement): number {
  if (element.type === "image") {
    const source = element.crop ?? {
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
    return safeAspect(source.width, source.height, element.width, element.height);
  }

  // Project into a square probe. Projection uses a uniform internal scale, so
  // the visible-surface ratio is independent from the current element box.
  const probe: BookMockupElement = {
    ...element,
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
    angle: 0,
  };
  const geometry = getBookMockupGeometry(probe);
  const visiblePoints = geometry.surfaces
    .filter((surface) => surface.visible)
    .flatMap((surface) => surface.quad);
  const points = visiblePoints.length ? visiblePoints : geometry.front;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return safeAspect(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    element.naturalWidth,
    element.naturalHeight,
  );
}

/** Center-contain a media object in an available rectangle without distortion. */
export function fitMediaElementToRect(element: MediaElement, rect: MediaRect): MediaRect {
  return fitRectToAspect(rect, getMediaAspectRatio(element));
}

export function fitRectToAspect(rect: MediaRect, aspect: number): MediaRect {
  const width = Math.max(MIN_MEDIA_SIZE, finiteOr(rect.width, MIN_MEDIA_SIZE));
  const height = Math.max(MIN_MEDIA_SIZE, finiteOr(rect.height, MIN_MEDIA_SIZE));
  const safeRatio = validAspect(aspect) ? aspect : width / height;
  let fittedWidth = width;
  let fittedHeight = fittedWidth / safeRatio;
  if (fittedHeight > height) {
    fittedHeight = height;
    fittedWidth = fittedHeight * safeRatio;
  }
  return {
    x: rect.x + (width - fittedWidth) / 2,
    y: rect.y + (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

/**
 * Keep visual area and center stable when a source/camera change alters the
 * intrinsic ratio. The result is reduced only when it cannot fit the Artwork.
 */
export function reframeMediaAroundCenter(
  rect: MediaRect,
  aspect: number,
  bounds?: MediaRect,
): MediaRect {
  const safeRatio = validAspect(aspect) ? aspect : safeAspect(rect.width, rect.height, 1, 1);
  const area = Math.max(MIN_MEDIA_SIZE ** 2, rect.width * rect.height);
  let width = Math.sqrt(area * safeRatio);
  let height = width / safeRatio;
  if (bounds) {
    const scale = Math.min(
      1,
      Math.max(MIN_MEDIA_SIZE, bounds.width) / width,
      Math.max(MIN_MEDIA_SIZE, bounds.height) / height,
    );
    width *= scale;
    height *= scale;
  }
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  let x = centerX - width / 2;
  let y = centerY - height / 2;
  if (bounds) {
    x = clamp(x, bounds.x, bounds.x + bounds.width - width);
    y = clamp(y, bounds.y, bounds.y + bounds.height - height);
  }
  return { x, y, width, height };
}

export function mediaPatchAffectsAspect(
  element: MediaElement,
  patch: Partial<EngineElement>,
): boolean {
  const keys = Object.keys(patch);
  if (element.type === "image") {
    return keys.some((key) => key === "naturalWidth" || key === "naturalHeight" || key === "crop");
  }
  return keys.some((key) => BOOK_ASPECT_KEYS.has(key));
}

/** Enforce media ratio for every store patch, including numeric and pointer resize. */
export function normalizeMediaPatch(
  element: MediaElement,
  patch: Partial<EngineElement>,
  options: { container?: MediaRect; artwork?: MediaRect } = {},
): Partial<EngineElement> {
  const merged = { ...element, ...patch } as MediaElement;
  const aspect = getMediaAspectRatio(merged);
  const hasWidth = patch.width !== undefined;
  const hasHeight = patch.height !== undefined;

  if (hasWidth || hasHeight) {
    const x = patch.x ?? element.x;
    const y = patch.y ?? element.y;
    const width = Math.max(MIN_MEDIA_SIZE, patch.width ?? element.width);
    const height = Math.max(MIN_MEDIA_SIZE, patch.height ?? element.height);
    let geometry: MediaRect;
    if (hasWidth && hasHeight) {
      geometry = fitRectToAspect({ x, y, width, height }, aspect);
    } else if (hasWidth) {
      geometry = { x, y, width, height: width / aspect };
    } else {
      geometry = { x, y, width: height * aspect, height };
    }
    return { ...patch, ...geometry } as Partial<EngineElement>;
  }

  if (!mediaPatchAffectsAspect(element, patch)) return patch;
  const geometry = options.container
    ? fitMediaElementToRect(merged, options.container)
    : reframeMediaAroundCenter(element, aspect, options.artwork);
  return { ...patch, ...geometry } as Partial<EngineElement>;
}

function safeAspect(width: number, height: number, fallbackWidth: number, fallbackHeight: number) {
  const ratio = width / height;
  if (validAspect(ratio)) return ratio;
  const fallback = fallbackWidth / fallbackHeight;
  return validAspect(fallback) ? fallback : 1;
}

function validAspect(value: number) {
  return Number.isFinite(value) && value > 0.001 && value < 1000;
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
