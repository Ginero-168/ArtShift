import { describe, expect, it } from "vitest";
import { mapGoogleCseHit, STOCK_SEARCH_PATH, searchStockPhoto } from "@/lib/moodboard/stock";

const GOOGLE_ITEM = {
  title: "Giant Swing Bangkok",
  link: "https://example.com/swing.jpg",
  displayLink: "example.com",
  image: {
    contextLink: "https://example.com/swing",
    thumbnailLink: "https://example.com/swing-thumb.jpg",
  },
};

const UNSPLASH_BODY = {
  results: [
    {
      urls: { regular: "https://images.unsplash.com/photo-1" },
      user: { name: "A Photographer", links: { html: "https://unsplash.com/@a" } },
      links: { html: "https://unsplash.com/photos/1" },
    },
  ],
};

describe("stock search helper (not used by Moodboard Expand)", () => {
  it("maps official Google CSE image items to src/thumb/credit", () => {
    expect(mapGoogleCseHit({ items: [GOOGLE_ITEM] })).toEqual({
      src: "https://example.com/swing.jpg",
      thumb: "https://example.com/swing-thumb.jpg",
      credit: {
        photographer: "Giant Swing Bangkok",
        provider: "google",
        sourceUrl: "https://example.com/swing",
      },
    });
    expect(
      mapGoogleCseHit({ items: [{ title: "nope", link: "http://insecure.example/x.jpg" }] }),
    ).toBeNull();
    expect(mapGoogleCseHit({ items: [] })).toBeNull();
  });

  it("tries Google CSE first, then Unsplash", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("giant swing bangkok", async (url) => {
      urls.push(url);
      if (url.includes("source=google")) {
        return new Response(JSON.stringify({ items: [GOOGLE_ITEM] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    expect(urls[0]).toContain("source=google");
    expect(urls.some((url) => url.includes("source=serpapi"))).toBe(false);
    expect(hit?.credit.provider).toBe("google");
    expect(hit?.src).toBe("https://example.com/swing.jpg");
  });

  it("falls through to Unsplash when Google keys are missing (500)", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("bangkok tuk-tuk", async (url) => {
      urls.push(url);
      if (url.includes("source=google")) {
        return new Response(JSON.stringify({ error: "missing keys" }), { status: 500 });
      }
      return new Response(JSON.stringify(UNSPLASH_BODY), { status: 200 });
    });
    expect(urls[0]).toContain("source=google");
    expect(urls[1]).toContain("source=unsplash");
    expect(urls.every((url) => url.startsWith(STOCK_SEARCH_PATH))).toBe(true);
    expect(hit?.src).toContain("unsplash.com");
    expect(hit?.credit).toEqual({
      photographer: "A Photographer",
      provider: "unsplash",
      sourceUrl: "https://unsplash.com/photos/1",
    });
  });

  it("fails closed to null when every provider misses", async () => {
    const hit = await searchStockPhoto("nothing-here", async () => {
      return new Response(JSON.stringify({ items: [], results: [], photos: [] }), { status: 200 });
    });
    expect(hit).toBeNull();
  });
});
