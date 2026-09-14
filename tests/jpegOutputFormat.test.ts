import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertWebpToJpeg } from "@/lib/ai/imageGeneration";

describe("JPEG Output Format for AI Generated Images", () => {
  it("converts WebP data URL to JPEG data URL", async () => {
    const syntheticWebp = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const result = await convertWebpToJpeg(syntheticWebp);

    expect(result.startsWith("data:image/jpeg")).toBe(true);
  });

  it("leaves existing JPEG data URLs untouched", async () => {
    const syntheticJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const result = await convertWebpToJpeg(syntheticJpeg);

    expect(result).toBe(syntheticJpeg);
  });

  it("verifies replicateAdapter explicitly requests output_format: 'jpeg'", () => {
    const adapterSource = readFileSync("lib/server/ai/adapters/replicateAdapter.ts", "utf8");

    expect(adapterSource).toContain('output_format: "jpeg"');
    expect(adapterSource).toContain('Accept: "image/jpeg, image/png, image/webp"');
    expect(adapterSource).toContain('const mimeType = rawContentType || "image/jpeg";');
  });

  it("verifies auto-crop exports cropped images in image/jpeg format", () => {
    const autoCropSource = readFileSync("lib/ai/orchestration/imageAutoCrop.ts", "utf8");

    expect(autoCropSource).toContain('outCanvas.toDataURL("image/jpeg"');
  });

  it("verifies ChatThread displays JPEG format badge and removed bottom-right download button", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    expect(threadSource).toContain("JPEG format badge");
    expect(threadSource).not.toContain("Download JPEG button");
    expect(threadSource).not.toContain("<DownloadIcon");
  });
});
