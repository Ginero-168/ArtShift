import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/export/pptx/route";
import { PPTX_EXPORT_LIMITS } from "@/lib/engine/pptxPayload";

function request(body: string, contentLength = new TextEncoder().encode(body).byteLength) {
  const encoded = new TextEncoder().encode(body);
  return {
    headers: new Headers({ "content-length": String(contentLength) }),
    arrayBuffer: async () => encoded.buffer,
  } as unknown as NextRequest;
}

describe("PPTX export route boundary", () => {
  it("rejects a declared body over the export budget", async () => {
    const response = await POST(request("{}", PPTX_EXPORT_LIMITS.bodyBytes + 1));

    expect(response.status).toBe(413);
  });

  it("rejects malformed JSON before invoking the exporter", async () => {
    const response = await POST(request("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid JSON payload" });
  });

  it("rejects unsupported data URLs at the route boundary", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          doc: {
            id: "doc-1",
            title: "Test",
            width: 1920,
            height: 1080,
            updatedAt: Date.now(),
            schemaVersion: 5,
            slides: [
              {
                id: "slide-1",
                name: "Slide 1",
                background: "#fff",
                width: 1920,
                height: 1080,
                elements: [],
                layers: [],
              },
            ],
          },
          rasterizedImages: { "image-1": "data:image/svg+xml;base64,AAAA" },
        }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
