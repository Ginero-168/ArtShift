import { describe, expect, it } from "vitest";
import { isSupportedImageFile } from "@/lib/engine/imageCache";

describe("image input validation", () => {
  it("accepts the browser-safe raster formats used by linked and embedded assets", () => {
    expect(isSupportedImageFile({ name: "cover.png", type: "image/png", size: 1024 })).toBe(true);
    expect(isSupportedImageFile({ name: "cover.JPEG", type: "image/jpeg", size: 1024 })).toBe(true);
    expect(isSupportedImageFile({ name: "cover.webp", type: "image/webp", size: 1024 })).toBe(true);
  });

  it("rejects extension spoofing, unsupported decoders and oversized files", () => {
    expect(isSupportedImageFile({ name: "cover.png", type: "image/svg+xml", size: 1024 })).toBe(
      false,
    );
    expect(isSupportedImageFile({ name: "cover.avif", type: "image/avif", size: 1024 })).toBe(
      false,
    );
    expect(
      isSupportedImageFile({ name: "cover.jpg", type: "image/jpeg", size: 51 * 1024 * 1024 }),
    ).toBe(false);
  });
});
