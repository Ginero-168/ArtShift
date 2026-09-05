import { describe, expect, it } from "vitest";
import {
  DEFAULT_VECTORIZE_BACKEND,
  VECTORIZE_BACKEND_OPTIONS,
} from "@/lib/vectorize/vectorizerBackend";

describe("vectorizer backend fallback", () => {
  it("does not expose a removed Custom fallback backend", () => {
    expect(DEFAULT_VECTORIZE_BACKEND).toBe("vtracer-wasm");
    expect(VECTORIZE_BACKEND_OPTIONS).toEqual([
      {
        value: "vtracer-wasm",
        label: "VTracer WASM",
        description: expect.any(String),
      },
    ]);
  });
});
