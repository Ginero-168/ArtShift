import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET as getBoardPins } from "../app/api/pinterest/boards/[boardId]/pins/route";
import { POST as disconnect } from "../app/api/pinterest/disconnect/route";
import { GET as getImage } from "../app/api/pinterest/image/route";
import { GET as startOAuth } from "../app/api/pinterest/oauth/start/route";
import { GET as getPins } from "../app/api/pinterest/pins/route";
import { GET as getStatus } from "../app/api/pinterest/status/route";

afterEach(() => {
  delete process.env.PINTEREST_CLIENT_ID;
  delete process.env.PINTEREST_CLIENT_SECRET;
  delete process.env.PINTEREST_APP_NAME;
  delete process.env.ARTSHIFT_PUBLIC_URL;
});

describe("Pinterest status and OAuth start", () => {
  it("reports OAuth as unconfigured and not connected by default", async () => {
    const response = await getStatus(statusRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      oauthConfigured?: boolean;
      connected?: boolean;
      username?: string | null;
      setup?: string;
    };
    expect(body).toMatchObject({
      oauthConfigured: false,
      connected: false,
      username: null,
    });
    expect(body.setup).toContain("PINTEREST_CLIENT_ID");
    expect(body.setup).toContain("https://artshift.io/api/pinterest/oauth/callback");
  });

  it("does not start OAuth when credentials are missing", async () => {
    const response = await startOAuth(startRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error?: string; oauthConfigured?: boolean };
    expect(body.oauthConfigured).toBe(false);
    expect(body.error).toContain("PINTEREST_CLIENT_ID");
    expect(body.error).toContain("PINTEREST_CLIENT_SECRET");
    expect(body.error).toContain("/api/pinterest/oauth/callback");
  });

  it("redirects Connect to real Pinterest OAuth when credentials exist", async () => {
    process.env.PINTEREST_CLIENT_ID = "1568346";
    process.env.PINTEREST_CLIENT_SECRET = "pinterest-secret";
    process.env.ARTSHIFT_PUBLIC_URL = "https://artshift.io";

    const response = await startOAuth(startRequest("/projects/abc/editor"));
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("client_id")).toBe("1568346");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://artshift.io/api/pinterest/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "user_accounts:read,boards:read,boards:read_secret,pins:read,pins:read_secret",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("refuses Pins, image proxy, and invalid boards without a Pinterest session", async () => {
    expect((await getPins(statusRequest())).status).toBe(401);
    expect((await getImage(imageRequest("https://i.pinimg.com/a.jpg"))).status).toBe(401);
    expect((await getImage(imageRequest("https://evil.example/a.jpg"))).status).toBe(401);
    const board = await getBoardPins(statusRequest(), {
      params: Promise.resolve({ boardId: "../etc" }),
    });
    expect(board.status).toBe(400);
    const cleared = await disconnect();
    expect(cleared.status).toBe(200);
    await expect(cleared.json()).resolves.toMatchObject({ connected: false });
  });
});

describe("Pinterest library interaction contract", () => {
  it("clicks a pin onto the canvas and drags it with the existing image drop MIME", () => {
    const panel = readFileSync("components/Builder/PinterestLibrary.tsx", "utf8");
    const drop = readFileSync("components/Canvas/usePasteDrop.ts", "utf8");
    expect(panel).toContain("placePinterestPinOnCanvas");
    expect(panel).toContain("application/x-artshift-image");
    expect(panel).toContain("text/uri-list");
    expect(panel).toMatch(/>\s*Pins\s*</);
    expect(panel).toMatch(/>\s*Boards\s*</);
    expect(panel).toContain("Disconnect");
    expect(panel).toContain("Connect Pinterest");
    expect(panel).not.toContain("Moodboard");
    expect(drop).toContain("loadDroppedImageSource");
    expect(drop).toContain('e.dataTransfer?.getData("application/x-artshift-image")');
    expect(drop).toContain("handleImageEntry");
  });
});

function statusRequest(): NextRequest {
  return {
    cookies: { get: () => undefined },
    signal: AbortSignal.timeout(1_000),
    nextUrl: new URL("http://localhost:3000/api/pinterest/status"),
  } as unknown as NextRequest;
}

function startRequest(returnTo?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/pinterest/oauth/start");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers({ host: "artshift.io" }),
    cookies: { get: () => undefined },
    signal: AbortSignal.timeout(1_000),
  } as unknown as NextRequest;
}

function imageRequest(src: string): NextRequest {
  const url = new URL("http://localhost:3000/api/pinterest/image");
  url.searchParams.set("src", src);
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: { get: () => undefined },
    signal: AbortSignal.timeout(1_000),
  } as unknown as NextRequest;
}
