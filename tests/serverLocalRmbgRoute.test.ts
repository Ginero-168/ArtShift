import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMock = vi.hoisted(() => ({
  executeServerRmbg: vi.fn(),
  getServerRmbgStatus: vi.fn(() => ({ state: "ready", model: "briaai/RMBG-1.4" })),
}));

vi.mock("@/lib/server/ai/serverLocalRmbg", () => serverMock);

import { GET, POST } from "../app/api/local-ai/rmbg/route";

const validImage = "data:image/png;base64,AAAA";

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength), ...headers }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

describe("server-local RMBG route", () => {
  beforeEach(() => {
    serverMock.executeServerRmbg.mockReset();
    serverMock.getServerRmbgStatus.mockReturnValue({ state: "ready", model: "briaai/RMBG-1.4" });
  });

  it("rejects requests without explicit server-fallback consent", async () => {
    const response = await POST(request({ image: validImage }));
    expect(response.status).toBe(400);
    expect(serverMock.executeServerRmbg).not.toHaveBeenCalled();
  });

  it("rejects non-image data URLs", async () => {
    const response = await POST(
      request({ image: "data:text/plain;base64,AAAA", allowServerFallback: true }),
    );
    expect(response.status).toBe(400);
    expect(serverMock.executeServerRmbg).not.toHaveBeenCalled();
  });

  it("executes the approved image and returns a no-store fallback result", async () => {
    const result = {
      dataUrl: "data:image/png;base64,SERVER_RESULT",
      width: 2,
      height: 2,
    };
    serverMock.executeServerRmbg.mockResolvedValue(result);

    const response = await POST(request({ image: validImage, allowServerFallback: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ result, runtime: "vps-fallback" });
    expect(serverMock.executeServerRmbg).toHaveBeenCalledWith(validImage, expect.any(AbortSignal), {
      blackPoint: undefined,
      whitePoint: undefined,
    });
  });

  it("rejects out-of-range matte tuning", async () => {
    const response = await POST(
      request({ image: validImage, allowServerFallback: true, blackPoint: 2 }),
    );
    expect(response.status).toBe(400);
    expect(serverMock.executeServerRmbg).not.toHaveBeenCalled();
  });

  it("exposes readiness without implying that a cold runtime is ready", async () => {
    serverMock.getServerRmbgStatus.mockReturnValue({ state: "loading", model: "briaai/RMBG-1.4" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runtime: "server-local-rmbg",
      state: "loading",
      model: "briaai/RMBG-1.4",
    });
  });
});
