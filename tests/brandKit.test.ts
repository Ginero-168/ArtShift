import { describe, expect, it } from "vitest";
import { getActiveBrandKit, PRESET_BRAND_KITS, saveActiveBrandKit } from "../lib/brand/brandKit";

describe("Publisher Brand Kit", () => {
  it("loads and saves active brand kit with presets", () => {
    const defaultKit = getActiveBrandKit();
    expect(defaultKit.publisherName).toBeDefined();

    const techPreset = PRESET_BRAND_KITS.find((p) => p.id === "tech-business")!;
    saveActiveBrandKit(techPreset);
    expect(getActiveBrandKit().id).toBe("tech-business");
  });
});
