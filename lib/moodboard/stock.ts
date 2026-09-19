import type { MoodboardCredit } from "@/lib/engine/types";

export type StockPhotoHit = {
  src: string;
  thumb?: string;
  credit: MoodboardCredit;
};

export const STOCK_SEARCH_PATH = "/api/stock";

export type StockFetcher = (url: string) => Promise<Response>;

export async function searchStockPhoto(
  query: string,
  fetchImpl: StockFetcher = fetch,
): Promise<StockPhotoHit | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const google = await searchGoogle(trimmed, fetchImpl);
  if (google) return google;
  const unsplash = await searchUnsplash(trimmed, fetchImpl);
  if (unsplash) return unsplash;
  return searchPexels(trimmed, fetchImpl);
}

async function searchGoogle(query: string, fetchImpl: StockFetcher): Promise<StockPhotoHit | null> {
  try {
    const response = await fetchImpl(
      `${STOCK_SEARCH_PATH}?source=google&query=${encodeURIComponent(query)}&per_page=1`,
    );
    if (!response.ok) return null;
    return mapGoogleCseHit(await response.json());
  } catch {
    return null;
  }
}

export function mapGoogleCseHit(data: unknown): StockPhotoHit | null {
  if (!isRecord(data) || !Array.isArray(data.items)) return null;
  for (const item of data.items) {
    const hit = mapGoogleCseItem(item);
    if (hit) return hit;
  }
  return null;
}

function mapGoogleCseItem(item: unknown): StockPhotoHit | null {
  if (!isRecord(item)) return null;
  const src = safeHttpsUrl(item.link);
  if (!src) return null;
  const image = isRecord(item.image) ? item.image : {};
  const title = asTrimmedString(item.title);
  const displayLink = asTrimmedString(item.displayLink);
  return {
    src,
    thumb: safeHttpsUrl(image.thumbnailLink) ?? undefined,
    credit: {
      photographer: title || displayLink || undefined,
      provider: "google",
      sourceUrl: safeHttpsUrl(image.contextLink) ?? httpsHost(displayLink),
    },
  };
}

async function searchUnsplash(
  query: string,
  fetchImpl: StockFetcher,
): Promise<StockPhotoHit | null> {
  try {
    const response = await fetchImpl(
      `${STOCK_SEARCH_PATH}?source=unsplash&query=${encodeURIComponent(query)}&per_page=1`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      results?: Array<{
        urls?: { regular?: string; small?: string; full?: string };
        user?: { name?: string; links?: { html?: string } };
        links?: { html?: string };
      }>;
    };
    const first = data.results?.[0];
    const src = first?.urls?.regular || first?.urls?.small || first?.urls?.full;
    if (!src) return null;
    return {
      src,
      thumb: first.urls?.small,
      credit: {
        photographer: first.user?.name,
        provider: "unsplash",
        sourceUrl: first.links?.html || first.user?.links?.html,
      },
    };
  } catch {
    return null;
  }
}

async function searchPexels(query: string, fetchImpl: StockFetcher): Promise<StockPhotoHit | null> {
  try {
    const response = await fetchImpl(
      `${STOCK_SEARCH_PATH}?source=pexels&query=${encodeURIComponent(query)}&per_page=10`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      photos?: Array<{
        src?: { large?: string; medium?: string; original?: string };
        photographer?: string;
        photographer_url?: string;
        url?: string;
      }>;
    };
    const first = data.photos?.[0];
    const src = first?.src?.large || first?.src?.medium || first?.src?.original;
    if (!src) return null;
    return {
      src,
      thumb: first.src?.medium,
      credit: {
        photographer: first.photographer,
        provider: "pexels",
        sourceUrl: first.url || first.photographer_url,
      },
    };
  } catch {
    return null;
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function httpsHost(displayLink: string): string | undefined {
  if (!displayLink) return undefined;
  try {
    return new URL(`https://${displayLink.replace(/^https?:\/\//i, "")}`).toString();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
