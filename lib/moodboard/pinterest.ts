/**
 * Pinterest OAuth + Pin/board mapping.
 * ArtShift does not scrape Pinterest or Google Images.
 */

export const PINTEREST_AUTHORIZE_ENDPOINT = "https://www.pinterest.com/oauth/";
export const PINTEREST_TOKEN_ENDPOINT = "https://api.pinterest.com/v5/oauth/token";
export const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

/** Read scopes matching the Lovart-style connector consent (public + secret boards/pins + account). */
export const PINTEREST_OAUTH_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "boards:read_secret",
  "pins:read",
  "pins:read_secret",
] as const;

export const PINTEREST_API_STATUS = {
  officialSavedPins: "oauth_when_configured",
  userPaste: "fallback",
  scrape: "not_supported",
} as const;

export type PinterestPinCard = {
  id: string;
  title: string;
  src: string;
  sourceUrl?: string;
  boardId?: string;
};

export type PinterestBoardCard = {
  id: string;
  name: string;
  coverSrc?: string;
  pinCount?: number;
};

export function isPinterestUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes("pinterest.") || host.includes("pinimg.com");
  } catch {
    return false;
  }
}

export function mapPinterestPin(value: unknown): PinterestPinCard | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const media = isRecord(value.media) ? value.media : {};
  const images = isRecord(media.images) ? media.images : {};
  const src =
    imageUrl(images["600x"]) ||
    imageUrl(images["400x300"]) ||
    imageUrl(images.orig) ||
    safeHttps(value.image_url);
  if (!src) return null;
  const title =
    asTrimmed(value.title) || asTrimmed(value.alt_text) || asTrimmed(value.description) || "Pin";
  return {
    id: value.id,
    title,
    src,
    sourceUrl: safeHttps(value.link),
    boardId: typeof value.board_id === "string" ? value.board_id : undefined,
  };
}

export function mapPinterestBoard(value: unknown): PinterestBoardCard | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const name = asTrimmed(value.name);
  if (!name) return null;
  const media = isRecord(value.media) ? value.media : {};
  const thumbnails = Array.isArray(media.pin_thumbnail_urls) ? media.pin_thumbnail_urls : [];
  const cover =
    safeHttps(media.image_cover_url) ??
    (typeof thumbnails[0] === "string" ? safeHttps(thumbnails[0]) : undefined);
  return {
    id: value.id,
    name,
    coverSrc: cover,
    pinCount: typeof value.pin_count === "number" ? value.pin_count : undefined,
  };
}

function imageUrl(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return safeHttps(value.url) ?? undefined;
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttps(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
