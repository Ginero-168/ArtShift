import { describe, expect, it } from "vitest";
import { getVectorizeFallbackOptions } from "@/lib/vectorize/vectorizer";

describe("vectorizer backend fallback", () => {
  it("falls back from VTracer to Custom while preserving user settings", () => {
    const fallback = getVectorizeFallbackOptions({
      backend: "vtracer-wasm",
      preset: "illustration",
      colors: 12,
      detailLevel: 3,
    });

    expect(fallback).toMatchObject({
      backend: "custom",
      preset: "illustration",
      colors: 12,
      detailLevel: 3,
    });
  });

  it("leaves the existing Custom options unchanged", () => {
    const options = { backend: "custom" as const, preset: "clipart" as const };
    expect(getVectorizeFallbackOptions(options)).toBe(options);
    expect(getVectorizeFallbackOptions()).toBeUndefined();
  });
});
