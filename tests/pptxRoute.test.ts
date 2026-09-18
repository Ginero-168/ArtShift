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

  it("exports frames from rasterizedImages instead of dropping them", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const { createEmptyEngineDoc } = await import("@/lib/engine/store");
    const { createFrame, createText } = await import("@/lib/engine/factory");
    const doc = createEmptyEngineDoc("Frames");
    const frame = createFrame({ x: 40, y: 40, width: 400, height: 240, name: "Hero" });
    const child = createText({ x: 80, y: 80, text: "Clipped", width: 200 });
    frame.childIds = [child.id];
    doc.slides[0].elements = [frame, child];
    doc.slides[0].layers[0].objectIds = [frame.id, child.id];

    const response = await POST(
      request(JSON.stringify({ doc, rasterizedImages: { [frame.id]: png } })),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
