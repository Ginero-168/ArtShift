import { describe, expect, it, vi } from "vitest";
import {
  createEnginePersistence,
  type PersistenceBackend,
  ResilientBackend,
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

describe("resilient persistence", () => {
  it("loads the successful fallback save instead of the stale primary snapshot", async () => {
    const primary = new MemoryBackend();
    const fallback = new MemoryBackend();
    primary.active = { payload: codec.encode(document("Old")), savedAt: 1 };
    primary.failWrites = true;
    const persistence = createEnginePersistence({
      backend: new ResilientBackend(primary, fallback),
      codec,
    });
    await expect(persistence.save(document("Latest"))).resolves.toMatchObject({ ok: true });
    await expect(persistence.load()).resolves.toMatchObject({ doc: { title: "Latest" } });
  });

  it("orders saves even when the clock has not advanced", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    try {
      const primary = new MemoryBackend();
      const fallback = new MemoryBackend();
      const persistence = createEnginePersistence({
        backend: new ResilientBackend(primary, fallback),
        codec,
      });
      await persistence.save(document("Old"));
      primary.failWrites = true;
      await persistence.save(document("Latest"));
      await expect(persistence.load()).resolves.toMatchObject({ doc: { title: "Latest" } });
    } finally {
      clock.mockRestore();
    }
  });

  it("prefers the newer primary after primary writes recover", async () => {
    const primary = new MemoryBackend();
    const fallback = new MemoryBackend();
    primary.active = { payload: codec.encode(document("Latest")), savedAt: 3 };
    fallback.active = { payload: codec.encode(document("Old")), savedAt: 2 };
    const backend = new ResilientBackend(primary, fallback);
    expect((await backend.read("active"))?.payload.doc.title).toBe("Latest");
  });

  it("reads the primary even when the fallback is inaccessible", async () => {
    const primary = new MemoryBackend();
    const fallback = new MemoryBackend();
    primary.active = { payload: codec.encode(document("Safe")), savedAt: 1 };
    fallback.read = async () => {
      throw new Error("storage blocked");
    };
    expect((await new ResilientBackend(primary, fallback).read("active"))?.payload.doc.title).toBe(
      "Safe",
    );
  });
});
