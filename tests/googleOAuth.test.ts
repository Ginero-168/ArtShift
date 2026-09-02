import type { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeGoogleState,
  createGoogleAuthorizationUrl,
  exchangeGoogleCode,
  GOOGLE_STATE_COOKIE,
  getGoogleAuthConfig,
  setGoogleStateCookie,
} from "@/lib/server/auth/google";

const config = {
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  publicUrl: "https://www.artshift.io",
  redirectUri: "https://www.artshift.io/api/auth/google/callback",
};

afterEach(() => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.ARTSHIFT_PUBLIC_URL;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Google OAuth", () => {
  it("creates a PKCE authorization URL without putting the client secret in it", () => {
    const flow = createGoogleAuthorizationUrl(config);
    const url = new URL(flow.url);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("client_secret")).toBeNull();
    expect(flow.state.length).toBeGreaterThanOrEqual(32);
    expect(flow.verifier.length).toBeGreaterThanOrEqual(32);
  });

  it("round-trips and consumes an encrypted state cookie only for the expected state", () => {
    const flow = createGoogleAuthorizationUrl(config);
    const set = vi.fn();
    setGoogleStateCookie(fakeResponse(set), flow.state, flow.verifier);
    const cookie = set.mock.calls[0]?.[0] as { name: string; value: string };

    expect(cookie.name).toBe(GOOGLE_STATE_COOKIE);
    expect(cookie.value).not.toContain(flow.state);
    expect(consumeGoogleState(fakeRequest(cookie.value), fakeResponse(vi.fn()), flow.state)).toBe(
      flow.verifier,
    );
    expect(
      consumeGoogleState(fakeRequest(cookie.value), fakeResponse(vi.fn()), "wrong-state"),
    ).toBeNull();
  });

  it("exchanges the code and accepts only a verified Google profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "temporary-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "google-user-sub",
            email: "user@example.com",
            email_verified: true,
            name: "Google User",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await exchangeGoogleCode(config, "authorization-code", "pkce-verifier");
    expect(profile).toEqual({
      sub: "google-user-sub",
      email: "user@example.com",
      emailVerified: true,
      name: "Google User",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("grant_type=authorization_code");
  });

  it("returns no Google configuration when production credentials are absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ARTSHIFT_PUBLIC_URL = "https://www.artshift.io";
    expect(getGoogleAuthConfig()).toBeNull();
  });
});

function fakeResponse(set: ReturnType<typeof vi.fn>): NextResponse {
  return { cookies: { set } } as unknown as NextResponse;
}

function fakeRequest(value: string): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === GOOGLE_STATE_COOKIE ? { name, value } : undefined),
    },
  } as unknown as NextRequest;
}
