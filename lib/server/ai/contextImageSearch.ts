import type { CreativeSearchResult } from "@/lib/ai/orchestration/creativeDirector";

type SearchEnvironment = Record<string, string | undefined>;
type SearchOptions = {
  environment?: SearchEnvironment;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function isImageSearchConfigured(environment: SearchEnvironment = process.env): boolean {
  return Boolean(environment.UNSPLASH_ACCESS_KEY || environment.PEXELS_API_KEY);
}

export async function searchImageReferences(
  rawQuery: string,
  requestedLimit = 3,
  options: SearchOptions = {},
): Promise<CreativeSearchResult[]> {
  const query = rawQuery.trim().slice(0, 300);
  if (!query) return [];
  const limit = Math.max(1, Math.min(6, Math.round(requestedLimit)));
  const environment = options.environment ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1_000, Math.min(15_000, Math.round(options.timeoutMs ?? 8_000)));
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  if (environment.UNSPLASH_ACCESS_KEY) {
    const response = await fetchImpl(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}`,
      {
        headers: {
          Authorization: `Client-ID ${environment.UNSPLASH_ACCESS_KEY}`,
          "Accept-Version": "v1",
        },
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
    return payload.results.slice(0, limit).flatMap(normalizeUnsplashResult);
  }

  if (environment.PEXELS_API_KEY) {
    const response = await fetchImpl(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}`,
      {
        headers: { Authorization: environment.PEXELS_API_KEY },
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.photos)) return [];
    return payload.photos.slice(0, limit).flatMap(normalizePexelsResult);
  }

  return [];
}

function normalizeUnsplashResult(value: unknown): CreativeSearchResult[] {
  if (!isRecord(value) || !isRecord(value.links) || !isRecord(value.urls)) return [];
  const title = pickTitle(value.alt_description, value.description, value.id);
  const pageUrl = safeHttpsUrl(value.links.html);
  const previewUrl = safeHttpsUrl(value.urls.small);
  if (!title || !pageUrl || !previewUrl) return [];
  return [{ title, source: "unsplash", pageUrl, previewUrl }];
}

function normalizePexelsResult(value: unknown): CreativeSearchResult[] {
  if (!isRecord(value) || !isRecord(value.src)) return [];
  const title = pickTitle(value.alt, value.id);
  const pageUrl = safeHttpsUrl(value.url);
  const previewUrl = safeHttpsUrl(value.src.medium);
  if (!title || !pageUrl || !previewUrl) return [];
  return [{ title, source: "pexels", pageUrl, previewUrl }];
}

function pickTitle(...values: unknown[]): string | null {
  const candidate = values.find(
    (value) =>
      (typeof value === "string" && value.trim().length > 0) ||
      (typeof value === "number" && Number.isFinite(value)),
  );
  if (candidate === undefined) return null;
  return String(candidate).trim().slice(0, 500);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
