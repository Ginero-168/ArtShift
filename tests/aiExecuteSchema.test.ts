import { describe, expect, it } from "vitest";
import { parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";

describe("public Recraft vectorize request schema", () => {
  it("accepts a PNG data URL for vectorize.recraft", () => {
    const request = parsePublicAiExecuteRequest({
      task: "vectorize.recraft",
      input: { image: { dataUrl: "data:image/png;base64,AAAA" }, width: 256, height: 256 },
      options: { provider: "replicate", cloudConsent: true, allowFallback: false },
    });

    expect(request).toMatchObject({
      task: "vectorize.recraft",
      input: {
        image: { dataUrl: "data:image/png;base64,AAAA" },
        width: 256,
        height: 256,
      },
    });
  });

  it("rejects a Recraft request with unsupported image data", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "vectorize.recraft",
        input: { image: { dataUrl: "data:image/svg+xml;base64,AAAA" } },
        options: { provider: "replicate", cloudConsent: true },
      }),
    ).toBeNull();
  });

  it("rejects Recraft dimensions outside the model limits", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "vectorize.recraft",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" }, width: 128, height: 128 },
        options: { provider: "replicate", cloudConsent: true },
      }),
    ).toBeNull();
  });

  it("rejects Recraft images above the 16 megapixel budget", () => {
    expect(
      parsePublicAiExecuteRequest({
        task: "vectorize.recraft",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" }, width: 4096, height: 4096 },
        options: { provider: "replicate", cloudConsent: true },
      }),
    ).toBeNull();
  });
});
