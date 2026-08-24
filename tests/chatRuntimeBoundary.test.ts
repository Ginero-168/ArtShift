import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat provider boundary", () => {
  it("keeps provider SDKs out of the chat route", () => {
    const source = readFileSync("app/api/chat/route.ts", "utf8");
    expect(source).not.toContain("@anthropic-ai/sdk");
    expect(source).not.toContain("new Anthropic");
    expect(source).toContain('ai.execute(\n          "assistant.chat"');
  });

  it("keeps direct image-provider URLs out of browser code", () => {
    const source = readFileSync("lib/ai/pollinations.ts", "utf8");
    expect(source).not.toContain("image.pollinations.ai");
    expect(source).not.toContain("gen.pollinations.ai");
    expect(source).toContain('fetch("/api/ai/image"');
  });
});
