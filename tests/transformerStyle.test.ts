import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Transformer Bounding Box UI (Adobe Illustrator style)", () => {
  const source = readFileSync("components/Canvas/Transformer.tsx", "utf8");

  it("uses compact handle size of 6px", () => {
    expect(source).toContain("const HANDLE = 6;");
  });

  it("uses compact rotate offset of 16px", () => {
    expect(source).toContain("const ROTATE_OFFSET = 16;");
  });

  it("uses crisp square handles with rx={0}", () => {
    expect(source).toContain("rx={0}");
    expect(source).toContain('shapeRendering="crispEdges"');
  });

  it("uses a solid 1px bounding box polygon without dashed stroke", () => {
    // The polygon element should not have strokeDasharray
    const polygonMatch = source.match(/<polygon[\s\S]*?\/>/);
    expect(polygonMatch).toBeDefined();
    expect(polygonMatch![0]).toContain("strokeWidth={1}");
    expect(polygonMatch![0]).not.toContain("strokeDasharray");
    expect(polygonMatch![0]).toContain('vectorEffect="non-scaling-stroke"');
  });

  it("includes an invisible touch area for effortless grabbing", () => {
    expect(source).toContain('fill="transparent"');
  });
});
