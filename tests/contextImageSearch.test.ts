import { describe, expect, it, vi } from "vitest";
import { isImageSearchConfigured, searchImageReferences } from "@/lib/server/ai/contextImageSearch";

describe("server image-reference search", () => {
  it("reports readiness from provider names without exposing their values", () => {
    expect(isImageSearchConfigured({})).toBe(false);
    expect(isImageSearchConfigured({ UNSPLASH_ACCESS_KEY: "configured" })).toBe(true);
    expect(isImageSearchConfigured({ PEXELS_API_KEY: "configured" })).toBe(true);
  });

  it("returns bounded Unsplash metadata without returning credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "photo-1",
              alt_description: "Amber serum bottle on limestone",
              links: { html: "https://unsplash.com/photos/photo-1" },
              urls: { small: "https://images.unsplash.com/photo-1?w=640" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchImageReferences("premium serum", 3, {
      environment: { UNSPLASH_ACCESS_KEY: "DO_NOT_RETURN" },
      fetchImpl,
    });

    expect(results).toEqual([
      {
        title: "Amber serum bottle on limestone",
        source: "unsplash",
        pageUrl: "https://unsplash.com/photos/photo-1",
        previewUrl: "https://images.unsplash.com/photo-1?w=640",
      },
    ]);
    expect(JSON.stringify(results)).not.toContain("DO_NOT_RETURN");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("api.unsplash.com/search/photos"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("uses Pexels when only that server credential is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          photos: [
            {
              id: 9,
              alt: "Editorial skincare product",
              url: "https://www.pexels.com/photo/9/",
              src: { medium: "https://images.pexels.com/photos/9/medium.jpeg" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchImageReferences("skincare", 2, {
      environment: { PEXELS_API_KEY: "DO_NOT_RETURN" },
      fetchImpl,
    });

    expect(results[0]).toMatchObject({ source: "pexels", title: "Editorial skincare product" });
  });

  it("stays local and returns no results when no search provider is configured", async () => {
    const fetchImpl = vi.fn();
    await expect(
      searchImageReferences("poster", 3, { environment: {}, fetchImpl }),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
