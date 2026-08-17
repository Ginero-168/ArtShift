"use client";

/**
 * Durable browser persistence for Artwork documents.
 *
 * The public interface deliberately exposes outcomes instead of hiding errors:
 * callers must decide whether a recovered/corrupt document may be edited and
 * autosaved. Binary assets live in IndexedDB while the document only keeps
 * stable asset ids. A localStorage adapter remains as a compatibility fallback.
 */

import { legacyToEngineDoc } from "./adapter";
import { deserializeWithImages, type SerializedDoc, serializeWithImages } from "./serialize";
import type { EngineDoc } from "./types";

const LEGACY_ENGINE_KEY = "mighty-slides:engine:v1";
const LEGACY_DOCUMENT_KEY = "mighty-slides:doc:v1";
const LOCAL_ACTIVE_KEY = "artshift:engine:active:v2";
const LOCAL_BACKUP_KEY = "artshift:engine:backup:v2";
const DATABASE_NAME = "artshift-editor";
const DATABASE_VERSION = 1;
const DOCUMENT_STORE = "documents";
const ASSET_STORE = "assets";

type SnapshotSlot = "active" | "backup";

export type StoredSnapshot = {
  payload: SerializedDoc;
  savedAt: number;
};

export interface PersistenceBackend {
  read(slot: SnapshotSlot): Promise<StoredSnapshot | null>;
  replace(snapshot: StoredSnapshot, options?: { preserveBackup?: boolean }): Promise<void>;
  clear(): Promise<void>;
  dump(): Promise<string | null>;
}

export type EngineLoadResult =
  | { status: "empty" }
  | { status: "loaded"; doc: EngineDoc; savedAt: number }
  | { status: "recovered"; doc: EngineDoc; savedAt: number; source: "backup" | "legacy" }
  | { status: "corrupt"; message: string; recoveryPayload: string | null };

export type EngineSaveResult = { ok: true; savedAt: number } | { ok: false; message: string };

type PersistenceCodec = {
  encode(doc: EngineDoc): SerializedDoc;
  decode(payload: SerializedDoc): Promise<EngineDoc>;
};

type EnginePersistenceOptions = {
  backend: PersistenceBackend;
  codec?: PersistenceCodec;
  loadLegacy?: () => Promise<EngineDoc | null>;
};

/**
 * Deep persistence module used by both the browser and in-memory test adapters.
 * Loading never writes. Saving is the only operation allowed to rotate active
 * data into the backup slot.
 */
export function createEnginePersistence(options: EnginePersistenceOptions) {
  const codec: PersistenceCodec = options.codec ?? {
    encode: serializeWithImages,
    decode: deserializeWithImages,
  };

  let preserveBackupOnNextSave = false;

  return {
    async load(): Promise<EngineLoadResult> {
      let foundSnapshot = false;
      let lastError: unknown;

      for (const slot of ["active", "backup"] as const) {
        try {
          const snapshot = await options.backend.read(slot);
          if (!snapshot) continue;
          foundSnapshot = true;
          const doc = await codec.decode(snapshot.payload);
          if (slot === "active") return { status: "loaded", doc, savedAt: snapshot.savedAt };
          preserveBackupOnNextSave = true;
          return { status: "recovered", doc, savedAt: snapshot.savedAt, source: "backup" };
        } catch (error) {
          lastError = error;
        }
      }

      if (options.loadLegacy) {
        try {
          const legacy = await options.loadLegacy();
          if (legacy) {
            return { status: "recovered", doc: legacy, savedAt: Date.now(), source: "legacy" };
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!foundSnapshot && !lastError) return { status: "empty" };
      return {
        status: "corrupt",
        message: errorMessage(lastError, "The saved Artwork could not be opened."),
        recoveryPayload: await options.backend.dump().catch(() => null),
      };
    },

    async save(doc: EngineDoc): Promise<EngineSaveResult> {
      try {
        const savedAt = Date.now();
        await options.backend.replace(
          { payload: codec.encode(doc), savedAt },
          { preserveBackup: preserveBackupOnNextSave },
        );
        preserveBackupOnNextSave = false;
        return { ok: true, savedAt };
      } catch (error) {
        return { ok: false, message: errorMessage(error, "The Artwork could not be saved.") };
      }
    },

    async clear(): Promise<void> {
      await options.backend.clear();
    },
  };
}

type DocumentRecord = {
  slot: SnapshotSlot;
  doc: EngineDoc;
  assetIds: string[];
  savedAt: number;
};

type AssetRecord = {
  fileId: string;
  dataURL: string;
};

class IndexedDbBackend implements PersistenceBackend {
  async read(slot: SnapshotSlot): Promise<StoredSnapshot | null> {
    const db = await openDatabase();
    const documentRecord = await readDocumentRecord(db, slot);
    if (!documentRecord) return null;

    const tx = db.transaction(ASSET_STORE, "readonly");
    const done = transactionDone(tx);
    const assets = tx.objectStore(ASSET_STORE);
    const records = await Promise.all(
      documentRecord.assetIds.map((fileId) =>
        requestResult<AssetRecord | undefined>(assets.get(fileId)),
      ),
    );
    await done;
    const files: Record<string, string> = {};
    for (const record of records) {
      if (record) files[record.fileId] = record.dataURL;
    }
    return {
      payload: { doc: documentRecord.doc, files },
      savedAt: documentRecord.savedAt,
    };
  }

  async replace(snapshot: StoredSnapshot, options?: { preserveBackup?: boolean }): Promise<void> {
    const db = await openDatabase();
    const previous = await readDocumentRecord(db, "active");
    const assetIds = Object.keys(snapshot.payload.files);
    const tx = db.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
    const done = transactionDone(tx);
    const documents = tx.objectStore(DOCUMENT_STORE);
    const assets = tx.objectStore(ASSET_STORE);

    if (previous && !options?.preserveBackup) {
      documents.put({ ...previous, slot: "backup" } satisfies DocumentRecord);
    }
    documents.put({
      slot: "active",
      doc: snapshot.payload.doc,
      assetIds,
      savedAt: snapshot.savedAt,
    } satisfies DocumentRecord);
    for (const [fileId, dataURL] of Object.entries(snapshot.payload.files)) {
      assets.put({ fileId, dataURL } satisfies AssetRecord);
    }
    await done;
  }

  async clear(): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(DOCUMENT_STORE).clear();
    tx.objectStore(ASSET_STORE).clear();
    await done;
  }

  async dump(): Promise<string | null> {
    const snapshots = await Promise.all([this.read("active"), this.read("backup")]);
    return snapshots.some(Boolean)
      ? JSON.stringify({ active: snapshots[0], backup: snapshots[1] })
      : null;
  }
}

class LocalStorageBackend implements PersistenceBackend {
  async read(slot: SnapshotSlot): Promise<StoredSnapshot | null> {
    const raw = localStorage.getItem(slot === "active" ? LOCAL_ACTIVE_KEY : LOCAL_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  }

  async replace(snapshot: StoredSnapshot, options?: { preserveBackup?: boolean }): Promise<void> {
    const current = localStorage.getItem(LOCAL_ACTIVE_KEY);
    if (current && !options?.preserveBackup) localStorage.setItem(LOCAL_BACKUP_KEY, current);
    localStorage.setItem(LOCAL_ACTIVE_KEY, JSON.stringify(snapshot));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(LOCAL_ACTIVE_KEY);
    localStorage.removeItem(LOCAL_BACKUP_KEY);
  }

  async dump(): Promise<string | null> {
    const active = localStorage.getItem(LOCAL_ACTIVE_KEY);
    const backup = localStorage.getItem(LOCAL_BACKUP_KEY);
    return active || backup ? JSON.stringify({ active, backup }) : null;
  }
}

class ResilientBackend implements PersistenceBackend {
  constructor(
    private readonly primary: PersistenceBackend | null,
    private readonly fallback: PersistenceBackend,
  ) {}

  async read(slot: SnapshotSlot): Promise<StoredSnapshot | null> {
    if (this.primary) {
      try {
        const value = await this.primary.read(slot);
        if (value) return value;
      } catch {
        // The local adapter below remains usable in private/restricted browsers.
      }
    }
    return this.fallback.read(slot);
  }

  async replace(snapshot: StoredSnapshot, options?: { preserveBackup?: boolean }): Promise<void> {
    if (this.primary) {
      try {
        await this.primary.replace(snapshot, options);
        return;
      } catch {
        // Fall through to localStorage. Its quota error is returned to the UI.
      }
    }
    await this.fallback.replace(snapshot, options);
  }

  async clear(): Promise<void> {
    const tasks = [this.fallback.clear()];
    if (this.primary) tasks.push(this.primary.clear());
    const results = await Promise.allSettled(tasks);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  async dump(): Promise<string | null> {
    const dumps = await Promise.allSettled([
      this.primary?.dump() ?? Promise.resolve(null),
      this.fallback.dump(),
    ]);
    const values = dumps.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
    return values.length ? JSON.stringify(values) : null;
  }
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: "slot" });
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE, { keyPath: "fileId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab."));
  });
  return databasePromise;
}

async function readDocumentRecord(
  db: IDBDatabase,
  slot: SnapshotSlot,
): Promise<DocumentRecord | null> {
  const tx = db.transaction(DOCUMENT_STORE, "readonly");
  const done = transactionDone(tx);
  const value = await requestResult<DocumentRecord | undefined>(
    tx.objectStore(DOCUMENT_STORE).get(slot),
  );
  await done;
  return value ?? null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function loadLegacyDocument(): Promise<EngineDoc | null> {
  const engineRaw = localStorage.getItem(LEGACY_ENGINE_KEY);
  if (engineRaw) {
    const parsed = JSON.parse(engineRaw) as SerializedDoc;
    return deserializeWithImages(parsed);
  }

  const legacyRaw = localStorage.getItem(LEGACY_DOCUMENT_KEY);
  if (!legacyRaw) return null;
  const legacy = JSON.parse(legacyRaw);
  const doc = legacy.state?.doc ?? legacy.doc ?? legacy;
  return doc?.slides ? legacyToEngineDoc(doc) : null;
}

function createBrowserPersistence() {
  const primary = typeof indexedDB === "undefined" ? null : new IndexedDbBackend();
  return createEnginePersistence({
    backend: new ResilientBackend(primary, new LocalStorageBackend()),
    loadLegacy: loadLegacyDocument,
  });
}

let browserPersistence: ReturnType<typeof createBrowserPersistence> | null = null;
let saveQueue: Promise<EngineSaveResult> = Promise.resolve({ ok: true, savedAt: 0 });

function persistence() {
  browserPersistence ??= createBrowserPersistence();
  return browserPersistence;
}

export function loadEngine(): Promise<EngineLoadResult> {
  return persistence().load();
}

export function saveEngine(doc: EngineDoc): Promise<EngineSaveResult> {
  const operation = saveQueue.then(() => persistence().save(doc));
  saveQueue = operation.catch((error) => ({
    ok: false,
    message: errorMessage(error, "The Artwork could not be saved."),
  }));
  return operation;
}

export async function clearEngine(): Promise<void> {
  await persistence().clear();
  localStorage.removeItem(LEGACY_ENGINE_KEY);
  localStorage.removeItem(LEGACY_DOCUMENT_KEY);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
