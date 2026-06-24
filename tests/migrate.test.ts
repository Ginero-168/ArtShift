import { describe, expect, it } from "vitest";
import { migrateDoc } from "@/lib/migrate";
import { CURRENT_SCHEMA_VERSION } from "@/lib/types";

describe("migrateDoc", () => {
  it("returns null for completely broken input", () => {
    expect(migrateDoc(null)).toBeNull();
    expect(migrateDoc(42)).toBeNull();
    expect(migrateDoc("bad")).toBeNull();
    expect(migrateDoc({})).toBeNull(); // no slides
  });

  it("stamps the current schema version on legacy docs", () => {
    const legacy = {
      id: "d1",
      title: "Legacy",
      width: 1280,
      height: 720,
      slides: [{ id: "s1", name: "Slide 1", background: "#fff", objects: [] }],
      updatedAt: 1,
    };
    const migrated = migrateDoc(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated?.slides).toHaveLength(1);
  });

  it("drops malformed objects but keeps the doc", () => {
    const input = {
      id: "d",
      title: "T",
      width: 1280,
      height: 720,
      updatedAt: 0,
      slides: [
        {
          id: "s",
          name: "n",
          background: "#fff",
          objects: [
            { type: "text", text: "hi", x: 10, y: 10, width: 100, height: 40, fontSize: 18 },
            { type: "image" /* missing src */ },
            { type: "bogus" },
          ],
        },
      ],
    };
    const out = migrateDoc(input);
    expect(out?.slides[0].objects).toHaveLength(1);
    expect(out?.slides[0].objects[0].type).toBe("text");
  });

  it("clamps bad opacity to [0,1]", () => {
    const doc = migrateDoc({
      id: "d",
      title: "",
      width: 1280,
      height: 720,
      updatedAt: 0,
      slides: [
        {
          id: "s",
          name: "n",
          background: "#fff",
          objects: [
            {
              type: "shape",
              shape: "rect",
              id: "a",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              rotation: 0,
              opacity: 5,
              fill: "#fff",
              stroke: "#000",
              strokeWidth: 1,
            },
          ],
        },
      ],
    });
    expect(doc?.slides[0].objects[0].opacity).toBe(1);
  });
});
