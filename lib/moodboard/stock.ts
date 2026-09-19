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

  const unsplash = await searchUnsplash(trimmed, fetchImpl);
  if (unsplash) return unsplash;
  return searchPexels(trimmed, fetchImpl);
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
