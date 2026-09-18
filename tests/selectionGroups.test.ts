import { describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { analyzeSelectionGroups, buildLayerHierarchy } from "@/lib/engine/selectionGroups";

describe("analyzeSelectionGroups", () => {
  it("offers Ungroup for a single shared group", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    a.groupIds = ["g1"];
    b.groupIds = ["g1"];
    expect(analyzeSelectionGroups([a, b])).toMatchObject({
      canGroup: false,
      canUngroup: true,
      isSingleGroup: true,
      unitCount: 1,
    });
  });

  it("offers Group when two separate groups are selected", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const d = createRect({ x: 0, y: 0, width: 10, height: 10 });
    a.groupIds = ["g1"];
    b.groupIds = ["g1"];
    c.groupIds = ["g2"];
    d.groupIds = ["g2"];
    expect(analyzeSelectionGroups([a, b, c, d])).toMatchObject({
      canGroup: true,
      canUngroup: false,
      unitCount: 2,
    });
  });

  it("offers Group for a group plus a loose object", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    a.groupIds = ["g1"];
    b.groupIds = ["g1"];
    expect(analyzeSelectionGroups([a, b, c])).toMatchObject({
      canGroup: true,
      canUngroup: false,
      unitCount: 2,
    });
  });

  it("offers Group for multiple loose objects", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(analyzeSelectionGroups([a, b])).toMatchObject({
      canGroup: true,
      canUngroup: false,
      unitCount: 2,
    });
  });
});

describe("buildLayerHierarchy", () => {
  it("nests objects under shared group ids and preserves order", () => {
    const loose = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    a.groupIds = ["g1"];
    b.groupIds = ["g1"];

    const tree = buildLayerHierarchy([loose, a, b]);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ kind: "element", element: loose });
    expect(tree[1]).toMatchObject({
      kind: "group",
      groupId: "g1",
      memberIds: [a.id, b.id],
    });
    if (tree[1]?.kind === "group") {
      expect(tree[1].children).toEqual([
        { kind: "element", element: a },
        { kind: "element", element: b },
      ]);
    }
  });

  it("nests nested groupIds as a hierarchy", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    a.groupIds = ["outer", "inner"];
    b.groupIds = ["outer", "inner"];
    const tree = buildLayerHierarchy([a, b]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("group");
    if (tree[0]?.kind === "group") {
      expect(tree[0].groupId).toBe("outer");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0]).toMatchObject({ kind: "group", groupId: "inner" });
    }
  });
});
