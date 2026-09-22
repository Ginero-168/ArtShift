export type StockPhotoHit = {
  src: string;
  thumb?: string;
  credit?: {
    photographer?: string;
    provider?: "unsplash" | "pexels";
    sourceUrl?: string;
  };
};

export const STOCK_SEARCH_PATH = "/api/stock";

export type StockFetcher = (url: string) => Promise<Response>;

/** Keyword → Unsplash then Pexels (existing Moodboard stock path). */
export async function searchStockPhotos(
  query: string,
  count: number,
  fetchImpl: StockFetcher = fetch,
): Promise<StockPhotoHit[]> {
  const trimmed = query.trim();
  if (!trimmed || count < 1) return [];

  const unsplash = await searchUnsplash(trimmed, count, fetchImpl);
  if (unsplash.length >= count) return unsplash.slice(0, count);

  const pexels = await searchPexels(trimmed, Math.max(count, 10), fetchImpl);
  const merged = dedupeHits([...unsplash, ...pexels]);
  return merged.slice(0, count);
}

async function searchUnsplash(
  query: string,
  count: number,
  fetchImpl: StockFetcher,
): Promise<StockPhotoHit[]> {
  try {
    const response = await fetchImpl(
      `${STOCK_SEARCH_PATH}?source=unsplash&query=${encodeURIComponent(query)}&per_page=${Math.min(30, Math.max(1, count))}`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{
        urls?: { regular?: string; small?: string; full?: string; thumb?: string };
        user?: { name?: string; links?: { html?: string } };
        links?: { html?: string };
      }>;
    };
    const hits: StockPhotoHit[] = [];
    for (const item of data.results ?? []) {
      const src = item.urls?.regular || item.urls?.small || item.urls?.full;
      if (!src) continue;
      hits.push({
        src,
        thumb: item.urls?.thumb || item.urls?.small,
        credit: {
          photographer: item.user?.name,
          provider: "unsplash",
          sourceUrl: item.links?.html || item.user?.links?.html,
        },
      });
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchPexels(
  query: string,
  count: number,
  fetchImpl: StockFetcher,
): Promise<StockPhotoHit[]> {
  try {
    const response = await fetchImpl(
      `${STOCK_SEARCH_PATH}?source=pexels&query=${encodeURIComponent(query)}&per_page=${Math.min(30, Math.max(1, count))}`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      photos?: Array<{
        src?: { large?: string; medium?: string; original?: string };
        photographer?: string;
        photographer_url?: string;
        url?: string;
      }>;
    };
    const hits: StockPhotoHit[] = [];
    for (const item of data.photos ?? []) {
      const src = item.src?.large || item.src?.medium || item.src?.original;
      if (!src) continue;
      hits.push({
        src,
        thumb: item.src?.medium,
        credit: {
          photographer: item.photographer,
          provider: "pexels",
          sourceUrl: item.url || item.photographer_url,
        },
      });
    }
    return hits;
  } catch {
    return [];
  }
}

function dedupeHits(hits: StockPhotoHit[]): StockPhotoHit[] {
  const seen = new Set<string>();
  const result: StockPhotoHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.src)) continue;
    seen.add(hit.src);
    result.push(hit);
  }
  return result;
}
