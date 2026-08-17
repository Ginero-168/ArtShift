"use client";

/**
 * Image cache.
 *
 * Holds decoded HTMLImageElement instances keyed by `fileId`. The store keeps
 * a stable map ref so renderers can access images without React re-renders.
 * On `loadDataURL`, we decode the image, store the dataURL alongside (for
 * export/serialization), and notify subscribers (canvas redraws via
 * a version bump on the store).
 */

import { useEngine } from "./store";

export type CachedImage = {
  fileId: string;
  dataURL: string;
  img: HTMLImageElement;
  width: number;
  height: number;
};

const cache = new Map<string, CachedImage>();
const imageMap = new Map<string, HTMLImageElement>();
const subscribers = new Set<() => void>();
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function getImageCache(): Map<string, HTMLImageElement> {
  return imageMap;
}

export function getCached(fileId: string): CachedImage | undefined {
  return cache.get(fileId);
}

export function subscribeImageCache(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export async function loadDataURL(dataURL: string): Promise<CachedImage> {
  const fileId = await hashString(dataURL);
  const existing = cache.get(fileId);
  if (existing) return existing;
  const img = await decode(dataURL);
  if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
    throw new Error("Image is too large. Maximum decoded size is 80 megapixels.");
  }
  const entry: CachedImage = {
    fileId,
    dataURL,
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
  cache.set(fileId, entry);
  imageMap.set(fileId, img);
  for (const fn of subscribers) fn();
  // Bump store so React re-renders the canvas.
  useEngine.setState({});
  return entry;
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function hashString(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(s);
    const digest = await crypto.subtle.digest("SHA-1", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  // Fallback: simple FNV-1a.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

export function fileToDataURL(file: File): Promise<string> {
  if (!isSupportedImageFile(file)) {
    return Promise.reject(new Error("Use PNG, JPEG or WebP images."));
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error("Image is too large. Maximum file size is 50 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isSupportedImageFile(file: Pick<File, "name" | "type" | "size">): boolean {
  const extension = file.name.toLowerCase().split(".").at(-1);
  return (
    file.size <= MAX_IMAGE_BYTES &&
    SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) &&
    (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp")
  );
}
