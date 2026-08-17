import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "../app/api/catalog/webhook/route";
import { DEFAULT_BOOK_COVER_DATA_URL } from "../lib/campaign/generator";

describe("Catalog Ingestion Webhook API", () => {
  it("rejects request with missing or empty books array", async () => {
    const req = {
      json: async () => ({ books: [] }),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("books");
  });

  it("processes valid book records and generates multi-channel creatives with preflight report", async () => {
    const req = {
      json: async () => ({
        books: [
          {
            isbn: "978-616-99999-0-1",
            title: "The Art of Thinking Clearly",
            author: "Rolf Dobelli",
            listPrice: "350",
            salePrice: "295",
            coverUrl: DEFAULT_BOOK_COVER_DATA_URL,
            ctaText: "ซื้อเลยวันนี้",
          },
        ],
        templateId: "launch-hero",
        channels: ["feed-square", "story-vertical"],
      }),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalBooks).toBe(1);
    expect(data.summary.totalChannels).toBe(2);
    expect(data.summary.totalCreatives).toBe(2); // 1 book x 2 channels
    expect(data.preflight).toBeDefined();
    expect(data.creatives.length).toBe(2);
  });
});
