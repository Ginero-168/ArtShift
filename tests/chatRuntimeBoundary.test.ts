import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as legacyChatPost } from "../app/api/chat/route";

describe("chat provider boundary", () => {
  it("retires the legacy mutation chat route in favor of the unified flow", async () => {
    const response = await legacyChatPost(
      new Request("http://localhost/api/chat", { method: "POST" }) as unknown as NextRequest,
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "LEGACY_CHAT_REMOVED" });
  });

  it("keeps direct image-provider URLs out of browser code", () => {
    const source = readFileSync("lib/ai/pollinations.ts", "utf8");
    expect(source).not.toContain("image.pollinations.ai");
    expect(source).not.toContain("gen.pollinations.ai");
    expect(source).toContain('fetch("/api/ai/image"');
  });
});
