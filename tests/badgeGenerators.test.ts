import { describe, expect, it } from "vitest";
import {
  createBookmarkRibbon,
  createPriceTagBadge,
  createRibbonBanner,
  createScallopedSeal,
  createStarburstBadge,
} from "../lib/engine/badgeGenerators";

describe("Parametric Badge & Ribbon Generators", () => {
  it("generates starburst badge with exact point count and closed path", () => {
    const starburst = createStarburstBadge({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      points: 16,
    });

    expect(starburst.type).toBe("path");
    expect(starburst.closed).toBe(true);
    expect(starburst.nodes.length).toBe(32); // 16 outer + 16 inner nodes
    expect(starburst.width).toBe(200);
    expect(starburst.height).toBe(200);
  });

  it("generates folded ribbon banner with notch coords", () => {
    const ribbon = createRibbonBanner({
      x: 50,
      y: 50,
      width: 300,
      height: 90,
      notchRatio: 0.15,
    });

    expect(ribbon.type).toBe("path");
    expect(ribbon.closed).toBe(true);
    expect(ribbon.nodes.length).toBe(6);
  });

  it("generates price tag badge with chamfered edge", () => {
    const tag = createPriceTagBadge({
      x: 20,
      y: 20,
      width: 150,
      height: 80,
    });

    expect(tag.type).toBe("path");
    expect(tag.closed).toBe(true);
    expect(tag.nodes.length).toBe(5);
  });

  it("generates scalloped award seal with smooth lobes", () => {
    const scallop = createScallopedSeal({
      x: 0,
      y: 0,
      width: 160,
      height: 160,
      lobes: 12,
    });

    expect(scallop.type).toBe("path");
    expect(scallop.closed).toBe(true);
    expect(scallop.nodes.length).toBe(12);
    // Verify each lobe has bezier tangent handles
    for (const node of scallop.nodes) {
      expect(node.in).toBeDefined();
      expect(node.out).toBeDefined();
    }
  });

  it("generates bookmark ribbon tag", () => {
    const bookmark = createBookmarkRibbon({
      x: 10,
      y: 10,
      width: 60,
      height: 120,
    });

    expect(bookmark.type).toBe("path");
    expect(bookmark.closed).toBe(true);
    expect(bookmark.nodes.length).toBe(5);
  });
});
