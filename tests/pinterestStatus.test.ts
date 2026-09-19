import { afterEach, describe, expect, it } from "vitest";
import {
  connectPinterestSession,
  disconnectPinterestSession,
  readPinterestSession,
} from "@/lib/moodboard/pinterestSession";
import { GET as startOAuth } from "../app/api/pinterest/oauth/start/route";
import { GET as getStatus } from "../app/api/pinterest/status/route";

describe("Pinterest status and local session", () => {
  afterEach(() => {
    disconnectPinterestSession();
  });

  it("reports official saved-Pins as blocked and OAuth as unconfigured by default", async () => {
    const response = await getStatus();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      oauthConfigured: false,
      officialSavedPins: "blocked_pending_app_review",
      scrape: "not_supported",
    });
  });

  it("does not start OAuth when no client id is set", async () => {
    const response = await startOAuth();
    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.officialSavedPins).toBe("blocked_pending_app_review");
  });

  it("connects and disconnects a local session", () => {
    expect(readPinterestSession().connected).toBe(false);
    expect(connectPinterestSession("local").connected).toBe(true);
    expect(readPinterestSession().mode).toBe("local");
    expect(disconnectPinterestSession().connected).toBe(false);
  });
});
