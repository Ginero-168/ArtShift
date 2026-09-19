import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_CSE_ENDPOINT } from "@/lib/server/stock/googleCse";
import { GET } from "../app/api/stock/route";

function request(url: string): NextRequest {
  return {
    url,
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("GET /api/stock Google CSE", () => {
  const originalKey = process.env.GOOGLE_CSE_API_KEY;
  const originalCx = process.env.GOOGLE_CSE_CX;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_CX;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_CSE_API_KEY;
    else process.env.GOOGLE_CSE_API_KEY = originalKey;
    if (originalCx === undefined) delete process.env.GOOGLE_CSE_CX;
    else process.env.GOOGLE_CSE_CX = originalCx;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fails closed with 500 when CSE keys are missing and does not call Google", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await GET(request("http://localhost/api/stock?source=google&query=Bangkok"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Server missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the official Custom Search JSON API with searchType=image", async () => {
    process.env.GOOGLE_CSE_API_KEY = "test-cse-key";
    process.env.GOOGLE_CSE_CX = "test-cx:engine";
    let requestedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({
          items: [
            {
              title: "Giant Swing",
              link: "https://example.com/swing.jpg",
              displayLink: "example.com",
              image: { contextLink: "https://example.com/swing" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const response = await GET(
      request("http://localhost/api/stock?source=google&query=Giant+Swing&per_page=1"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0].link).toBe("https://example.com/swing.jpg");

    const parsed = new URL(requestedUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(GOOGLE_CSE_ENDPOINT);
    expect(parsed.searchParams.get("searchType")).toBe("image");
    expect(parsed.searchParams.get("q")).toBe("Giant Swing");
    expect(parsed.searchParams.get("cx")).toBe("test-cx:engine");
    expect(requestedUrl).not.toContain("google.com/imghp");
    expect(requestedUrl).not.toContain("/api/ai/image");
  });
});
