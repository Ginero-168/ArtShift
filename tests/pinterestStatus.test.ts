import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET as startOAuth } from "../app/api/pinterest/oauth/start/route";
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
    await expect(response.json()).resolves.toMatchObject({
      oauthConfigured: false,
      connected: false,
      officialSavedPins: "oauth_when_configured",
      userPaste: "fallback",
      scrape: "not_supported",
    });
  });

  it("does not start OAuth when credentials are missing", async () => {
    const response = await startOAuth(startRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error?: string; officialSavedPins?: string };
    expect(body.officialSavedPins).toBe("oauth_when_configured");
    expect(body.error).toContain("PINTEREST_CLIENT_ID");
    expect(body.error).toContain("PINTEREST_CLIENT_SECRET");
    expect(body.error).toContain("/api/pinterest/oauth/callback");
  });

  it("redirects Connect to real Pinterest OAuth when credentials exist", async () => {
    process.env.PINTEREST_CLIENT_ID = "1568346";
    process.env.PINTEREST_CLIENT_SECRET = "pinterest-secret";
    process.env.ARTSHIFT_PUBLIC_URL = "https://www.artshift.io";

    const response = await startOAuth(startRequest("/projects/abc/editor"));
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("client_id")).toBe("1568346");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.artshift.io/api/pinterest/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "user_accounts:read,boards:read,boards:read_secret,pins:read,pins:read_secret",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

function statusRequest(): NextRequest {
  return {
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

function startRequest(returnTo?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/pinterest/oauth/start");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}
