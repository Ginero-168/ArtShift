import { describe, expect, it } from "vitest";
import { resolveChatImageSrc } from "@/lib/ai/orchestration/chatImageResolve";
import { loadDataURL } from "@/lib/engine/imageCache";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("resolveChatImageSrc", () => {
  it("keeps a live non-blob url", () => {
    expect(
      resolveChatImageSrc({
        url: "https://cdn.example/x.png",
        fileId: "file-1",
      }),
    ).toBe("https://cdn.example/x.png");
  });

  it("falls back to imageCache after history restore strips data urls", async () => {
    const cached = await loadDataURL(TINY_PNG, "gen-chat-1");
    expect(
      resolveChatImageSrc({
        url: "",
        fileId: "gen-chat-1",
      }),
    ).toBe(cached.dataURL);
  });

  it("ignores dead blob urls and resolves via fileId", async () => {
    const cached = await loadDataURL(TINY_PNG, "gen-chat-2");
    expect(
      resolveChatImageSrc({
        url: "blob:https://localhost/dead",
        fileId: "gen-chat-2",
      }),
    ).toBe(cached.dataURL);
  });
});
