import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Transformer Bounding Box UI (Adobe Illustrator style)", () => {
  const source = readFileSync("components/Canvas/Transformer.tsx", "utf8");

  it("uses compact handle size of 6px", () => {
    expect(source).toContain("const HANDLE = 6;");
  });

  it("does not render a dangling top stem handle (removed ROTATE_OFFSET and stem line)", () => {
    expect(source).not.toContain("const ROTATE_OFFSET");
    expect(source).not.toContain("Stem line connecting top-center handle to rotate handle");
  });

  it("implements corner rotation zones at all 4 corners (rot-nw, rot-ne, rot-se, rot-sw)", () => {
    expect(source).toContain('"rot-nw"');
    expect(source).toContain('"rot-ne"');
    expect(source).toContain('"rot-se"');
    expect(source).toContain('"rot-sw"');
    expect(source).toContain("isRotateHandle");
  });

  it("provides custom curved rotate cursor for corner rotation", () => {
    expect(source).toContain("getRotateCursor");
    expect(source).toContain("data:image/svg+xml");
  });

  it("uses crisp square handles with rx={0}", () => {
    expect(source).toContain("rx={0}");
    expect(source).toContain('shapeRendering="crispEdges"');
  });

  it("uses a solid 1px bounding box polygon without dashed stroke", () => {
    const polygonMatch = source.match(/<polygon\s+points=\{outlineCorners[\s\S]*?\/>/);
    expect(polygonMatch).toBeDefined();
    expect(polygonMatch![0]).toContain("strokeWidth={1}");
    expect(polygonMatch![0]).not.toContain("strokeDasharray");
    expect(polygonMatch![0]).toContain('vectorEffect="non-scaling-stroke"');
  });

  it("draws line and arrow selection guides as solid strokes", () => {
    expect(source).not.toContain("strokeDasharray");
  });

  it("includes an invisible touch area for effortless grabbing", () => {
    expect(source).toContain('fill="transparent"');
  });
});
