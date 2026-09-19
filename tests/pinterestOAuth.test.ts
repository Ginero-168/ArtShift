import type { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapPinterestBoard,
  mapPinterestPin,
  PINTEREST_OAUTH_SCOPES,
} from "@/lib/moodboard/pinterest";
import {
  consumePinterestState,
  createPinterestAuthorizationUrl,
  exchangePinterestCode,
  getPinterestAuthConfig,
  PINTEREST_STATE_COOKIE,
  setPinterestStateCookie,
} from "@/lib/server/pinterest/oauth";
import {
  PINTEREST_SESSION_COOKIE,
  readPinterestSessionCookie,
  setPinterestSessionCookie,
} from "@/lib/server/pinterest/session";

const config = {
  clientId: "1568346",
  clientSecret: "pinterest-secret",
  publicUrl: "https://www.artshift.io",
  redirectUri: "https://www.artshift.io/api/pinterest/oauth/callback",
  appName: "ArtShift",
};

afterEach(() => {
  delete process.env.PINTEREST_CLIENT_ID;
  delete process.env.PINTEREST_CLIENT_SECRET;
  delete process.env.ARTSHIFT_PUBLIC_URL;
  vi.unstubAllGlobals();
});

describe("Pinterest OAuth helpers", () => {
  it("creates an authorize URL with Lovart-style read scopes", () => {
    const flow = createPinterestAuthorizationUrl(config, "/projects/demo/editor");
    const url = new URL(flow.url);
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...PINTEREST_OAUTH_SCOPES]);
    expect(flow.returnTo).toBe("/projects/demo/editor");
    expect(flow.state.length).toBeGreaterThanOrEqual(32);
  });

  it("round-trips the encrypted OAuth state cookie", () => {
    const flow = createPinterestAuthorizationUrl(config, "/projects/x/editor");
    const set = vi.fn();
    setPinterestStateCookie(fakeResponse(set), flow.state, flow.returnTo);
    const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };
    expect(cookie.name).toBe(PINTEREST_STATE_COOKIE);
    expect(cookie.value).not.toContain(flow.state);
    expect(
      consumePinterestState(fakeRequest(cookie.value), fakeResponse(vi.fn()), flow.state),
    ).toBe("/projects/x/editor");
    expect(
      consumePinterestState(fakeRequest(cookie.value), fakeResponse(vi.fn()), "wrong-state"),
    ).toBeNull();
  });

  it("exchanges an authorization code with Basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "pin-access",
          refresh_token: "pin-refresh",
          expires_in: 2592000,
          scope: "user_accounts:read",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tokens = await exchangePinterestCode(config, "authorization-code");
    expect(tokens.accessToken).toBe("pin-access");
    expect(tokens.refreshToken).toBe("pin-refresh");
    expect(String(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization ?? "")).toMatch(/^Basic /);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("grant_type=authorization_code");
  });

  it("round-trips the encrypted Pinterest session cookie", () => {
    const set = vi.fn();
    setPinterestSessionCookie(
      fakeResponse(set),
      { accessToken: "pin-access", refreshToken: "pin-refresh", expiresAt: Date.now() + 60_000 },
      "peerawat",
    );
    const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };
    expect(cookie.name).toBe(PINTEREST_SESSION_COOKIE);
    expect(cookie.value).not.toContain("pin-access");
    const session = readPinterestSessionCookie(sessionRequest(cookie.value));
    expect(session?.accessToken).toBe("pin-access");
    expect(session?.username).toBe("peerawat");
  });

  it("returns no Pinterest configuration when credentials are absent", () => {
    expect(getPinterestAuthConfig()).toBeNull();
  });
});

describe("Pinterest pin and board mappers", () => {
  it("maps a v5 pin image and board cover", () => {
    expect(
      mapPinterestPin({
        id: "pin-1",
        title: "Prompt capsule",
        link: "https://www.pinterest.com/pin/1",
        media: { images: { "600x": { url: "https://i.pinimg.com/600x/a.jpg" } } },
      }),
    ).toEqual({
      id: "pin-1",
      title: "Prompt capsule",
      src: "https://i.pinimg.com/600x/a.jpg",
      sourceUrl: "https://www.pinterest.com/pin/1",
      boardId: undefined,
    });
    expect(
      mapPinterestBoard({
        id: "board-1",
        name: "Refs",
        pin_count: 12,
        media: { image_cover_url: "https://i.pinimg.com/cover.jpg" },
      }),
    ).toEqual({
      id: "board-1",
      name: "Refs",
      coverSrc: "https://i.pinimg.com/cover.jpg",
      pinCount: 12,
    });
    expect(mapPinterestPin({ id: "no-image" })).toBeNull();
  });
});

function fakeResponse(set: ReturnType<typeof vi.fn>): NextResponse {
  return { cookies: { set } } as unknown as NextResponse;
}

function fakeRequest(value: string): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === PINTEREST_STATE_COOKIE ? { name, value } : undefined),
    },
  } as unknown as NextRequest;
}

function sessionRequest(value: string): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === PINTEREST_SESSION_COOKIE ? { name, value } : undefined),
    },
  } as unknown as NextRequest;
}
