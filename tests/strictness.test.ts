import { describe, expect, it } from "vitest";
import { fromJSON, toJSON } from "@/lib/engine/serialize";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";

describe("deprecated workspace strictness leftovers", () => {
  it("still reads leftover strictness fields on load without exposing a product API", () => {
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
