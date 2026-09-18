import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOK_COVER_DATA_URL } from "../lib/campaign/generator";
import {
  CATALOG_WEBHOOK_MAX_BODY_BYTES,
  CATALOG_WEBHOOK_SECRET_HEADER,
  POST,
} from "../app/api/catalog/webhook/route";

const SECRET = "catalog-test-secret";

function request(
  body: unknown,
  options?: { secret?: string | null; contentLength?: number },
): NextRequest {
  const encoded = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers();
  if (options?.contentLength !== undefined) {
    headers.set("content-length", String(options.contentLength));
  }
  if (options?.secret) headers.set(CATALOG_WEBHOOK_SECRET_HEADER, options.secret);
  return {
    headers,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    arrayBuffer: async () => new TextEncoder().encode(encoded).buffer,
  } as unknown as NextRequest;
}

describe("Catalog Ingestion Webhook API", () => {
  beforeEach(() => {
    process.env.CATALOG_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CATALOG_WEBHOOK_SECRET;
  });

  it("disables the route when no shared secret is configured", async () => {
    delete process.env.CATALOG_WEBHOOK_SECRET;
    const res = await POST(request({ books: [{ title: "X" }] }, { secret: SECRET }));
    expect(res.status).toBe(503);
  });

  it("rejects requests without a valid shared secret", async () => {
    const res = await POST(request({ books: [{ title: "X" }] }));
    expect(res.status).toBe(401);
  });

  it("rejects oversized payloads before parsing books", async () => {
    const res = await POST(
      request({ books: [{ title: "X" }] }, { secret: SECRET, contentLength: CATALOG_WEBHOOK_MAX_BODY_BYTES + 1 }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects request with missing or empty books array", async () => {
    const res = await POST(request({ books: [] }, { secret: SECRET }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("books");
  });

  it("processes valid book records and generates multi-channel creatives with preflight report", async () => {
    const res = await POST(
      request(
        {
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
        },
        { secret: SECRET },
      ),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalBooks).toBe(1);
    expect(data.summary.totalChannels).toBe(2);
    expect(data.summary.totalCreatives).toBe(2);
    expect(data.preflight).toBeDefined();
    expect(data.creatives.length).toBe(2);
    expect(data.creatives[0].slideId).toBeDefined();
    expect(data.creatives[0].elements).toBeUndefined();
  });
});
