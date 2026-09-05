import { describe, expect, it } from "vitest";
import {
  getObjectContextIconName,
  OBJECT_CONTEXT_ICON_KEYS,
} from "@/components/Canvas/objectContextIconRegistry";

const toolbarLabels = [
  "Flip Horizontal",
  "Flip Vertical",
  "Rotate 90°",
  "Crop",
  "Image Intelligence",
  "Download",
  "Image",
  "Vector",
  "3D Book",
  "Frame",
  "Text",
  "Shape",
  "Multiple",
  "Align",
  "Distribute",
  "Group",
  "Color",
  "Fill",
  "Stroke",
  "Fit canvas",
  "Corner radius",
  "Edit nodes",
  "Edit",
  "Detach",
  "Font",
  "Size",
  "Weight",
  "Paragraph",
  "Spacing",
  "Unite",
  "Minus Front",
  "Intersect",
  "Exclude",
  "Minus Back",
  "Divide",
  "Convert to frame",
];

describe("ObjectContextBar SVG icon registry", () => {
  it.each(toolbarLabels)("maps %s to a semantic icon name", (label) => {
    const iconName = getObjectContextIconName(label);

    expect(iconName).not.toBe("object");
    expect(iconName).not.toMatch(/[↔↕↻⌗✨↓▣✒▤▱T◇✣≡⋮□●╱◰⌘✎↗A B¶∪−∩⊗÷#]/u);
  });

  it("keeps a safe semantic fallback for unknown category labels", () => {
    expect(getObjectContextIconName("Unknown category")).toBe("object");
  });

  it("exposes one registry for every context action and category icon", () => {
    expect(OBJECT_CONTEXT_ICON_KEYS).toEqual(expect.arrayContaining(toolbarLabels));
    expect(new Set(OBJECT_CONTEXT_ICON_KEYS).size).toBe(OBJECT_CONTEXT_ICON_KEYS.length);
  });
});
