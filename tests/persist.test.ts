import { describe, expect, it } from "vitest";
import {
  createEnginePersistence,
  type PersistenceBackend,
  type StoredSnapshot,
} from "@/lib/engine/persist";
import { fromJSON } from "@/lib/engine/serialize";
import { ENGINE_SCHEMA_VERSION, type EngineDoc } from "@/lib/engine/types";

function document(title: string): EngineDoc {
  return {
    id: "doc-1",
    title,
    width: 1920,
    height: 1080,
    slides: [
      {
        id: "slide-1",
        name: "Artwork 1",
        background: "#ffffff",
        elements: [],
        layers: [],
        width: 1920,
        height: 1080,
      },
    ],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: 1,
    schemaVersion: 4,
  };
}

class MemoryBackend implements PersistenceBackend {
  active: StoredSnapshot | null = null;
  backup: StoredSnapshot | null = null;
  replaceCount = 0;
  failWrites = false;

  async read(slot: "active" | "backup") {
    return this[slot];
  }

  async replace(snapshot: StoredSnapshot, options?: { preserveBackup?: boolean }) {
    if (this.failWrites) throw new Error("quota exceeded");
    this.replaceCount += 1;
    if (!options?.preserveBackup) this.backup = this.active;
    this.active = structuredClone(snapshot);
  }

  async clear() {
    this.active = null;
    this.backup = null;
  }

  async dump() {
    return JSON.stringify({ active: this.active, backup: this.backup });
  }
}

const codec = {
  encode(doc: EngineDoc) {
    return { doc, files: {} };
  },
  async decode(payload: StoredSnapshot["payload"]) {
    if (payload.doc.title === "CORRUPT") throw new Error("invalid snapshot");
    return payload.doc;
  },
};

describe("engine persistence", () => {
  it("rotates the previous active document into a backup on save", async () => {
    const backend = new MemoryBackend();
    const persistence = createEnginePersistence({ backend, codec });

    await persistence.save(document("First"));
    await persistence.save(document("Second"));

    expect(backend.active?.payload.doc.title).toBe("Second");
    expect(backend.backup?.payload.doc.title).toBe("First");
    await expect(persistence.load()).resolves.toMatchObject({
      status: "loaded",
      doc: { title: "Second" },
    });
  });

  it("recovers from backup without writing during load", async () => {
    const backend = new MemoryBackend();
    backend.active = { payload: codec.encode(document("CORRUPT")), savedAt: 2 };
    backend.backup = { payload: codec.encode(document("Safe backup")), savedAt: 1 };
    const persistence = createEnginePersistence({ backend, codec });

    await expect(persistence.load()).resolves.toMatchObject({
      status: "recovered",
      source: "backup",
      doc: { title: "Safe backup" },
    });
    expect(backend.replaceCount).toBe(0);

    await persistence.save(document("Recovered and edited"));
    expect(backend.backup?.payload.doc.title).toBe("Safe backup");
  });

  it("returns a recovery payload instead of overwriting corrupt data", async () => {
    const backend = new MemoryBackend();
    backend.active = { payload: codec.encode(document("CORRUPT")), savedAt: 2 };
    backend.backup = { payload: codec.encode(document("CORRUPT")), savedAt: 1 };
    const persistence = createEnginePersistence({ backend, codec });

    const result = await persistence.load();

    expect(result.status).toBe("corrupt");
    expect(result.status === "corrupt" ? result.recoveryPayload : null).toContain("CORRUPT");
    expect(backend.replaceCount).toBe(0);
  });

  it("reports failed saves to the caller", async () => {
    const backend = new MemoryBackend();
    backend.failWrites = true;
    const persistence = createEnginePersistence({ backend, codec });

    await expect(persistence.save(document("Unsaved"))).resolves.toEqual({
      ok: false,
      message: "quota exceeded",
    });
  });
});

describe("document schema migration", () => {
  it("treats a document without schemaVersion as schema v1", () => {
    const { schemaVersion: _schemaVersion, ...legacy } = document("Legacy");

    const migrated = fromJSON(legacy);

    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    expect(migrated.slides[0].layers).toHaveLength(1);
  });
});
