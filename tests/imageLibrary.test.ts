import { describe, expect, it } from "vitest";
import { searchImages } from "@/lib/imageLibrary";

describe("searchImages", () => {
  it("returns 3 urls for a Thai keyword", () => {
    const urls = searchImages("วัฒนธรรมไทย", 3);
    expect(urls).toHaveLength(3);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
    }
  });

  it("matches English keywords too", () => {
    const urls = searchImages("thai temple", 3);
    expect(urls.length).toBeGreaterThan(0);
  });

  it("returns abstract fallback for a totally unknown query", () => {
    const urls = searchImages("qwertyzxcvasdf-nonsense", 2);
    expect(urls).toHaveLength(2);
  });

  it("never returns duplicate urls", () => {
    const urls = searchImages("thailand", 3);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("respects the limit", () => {
    expect(searchImages("coffee", 1)).toHaveLength(1);
    expect(searchImages("coffee", 5).length).toBeLessThanOrEqual(5);
  });
});
