import { describe, expect, it } from "vitest";
import { createGroundingDinoTextQuery } from "@/lib/vision/advancedVision";

describe("advanced vision input contracts", () => {
  it("uses one text query for a single Grounding DINO image", () => {
    expect(createGroundingDinoTextQuery(["bag", "shirt", "bag"])).toBe("bag. shirt.");
  });
});
