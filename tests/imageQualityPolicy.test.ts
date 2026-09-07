import { describe, expect, it } from "vitest";
import { chooseImageQuality } from "@/lib/ai/orchestration/imageQualityPolicy";

describe("automatic image quality policy", () => {
  it("defaults ordinary complete work to medium", () => {
    expect(
      chooseImageQuality({ prompt: "a cat in a room", taskClass: "simple", hasReference: false }),
    ).toMatchObject({ quality: "medium" });
  });
  it("uses high for product/reference/text fidelity", () => {
    expect(
      chooseImageQuality({
        prompt: "product photo with exact Thai headline",
        taskClass: "complex",
        hasReference: true,
      }),
    ).toMatchObject({ quality: "high" });
  });
  it("never downgrades final or product work to low", () => {
    expect(
      chooseImageQuality({
        prompt: "quick draft product packaging for final print",
        taskClass: "complex",
        hasReference: false,
        finalUse: true,
      }),
    ).toMatchObject({ quality: "high" });
  });

  it("uses low only for an explicit draft request", () => {
    expect(
      chooseImageQuality({
        prompt: "quick draft sketch of a cat",
        taskClass: "simple",
        hasReference: false,
      }),
    ).toMatchObject({ quality: "low" });
  });
});
