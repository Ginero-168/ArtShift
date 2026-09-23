import { describe, expect, it } from "vitest";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { poseImageUploadFromDataUrl } from "@/lib/server/ai/poseSkeletonImage";

describe("Skeleton pose image upload", () => {
  it("names a PNG upload with a png extension and content type", () => {
    const upload = poseImageUploadFromDataUrl(
      dataUrl("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(upload.filename).toBe("pose.png");
    expect(upload.contentType).toBe("image/png");
  });

  it("trusts JPEG bytes when the data URL is labeled png", () => {
    const upload = poseImageUploadFromDataUrl(dataUrl("image/png", [0xff, 0xd8, 0xff, 0xe0]));
    expect(upload.filename).toBe("pose.jpg");
    expect(upload.contentType).toBe("image/jpeg");
  });

  it("names a WebP upload with a webp extension and content type", () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    const upload = poseImageUploadFromDataUrl(dataUrl("image/webp", bytes));
    expect(upload.filename).toBe("pose.webp");
    expect(upload.contentType).toBe("image/webp");
  });

  it("rejects bytes that are not an image before they are uploaded", () => {
    expect(() => poseImageUploadFromDataUrl("data:image/png;base64,AAAA")).toThrow(AiRuntimeError);
    expect(() => poseImageUploadFromDataUrl("data:image/png;base64,AAAA")).toThrow(
      /not a JPEG, PNG, or WebP/,
    );
  });
});

function dataUrl(mime: string, bytes: number[]): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
