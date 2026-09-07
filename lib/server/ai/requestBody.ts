import type { NextRequest } from "next/server";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!req.body) {
    if (typeof req.json === "function") return req.json();
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new RequestBodyTooLargeError();
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value ?? new Uint8Array();
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large");
        throw new RequestBodyTooLargeError();
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
