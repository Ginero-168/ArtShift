/**
 * Pinterest OAuth constants and v5 response mapping.
 * ArtShift reads the connected account's Pins and Boards. It does not scrape Pinterest.
 */

export const PINTEREST_AUTHORIZE_ENDPOINT = "https://www.pinterest.com/oauth/";
export const PINTEREST_TOKEN_ENDPOINT = "https://api.pinterest.com/v5/oauth/token";
export const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

/** Read scopes for the connected account, including secret boards and pins. */
export const PINTEREST_OAUTH_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "boards:read_secret",
  "pins:read",
  "pins:read_secret",
] as const;

export const PINTEREST_IMAGE_PROXY_PATH = "/api/pinterest/image";

export type PinterestPinCard = {
  id: string;
  title: string;
  /** Highest useful image URL for canvas import. */
  src: string;
  /** Smaller image for the library grid. */
  thumb: string;
  sourceUrl?: string;
  boardId?: string;
};

export type PinterestBoardCard = {
  id: string;
  name: string;
  coverSrc?: string;
  pinCount?: number;
};

export function pinterestImageProxyPath(src: string): string {
  return `${PINTEREST_IMAGE_PROXY_PATH}?src=${encodeURIComponent(src)}`;
}

/** True for the same-origin proxy used by canvas drop (absolute or relative). */
export function isPinterestImageProxyUrl(value: string): boolean {
  if (!value || value.length > 4_000) return false;
  try {
    const url = new URL(value, "https://artshift.local");
    return url.pathname === PINTEREST_IMAGE_PROXY_PATH && Boolean(url.searchParams.get("src"));
  } catch {
    return false;
  }
}

export function mapPinterestPin(value: unknown): PinterestPinCard | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length > 64) return null;
  const media = isRecord(value.media) ? value.media : {};
  const images = isRecord(media.images) ? media.images : {};
  const src =
    imageUrl(images.orig) ||
    imageUrl(images["1200x"]) ||
    imageUrl(images["600x"]) ||
    imageUrl(images["400x300"]) ||
    safeHttps(value.image_url);
  if (!src) return null;
  const thumb =
    imageUrl(images["400x300"]) || imageUrl(images["600x"]) || imageUrl(images["150x150"]) || src;
  const title =
    asTrimmed(value.title) || asTrimmed(value.alt_text) || asTrimmed(value.description) || "Pin";
  return {
    id: value.id,
    title: title.slice(0, 180),
    src,
    thumb,
    sourceUrl: safeHttps(value.link),
    boardId: typeof value.board_id === "string" ? value.board_id : undefined,
  };
}

export function mapPinterestBoard(value: unknown): PinterestBoardCard | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length > 64) return null;
  const name = asTrimmed(value.name);
  if (!name) return null;
  const media = isRecord(value.media) ? value.media : {};
  const thumbnails = Array.isArray(media.pin_thumbnail_urls) ? media.pin_thumbnail_urls : [];
  const cover =
    safeHttps(media.image_cover_url) ??
    (typeof thumbnails[0] === "string" ? safeHttps(thumbnails[0]) : undefined);
  return {
    id: value.id,
    name: name.slice(0, 180),
    coverSrc: cover,
    pinCount: typeof value.pin_count === "number" ? value.pin_count : undefined,
  };
}

export function isBoardId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function imageUrl(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return safeHttps(value.url);
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttps(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
