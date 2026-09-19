/** Official Programmable Search JSON API — never scrape google.com/imghp. */
export const GOOGLE_CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export function buildGoogleCseImageSearchUrl(options: {
  key: string;
  cx: string;
  query: string;
  num?: number;
}): string {
  const num =
    typeof options.num === "number" && Number.isFinite(options.num)
      ? Math.min(10, Math.max(1, Math.round(options.num)))
      : 1;
  const url = new URL(GOOGLE_CSE_ENDPOINT);
  url.searchParams.set("key", options.key);
  url.searchParams.set("cx", options.cx);
  url.searchParams.set("q", options.query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", String(num));
  url.searchParams.set("safe", "active");
  return url.toString();
}
