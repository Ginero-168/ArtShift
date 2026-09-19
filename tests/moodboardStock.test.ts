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

describe("moodboard stock fill", () => {
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

  it("uses Google CSE first when the official API returns an image", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("giant swing bangkok", async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [GOOGLE_ITEM] }), { status: 200 });
    });
    expect(hit?.src).toBe("https://example.com/swing.jpg");
    expect(hit?.credit.provider).toBe("google");
    expect(urls).toEqual([
      `${STOCK_SEARCH_PATH}?source=google&query=${encodeURIComponent("giant swing bangkok")}&per_page=1`,
    ]);
    expect(urls.every((url) => url.startsWith(STOCK_SEARCH_PATH))).toBe(true);
    expect(urls.some((url) => url.includes("/api/ai/image"))).toBe(false);
  });

  it("falls through to Unsplash when Google keys are missing (500)", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("bangkok tuk-tuk", async (url) => {
      urls.push(url);
      if (url.includes("source=google")) {
        return new Response(
          JSON.stringify({ error: "Server missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX" }),
          { status: 500 },
        );
      }
      return new Response(JSON.stringify(UNSPLASH_BODY), { status: 200 });
    });
    expect(urls[0]).toContain("source=google");
    expect(urls[1]).toContain("source=unsplash");
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
