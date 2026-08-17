import { describe, expect, it } from "vitest";
import { applyBrandKitToSlide } from "../lib/brand/applyBrandKit";
import { getActiveBrandKit, PRESET_BRAND_KITS, saveActiveBrandKit } from "../lib/brand/brandKit";
import { createRect, createText } from "../lib/engine/factory";
import type { EngineSlide, ImageElement, RectElement, TextElement } from "../lib/engine/types";

describe("Publisher Brand Kit", () => {
  it("loads and saves active brand kit with presets", () => {
    const defaultKit = getActiveBrandKit();
    expect(defaultKit.publisherName).toBeDefined();

    const techPreset = PRESET_BRAND_KITS.find((p) => p.id === "tech-business")!;
    saveActiveBrandKit(techPreset);
    expect(getActiveBrandKit().id).toBe("tech-business");
  });

  it("applies brand colors, typography, and logo watermark to slide", () => {
    const titleEl = createText({
      x: 100,
      y: 100,
      text: "Book Title",
      fontSize: 40,
      fontFamily: "sans-serif",
    });
    const btnEl = createRect({
      x: 100,
      y: 300,
      width: 200,
      height: 60,
    });
    btnEl.backgroundColor = "#ef4444";

    const testSlide: EngineSlide = {
      id: "slide-1",
      name: "Test Ad",
      width: 1080,
      height: 1080,
      background: "#ffffff",
      layers: [
        {
          id: "l1",
          name: "Layer 1",
          mode: "free",
          visible: true,
          locked: false,
          z: 0,
          objectIds: [titleEl.id, btnEl.id],
          placements: {},
        },
      ],
      elements: [titleEl, btnEl],
    };

    const techKit = PRESET_BRAND_KITS.find((p) => p.id === "tech-business")!;
    const updated = applyBrandKitToSlide(testSlide, techKit);

    // Verify slide background updated
    expect(updated.background).toBe(techKit.colors.background);

    // Verify header typography updated
    const title = updated.elements.find((e) => e.id === titleEl.id) as TextElement;
    expect(title.fontFamily).toBe(techKit.typography.headerFont);

    // Verify accent color applied to button
    const btn = updated.elements.find((e) => e.id === btnEl.id) as RectElement;
    expect(btn.backgroundColor).toBe(techKit.colors.accent);

    // Verify publisher logo watermark inserted
    const logoEl = updated.elements.find(
      (e) => (e as ImageElement).sourceName === "brand-publisher-logo",
    );
    expect(logoEl).toBeDefined();
  });
});
