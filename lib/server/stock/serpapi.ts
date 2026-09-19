/** SerpAPI Google Images — third-party JSON API, not HTML scraping of google.com/imghp. */
export const SERPAPI_SEARCH_ENDPOINT = "https://serpapi.com/search.json";

export function resolveSerpapiKey(
  environment: Record<string, string | undefined> = process.env,
): string {
  return environment.SERPAPI_API_KEY?.trim() || environment.SERPAPI_KEY?.trim() || "";
}

export function buildSerpapiGoogleImagesUrl(options: { key: string; query: string }): string {
  const url = new URL(SERPAPI_SEARCH_ENDPOINT);
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", options.query);
  url.searchParams.set("tbs", "itp:photos");
  url.searchParams.set("safe", "active");
  url.searchParams.set("ijn", "0");
  url.searchParams.set("api_key", options.key);
  return url.toString();
}
