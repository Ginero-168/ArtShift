import { describe, expect, it } from "vitest";
import { placementOverlapCells, placementsFit } from "@/lib/engine/hexLayout";
import { fromJSON, toJSON } from "@/lib/engine/serialize";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";

describe("Customizable Workspace Strictness", () => {
  it("allows setting custom cell overlap values for Level 2 and Level 3", () => {
    const st = useEngine.getState();
    st.loadDoc({
      id: "doc-strictness",
      title: "Strictness Test",
      schemaVersion: ENGINE_SCHEMA_VERSION,
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "s1",
          name: "Slide 1",
          background: "#fff",
          width: 1920,
          height: 1080,
          elements: [],
          layers: [
            {
              id: "layer1",
              name: "Block layer 1",
              mode: "block",
              objectIds: [],
              placements: {},
              visible: true,
              locked: false,
              z: 1,
            },
          ],
        },
      ],
      snapGrid: null,
      workspaceStrictness: 1,
      strictnessLevel: 1,
      strictnessValues: { 2: 1, 3: 2 },
      updatedAt: Date.now(),
    });

    // Level 1: exact (0 overlap)
    expect(useEngine.getState().doc.workspaceStrictness).toBe(1);
    expect(useEngine.getState().doc.strictnessLevel).toBe(1);

    // Switch to Level 2 with custom 4 cells
    st.setWorkspaceStrictness(2, 4);
    const doc2 = useEngine.getState().doc;
    expect(doc2.strictnessLevel).toBe(2);
    expect(doc2.strictnessValues?.[2]).toBe(4);
    expect(doc2.workspaceStrictness).toBe(5); // 4 cells overlap = strictness 5

    // Switch to Level 3 with custom 8 cells
    st.setWorkspaceStrictness(3, 8);
    const doc3 = useEngine.getState().doc;
    expect(doc3.strictnessLevel).toBe(3);
    expect(doc3.strictnessValues?.[3]).toBe(8);
    expect(doc3.workspaceStrictness).toBe(9); // 8 cells overlap = strictness 9

    // Update level 3 value directly via setStrictnessValue
    st.setStrictnessValue(3, 12);
    const doc3Updated = useEngine.getState().doc;
    expect(doc3Updated.strictnessValues?.[3]).toBe(12);
    expect(doc3Updated.workspaceStrictness).toBe(13);

    // Switch back to Level 1
    st.setWorkspaceStrictness(1);
    const doc1 = useEngine.getState().doc;
    expect(doc1.strictnessLevel).toBe(1);
    expect(doc1.workspaceStrictness).toBe(1);
    // Custom values are preserved
    expect(doc1.strictnessValues?.[2]).toBe(4);
    expect(doc1.strictnessValues?.[3]).toBe(12);
  });

  it("checks collision fit correctly against customized strictness", () => {
    const blockA = { col: 2, row: 2, colSpan: 6, rowSpan: 4 };
    const blockB = { col: 4, row: 2, colSpan: 6, rowSpan: 4 }; // overlaps by 4 * 4 = 16 cells horizontally? 4 cols * 4 rows = 16 cells

    const overlap = placementOverlapCells(blockA, blockB);
    expect(overlap).toBeGreaterThan(0);

    // Strictness 1 (0 overlap allowed) -> should not fit
    expect(placementsFit(blockA, blockB, 1)).toBe(false);

    // Strictness below overlap + 1 -> should not fit
    expect(placementsFit(blockA, blockB, overlap)).toBe(false);

    // Strictness >= overlap + 1 -> fits!
    expect(placementsFit(blockA, blockB, overlap + 1)).toBe(true);
  });

  it("serializes and deserializes strictnessLevel and strictnessValues", () => {
    const originalDoc = {
      id: "doc-save",
      title: "Save Test",
      width: 1920,
      height: 1080,
      slides: [],
      snapGrid: null,
      workspaceStrictness: 7,
      strictnessLevel: 2 as const,
      strictnessValues: { 2: 6, 3: 15 },
      updatedAt: Date.now(),
      schemaVersion: ENGINE_SCHEMA_VERSION,
    };

    const json = toJSON(originalDoc);
    const restored = fromJSON(json);

    expect(restored.workspaceStrictness).toBe(7);
    expect(restored.strictnessLevel).toBe(2);
    expect(restored.strictnessValues).toEqual({ 2: 6, 3: 15 });
  });
});
