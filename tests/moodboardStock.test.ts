import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mapGoogleCseHit,
  mapSerpapiHit,
  STOCK_SEARCH_PATH,
  searchStockPhoto,
} from "@/lib/moodboard/stock";

const SERPAPI_FIXTURE = JSON.parse(
  readFileSync("tests/fixtures/serpapiGoogleImages.json", "utf8"),
) as unknown;

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
  it("maps a SerpAPI google_images fixture to src/thumb/credit", () => {
    expect(mapSerpapiHit(SERPAPI_FIXTURE)).toEqual({
      src: "https://example.com/photos/giant-swing.jpg",
      thumb: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9-thumb",
      credit: {
        photographer: "Giant Swing in Bangkok",
        provider: "serpapi",
        sourceUrl: "https://example.com/giant-swing-bangkok",
      },
    });
    expect(mapSerpapiHit({ images_results: [] })).toBeNull();
    expect(
      mapSerpapiHit({
        images_results: [{ title: "nope", original: "http://insecure.example/x.jpg" }],
      }),
    ).toBeNull();
  });

  it("uses SerpAPI first when Google Images results are present", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("giant swing bangkok", async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(SERPAPI_FIXTURE), { status: 200 });
    });
    expect(hit?.src).toBe("https://example.com/photos/giant-swing.jpg");
    expect(hit?.credit.provider).toBe("serpapi");
    expect(urls).toEqual([
      `${STOCK_SEARCH_PATH}?source=serpapi&query=${encodeURIComponent("giant swing bangkok")}&per_page=1`,
    ]);
    expect(urls.every((url) => url.startsWith(STOCK_SEARCH_PATH))).toBe(true);
    expect(urls.some((url) => url.includes("/api/ai/image"))).toBe(false);
  });

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

  it("falls through SerpAPI miss to Google CSE", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("giant swing bangkok", async (url) => {
      urls.push(url);
      if (url.includes("source=serpapi")) {
        return new Response(JSON.stringify({ error: "Server missing SERPAPI_API_KEY" }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify({ items: [GOOGLE_ITEM] }), { status: 200 });
    });
    expect(urls[0]).toContain("source=serpapi");
    expect(urls[1]).toContain("source=google");
    expect(hit?.credit.provider).toBe("google");
    expect(hit?.src).toBe("https://example.com/swing.jpg");
  });

  it("falls through to Unsplash when SerpAPI and Google keys are missing (500)", async () => {
    const urls: string[] = [];
    const hit = await searchStockPhoto("bangkok tuk-tuk", async (url) => {
      urls.push(url);
      if (url.includes("source=serpapi") || url.includes("source=google")) {
        return new Response(JSON.stringify({ error: "missing keys" }), { status: 500 });
      }
      return new Response(JSON.stringify(UNSPLASH_BODY), { status: 200 });
    });
    expect(urls[0]).toContain("source=serpapi");
    expect(urls[1]).toContain("source=google");
    expect(urls[2]).toContain("source=unsplash");
    expect(hit?.src).toContain("unsplash.com");
    expect(hit?.credit).toEqual({
      photographer: "A Photographer",
      provider: "unsplash",
      sourceUrl: "https://unsplash.com/photos/1",
    });
  });

  it("fails closed to null when every provider misses", async () => {
    const hit = await searchStockPhoto("nothing-here", async () => {
      return new Response(
        JSON.stringify({ images_results: [], items: [], results: [], photos: [] }),
        {
          status: 200,
        },
      );
    });
    expect(hit).toBeNull();
  });
});
