import { describe, expect, it } from "vitest";
import { alignElements, distributeElements, getElementsBoundingBox } from "../lib/engine/align";
import { createRect } from "../lib/engine/factory";

describe("Align & Distribute Engine", () => {
  const el1 = createRect({ x: 100, y: 50, width: 200, height: 100 });
  const el2 = createRect({ x: 400, y: 150, width: 100, height: 80 });
  const el3 = createRect({ x: 700, y: 250, width: 150, height: 120 });

  it("calculates overall bounding box correctly", () => {
    const bbox = getElementsBoundingBox([el1, el2, el3]);
    expect(bbox.minX).toBe(100);
    expect(bbox.minY).toBe(50);
    expect(bbox.maxX).toBe(850); // 700 + 150
    expect(bbox.maxY).toBe(370); // 250 + 120
    expect(bbox.width).toBe(750);
    expect(bbox.height).toBe(320);
    expect(bbox.centerX).toBe(475);
    expect(bbox.centerY).toBe(210);
  });

  it("aligns elements to left", () => {
    const patches = alignElements([el1, el2, el3], "left");
    expect(patches[0].patch.x).toBe(100);
    expect(patches[1].patch.x).toBe(100);
    expect(patches[2].patch.x).toBe(100);
  });

  it("aligns elements to horizontal center", () => {
    const patches = alignElements([el1, el2, el3], "center");
    // CenterX is 475.
    // el1 width 200 -> 475 - 100 = 375
    // el2 width 100 -> 475 - 50 = 425
    // el3 width 150 -> 475 - 75 = 400
    expect(patches[0].patch.x).toBe(375);
    expect(patches[1].patch.x).toBe(425);
    expect(patches[2].patch.x).toBe(400);
  });

  it("aligns elements to right", () => {
    const patches = alignElements([el1, el2, el3], "right");
    // MaxX is 850
    expect(patches[0].patch.x).toBe(650); // 850 - 200
    expect(patches[1].patch.x).toBe(750); // 850 - 100
    expect(patches[2].patch.x).toBe(700); // 850 - 150
  });

  it("aligns elements to top, middle, and bottom", () => {
    const topPatches = alignElements([el1, el2, el3], "top");
    expect(topPatches[0].patch.y).toBe(50);
    expect(topPatches[1].patch.y).toBe(50);
    expect(topPatches[2].patch.y).toBe(50);

    const bottomPatches = alignElements([el1, el2, el3], "bottom");
    // MaxY is 370
    expect(bottomPatches[0].patch.y).toBe(270); // 370 - 100
    expect(bottomPatches[1].patch.y).toBe(290); // 370 - 80
    expect(bottomPatches[2].patch.y).toBe(250); // 370 - 120
  });

  it("distributes elements horizontally with equal gaps", () => {
    const a = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const b = createRect({ x: 200, y: 0, width: 100, height: 100 });
    const c = createRect({ x: 600, y: 0, width: 100, height: 100 });

    // Total span: 0 to 700 = 700px.
    // Total object width: 300px.
    // Available gap space: 400px / 2 = 200px gap.
    // Target positions: a: 0, b: 0 + 100 + 200 = 300, c: 600.
    const patches = distributeElements([a, b, c], "horizontal");
    expect(patches.length).toBe(1); // middle element updated
    expect(patches[0].patch.x).toBe(300);
  });

  it("distributes elements vertically with equal gaps", () => {
    const a = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const b = createRect({ x: 0, y: 150, width: 100, height: 100 });
    const c = createRect({ x: 0, y: 500, width: 100, height: 100 });

    // Total span: 0 to 600 = 600px.
    // Total object height: 300px.
    // Available gap space: 300px / 2 = 150px gap.
    // Target positions: a: 0, b: 0 + 100 + 150 = 250, c: 500.
    const patches = distributeElements([a, b, c], "vertical");
    expect(patches.length).toBe(1);
    expect(patches[0].patch.y).toBe(250);
  });
});
