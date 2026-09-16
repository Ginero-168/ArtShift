import { describe, expect, it } from "vitest";
import {
  aspectRatioFromDimensions,
  normalizeReplicateAspectRatio,
} from "@/lib/server/ai/replicateAspectRatio";

describe("normalizeReplicateAspectRatio", () => {
  it("passes custom WIDTHxHEIGHT through without collapsing to 16:9", () => {
    expect(normalizeReplicateAspectRatio("2048x688")).toBe("2048x688");
    expect(normalizeReplicateAspectRatio("2048x1024")).toBe("2048x1024");
    expect(normalizeReplicateAspectRatio("688x2048")).toBe("688x2048");
  });

  it("maps arbitrary A:B onto native panoramic pixels", () => {
    expect(normalizeReplicateAspectRatio("3:1")).toBe("2048x688");
    expect(normalizeReplicateAspectRatio("2:1")).toBe("2048x1024");
    expect(normalizeReplicateAspectRatio("1:3")).toBe("688x2048");
  });

  it("keeps standard named ratios", () => {
    expect(normalizeReplicateAspectRatio("16:9")).toBe("16:9");
    expect(normalizeReplicateAspectRatio("1:1")).toBe("1:1");
    expect(normalizeReplicateAspectRatio("9:16")).toBe("9:16");
  });
});

describe("aspectRatioFromDimensions", () => {
  it("emits custom pixel aspect for non-standard sizes", () => {
    expect(aspectRatioFromDimensions(2048, 688)).toBe("2048x688");
    expect(aspectRatioFromDimensions(2048, 1024)).toBe("2048x1024");
  });

  it("keeps 16:9 for true landscape video ratio", () => {
    expect(aspectRatioFromDimensions(1280, 720)).toBe("16:9");
  });
});
