import { describe, expect, it } from "vitest";
import { STOCK_SEARCH_PATH, searchStockPhoto } from "@/lib/moodboard/stock";

describe("moodboard stock fill", () => {
  it("reads Unsplash credits and only calls /api/stock", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("bangkok tuk-tuk", async (url) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          results: [
            {
              urls: { regular: "https://images.unsplash.com/photo-1" },
              user: { name: "A Photographer", links: { html: "https://unsplash.com/@a" } },
              links: { html: "https://unsplash.com/photos/1" },
            },
          ],
        }),
        { status: 200 },
      );
    });
    expect(hit?.src).toContain("unsplash.com");
    expect(hit?.credit).toEqual({
      photographer: "A Photographer",
      provider: "unsplash",
      sourceUrl: "https://unsplash.com/photos/1",
    });
    expect(urls.every((url) => url.startsWith(STOCK_SEARCH_PATH))).toBe(true);
    expect(urls.some((url) => url.includes("/api/ai/image"))).toBe(false);
  });

  it("fails closed to null when both providers miss", async () => {
    const hit = await searchStockPhoto("nothing-here", async () => {
      return new Response(JSON.stringify({ results: [], photos: [] }), { status: 200 });
    });
    expect(hit).toBeNull();
  });
});
