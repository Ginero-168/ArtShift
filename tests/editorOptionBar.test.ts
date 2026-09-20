import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("EditorOptionBar vector tool rail", () => {
  const railSource = readFileSync("components/Canvas/EditorOptionBar.tsx", "utf8");
  const registrySource = readFileSync("components/Canvas/toolRegistry.ts", "utf8");
  const iconSource = readFileSync("components/icons.tsx", "utf8");

  it("exposes only Pan, Select, Direct, Pen, Draw, and Text", () => {
    expect(registrySource).toContain('label: "Pan"');
    expect(registrySource).toContain('label: "Select"');
    expect(registrySource).toContain('label: "Direct"');
    expect(registrySource).toContain('label: "Pen"');
    expect(registrySource).toContain('label: "Draw"');
    expect(registrySource).toContain('label: "Text"');
    expect(railSource).toContain("COMMON_TOOL_DEFINITIONS");
    expect(railSource).toContain("VECTOR_TOOL_DEFINITIONS");
    expect(railSource).not.toContain("SHAPE_TOOL_DEFINITIONS");
    expect(railSource).not.toContain("RASTER_TOOL_DEFINITIONS");
  });

  it("uses the shared app UI font token for rail labels", () => {
    expect(railSource).toContain('fontFamily: "var(--font-sans)"');
    expect(railSource).not.toContain("Mali");
    expect(railSource).not.toContain("Excalifont");
  });

  it("does not frame any tool in a separate outlined box", () => {
    expect(railSource).not.toContain("IconBrief");
    expect(railSource).not.toContain("Briefing");
    expect(railSource).not.toContain("handleToolbarConvertToBrief");
    expect(railSource).not.toMatch(/border:\s*"1px solid rgba\(99,\s*102,\s*241/);
    expect(railSource).not.toContain('background: "rgba(99, 102, 241, 0.08)"');
    expect(railSource).toContain('border: "none"');
    expect(railSource).toContain('aria-hidden="true"');
  });

  it("uses the shared Affinity-like glyphs in components/icons.tsx", () => {
    expect(iconSource).toContain("export const IconHand");
    expect(iconSource).toContain("export const IconCursor");
    expect(iconSource).toContain("export const IconDirectSelect");
    expect(iconSource).toContain("export const IconPen");
    expect(iconSource).toContain("export const IconFreedraw");
    expect(iconSource).toContain("export const IconText");
    expect(iconSource).not.toContain('d="M12 20c-4-8 0-16 0-16s8 4 4 10c-2 3-4 6-4 6Z"');
    expect(iconSource).not.toContain('d="M4 20C8 16 10 10 14 8c2-1 4 1 6-4"');
    expect(iconSource).toContain("M14.4 3.6 20.4 9.6 9.2 20.8 3.4 21.6l.8-5.8Z");
    expect(iconSource).toContain('rect x="16.4" y="3.2" width="4" height="4"');
  });
});
