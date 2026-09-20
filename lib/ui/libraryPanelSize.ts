/**
 * Left-rail sizes for Block vs AI Assistance.
 * Block is the minimum assistant size; the AI chat panel can grow from there.
 */

export const LIBRARY_BLOCK_WIDTH = 238;
export const LIBRARY_BLOCK_WIDTH_NARROW = 204;
export const LIBRARY_ASSISTANT_DEFAULT_WIDTH = 476;
export const LIBRARY_ASSISTANT_MAX_WIDTH = 720;
export const LIBRARY_ASSISTANT_WIDTH_STORAGE_KEY = "artshift:library:assistant-width";
export const LIBRARY_NARROW_MEDIA_QUERY = "(max-width: 1180px)";

export function libraryBlockWidth(viewportWidth?: number): number {
  if (typeof viewportWidth === "number") {
    return viewportWidth <= 1180 ? LIBRARY_BLOCK_WIDTH_NARROW : LIBRARY_BLOCK_WIDTH;
  }
  if (typeof window !== "undefined" && window.matchMedia(LIBRARY_NARROW_MEDIA_QUERY).matches) {
    return LIBRARY_BLOCK_WIDTH_NARROW;
  }
  return LIBRARY_BLOCK_WIDTH;
}

export function clampLibraryAssistantWidth(width: number, minWidth = libraryBlockWidth()): number {
  if (!Number.isFinite(width)) return LIBRARY_ASSISTANT_DEFAULT_WIDTH;
  return Math.round(Math.min(LIBRARY_ASSISTANT_MAX_WIDTH, Math.max(minWidth, width)));
}

export function readLibraryAssistantWidth(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window === "undefined"
    ? null
    : window.localStorage,
  minWidth = libraryBlockWidth(),
): number {
  const raw = storage?.getItem(LIBRARY_ASSISTANT_WIDTH_STORAGE_KEY);
  const parsed = raw == null || raw === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) {
    return clampLibraryAssistantWidth(LIBRARY_ASSISTANT_DEFAULT_WIDTH, minWidth);
  }
  return clampLibraryAssistantWidth(parsed, minWidth);
}

export function persistLibraryAssistantWidth(
  width: number,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window === "undefined"
    ? null
    : window.localStorage,
  minWidth = libraryBlockWidth(),
): number {
  const next = clampLibraryAssistantWidth(width, minWidth);
  storage?.setItem(LIBRARY_ASSISTANT_WIDTH_STORAGE_KEY, String(next));
  return next;
}
