"use client";

import { deserializeWithImages, serializeWithImages } from "../engine/serialize";
import { createEmptyEngineDoc } from "../engine/store";
import type { EngineDoc } from "../engine/types";
import { renderSlideToDataUrl } from "../renderer/thumbnail";

export const PROJECT_SCHEMA_VERSION = 1;
const DB_NAME = "artshift-projects-v1";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_DOCUMENTS = "documents";
const STORE_ASSETS = "assets";
const LEGACY_MIGRATION_FLAG = "artshift:migrated_legacy_workspace_v1";

export type ProjectMetadata = {
  id: string;
  ownerKey: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  thumbnail?: string;
  slideCount?: number;
  schemaVersion: number;
};

export type ProjectDocumentRecord = {
  projectId: string;
  ownerKey: string;
  doc: EngineDoc;
  assetIds: string[];
  updatedAt: number;
};

export type ProjectArchive = {
  format: "artshift-project-v1";
  exportedAt: number;
  metadata: ProjectMetadata;
  document: EngineDoc;
  assets: Record<string, string>;
};

export type AllProjectsArchive = {
  format: "artshift-all-projects-v1";
  exportedAt: number;
  projects: ProjectArchive[];
};

export type ProjectSaveResult =
  | { ok: true; savedAt: number }
  | { ok: false; message: string };

export interface ProjectStoreBackend {
  list(ownerKey?: string): Promise<ProjectMetadata[]>;
  get(projectId: string): Promise<ProjectMetadata | null>;
  putProject(metadata: ProjectMetadata): Promise<void>;
  delete(projectId: string): Promise<void>;
  getDocument(projectId: string): Promise<{ doc: EngineDoc; files: Record<string, string> } | null>;
  saveDocument(
    projectId: string,
    ownerKey: string,
    doc: EngineDoc,
    files: Record<string, string>,
    thumbnail?: string,
  ): Promise<number>;
  clearAll(): Promise<void>;
}

// ——— IndexedDB Backend ——————————————————————————————————————————

class IndexedDbProjectBackend implements ProjectStoreBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return reject(new Error("IndexedDB is not available in this environment."));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          store.createIndex("by_ownerKey", "ownerKey", { unique: false });
          store.createIndex("by_updatedAt", "updatedAt", { unique: false });
          store.createIndex("by_lastOpenedAt", "lastOpenedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
          const store = db.createObjectStore(STORE_DOCUMENTS, { keyPath: "projectId" });
          store.createIndex("by_ownerKey", "ownerKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          db.createObjectStore(STORE_ASSETS, { keyPath: "fileId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB database open blocked by another tab"));
    });
    return this.dbPromise;
  }

  async list(ownerKey?: string): Promise<ProjectMetadata[]> {
    const db = await this.getDB();
    const tx = db.transaction(STORE_PROJECTS, "readonly");
    const store = tx.objectStore(STORE_PROJECTS);
    let items: ProjectMetadata[];

    if (ownerKey && store.indexNames.contains("by_ownerKey")) {
      const index = store.index("by_ownerKey");
      items = await idbRequest(index.getAll(ownerKey));
    } else {
      items = await idbRequest(store.getAll());
    }
    await idbTxDone(tx);

    // Sort by lastOpenedAt descending, fallback to updatedAt
    return items.sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  }

  async get(projectId: string): Promise<ProjectMetadata | null> {
    const db = await this.getDB();
    const tx = db.transaction(STORE_PROJECTS, "readonly");
    const item = await idbRequest<ProjectMetadata | undefined>(
      tx.objectStore(STORE_PROJECTS).get(projectId),
    );
    await idbTxDone(tx);
    return item ?? null;
  }

  async putProject(metadata: ProjectMetadata): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    tx.objectStore(STORE_PROJECTS).put(metadata);
    await idbTxDone(tx);
  }

  async delete(projectId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_PROJECTS, STORE_DOCUMENTS], "readwrite");
    tx.objectStore(STORE_PROJECTS).delete(projectId);
    tx.objectStore(STORE_DOCUMENTS).delete(projectId);
    await idbTxDone(tx);
  }

  async getDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null> {
    const db = await this.getDB();
    const docTx = db.transaction(STORE_DOCUMENTS, "readonly");
    const record = await idbRequest<ProjectDocumentRecord | undefined>(
      docTx.objectStore(STORE_DOCUMENTS).get(projectId),
    );
    await idbTxDone(docTx);
    if (!record) return null;

    const assetIds = record.assetIds || [];
    const files: Record<string, string> = {};
    if (assetIds.length > 0) {
      const assetTx = db.transaction(STORE_ASSETS, "readonly");
      const assetStore = assetTx.objectStore(STORE_ASSETS);
      const assetRecords = await Promise.all(
        assetIds.map((id) =>
          idbRequest<{ fileId: string; dataURL: string } | undefined>(assetStore.get(id)),
        ),
      );
      await idbTxDone(assetTx);
      for (const item of assetRecords) {
        if (item) files[item.fileId] = item.dataURL;
      }
    }

    return { doc: record.doc, files };
  }

  async saveDocument(
    projectId: string,
    ownerKey: string,
    doc: EngineDoc,
    files: Record<string, string>,
    thumbnail?: string,
  ): Promise<number> {
    const db = await this.getDB();
    const assetIds = Object.keys(files);
    const now = Date.now();

    const tx = db.transaction([STORE_DOCUMENTS, STORE_ASSETS, STORE_PROJECTS], "readwrite");
    const docStore = tx.objectStore(STORE_DOCUMENTS);
    const assetStore = tx.objectStore(STORE_ASSETS);
    const projectStore = tx.objectStore(STORE_PROJECTS);

    // 1. Save Document
    docStore.put({
      projectId,
      ownerKey,
      doc,
      assetIds,
      updatedAt: now,
    } satisfies ProjectDocumentRecord);

    // 2. Save Assets
    for (const [fileId, dataURL] of Object.entries(files)) {
      assetStore.put({ fileId, dataURL });
    }

    // 3. Update Project metadata updatedAt, slideCount, and thumbnail
    const existing = await idbRequest<ProjectMetadata | undefined>(projectStore.get(projectId));
    if (existing) {
      existing.updatedAt = now;
      existing.slideCount = doc.slides?.length ?? 1;
      if (thumbnail) {
        existing.thumbnail = thumbnail;
      }
      projectStore.put(existing);
    }

    await idbTxDone(tx);
    return now;
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_PROJECTS, STORE_DOCUMENTS, STORE_ASSETS], "readwrite");
    tx.objectStore(STORE_PROJECTS).clear();
    tx.objectStore(STORE_DOCUMENTS).clear();
    tx.objectStore(STORE_ASSETS).clear();
    await idbTxDone(tx);
  }
}

// ——— Memory / LocalStorage Fallback Backend ——————————————————————

class MemoryProjectBackend implements ProjectStoreBackend {
  private projects = new Map<string, ProjectMetadata>();
  private documents = new Map<string, ProjectDocumentRecord>();
  private assets = new Map<string, string>();

  async list(ownerKey?: string): Promise<ProjectMetadata[]> {
    const list = Array.from(this.projects.values());
    const filtered = ownerKey ? list.filter((p) => p.ownerKey === ownerKey) : list;
    return filtered.sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  }

  async get(projectId: string): Promise<ProjectMetadata | null> {
    return this.projects.get(projectId) ?? null;
  }

  async putProject(metadata: ProjectMetadata): Promise<void> {
    this.projects.set(metadata.id, { ...metadata });
  }

  async delete(projectId: string): Promise<void> {
    this.projects.delete(projectId);
    this.documents.delete(projectId);
  }

  async getDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null> {
    const record = this.documents.get(projectId);
    if (!record) return null;
    const files: Record<string, string> = {};
    for (const id of record.assetIds || []) {
      const data = this.assets.get(id);
      if (data) files[id] = data;
    }
    return { doc: record.doc, files };
  }

  async saveDocument(
    projectId: string,
    ownerKey: string,
    doc: EngineDoc,
    files: Record<string, string>,
    thumbnail?: string,
  ): Promise<number> {
    const now = Date.now();
    const assetIds = Object.keys(files);
    for (const [id, data] of Object.entries(files)) {
      this.assets.set(id, data);
    }
    this.documents.set(projectId, {
      projectId,
      ownerKey,
      doc,
      assetIds,
      updatedAt: now,
    });
    const proj = this.projects.get(projectId);
    if (proj) {
      proj.updatedAt = now;
      proj.slideCount = doc.slides?.length ?? 1;
      if (thumbnail) {
        proj.thumbnail = thumbnail;
      }
    }
    return now;
  }

  async clearAll(): Promise<void> {
    this.projects.clear();
    this.documents.clear();
    this.assets.clear();
  }
}

// ——— Resilient Multi-backend Coordinator ————————————————————————

class ResilientProjectStore {
  private backend: ProjectStoreBackend;

  constructor(backendOverride?: ProjectStoreBackend) {
    if (backendOverride) {
      this.backend = backendOverride;
    } else if (typeof indexedDB !== "undefined") {
      this.backend = new IndexedDbProjectBackend();
    } else {
      this.backend = new MemoryProjectBackend();
    }
  }

  setBackend(backend: ProjectStoreBackend) {
    this.backend = backend;
  }

  async listProjects(ownerKey?: string): Promise<ProjectMetadata[]> {
    try {
      return await this.backend.list(ownerKey);
    } catch {
      return [];
    }
  }

  async getProject(projectId: string): Promise<ProjectMetadata | null> {
    if (!projectId) return null;
    try {
      return await this.backend.get(projectId);
    } catch {
      return null;
    }
  }

  async createProject(options?: {
    name?: string;
    doc?: EngineDoc;
    ownerKey?: string;
    files?: Record<string, string>;
  }): Promise<ProjectMetadata> {
    const id = crypto.randomUUID();
    const name = options?.name?.trim() || "Untitled Project";
    const ownerKey = options?.ownerKey || "local-default";
    const now = Date.now();

    const doc = options?.doc || createEmptyEngineDoc(name);
    doc.id = id;
    doc.title = name;
    doc.updatedAt = now;

    const serialized = serializeWithImages(doc);
    const combinedFiles = { ...serialized.files, ...(options?.files || {}) };

    let initialThumbnail: string | undefined;
    if (typeof document !== "undefined" && doc.slides?.[0]) {
      try {
        initialThumbnail = await renderSlideToDataUrl(doc.slides[0], combinedFiles, 480);
      } catch {
        // ignore
      }
    }

    const metadata: ProjectMetadata = {
      id,
      ownerKey,
      name,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      thumbnail: initialThumbnail,
      slideCount: doc.slides?.length ?? 1,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    };

    await this.backend.putProject(metadata);
    await this.backend.saveDocument(id, ownerKey, serialized.doc, combinedFiles, initialThumbnail);

    return metadata;
  }

  async renameProject(projectId: string, newName: string): Promise<void> {
    const meta = await this.getProject(projectId);
    if (!meta) throw new Error("Project not found");

    const trimmed = newName.trim() || "Untitled Project";
    meta.name = trimmed;
    meta.updatedAt = Date.now();
    await this.backend.putProject(meta);

    // Also update title in document if it exists
    const docRecord = await this.backend.getDocument(projectId);
    if (docRecord) {
      docRecord.doc.title = trimmed;
      docRecord.doc.updatedAt = meta.updatedAt;
      await this.backend.saveDocument(projectId, meta.ownerKey, docRecord.doc, docRecord.files);
    }
  }

  async touchProject(projectId: string): Promise<void> {
    return this.touchLastOpened(projectId);
  }

  async touchLastOpened(projectId: string): Promise<void> {
    const meta = await this.getProject(projectId);
    if (!meta) return;
    meta.lastOpenedAt = Date.now();
    await this.backend.putProject(meta);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.backend.delete(projectId);
  }

  async loadProjectDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null> {
    const result = await this.backend.getDocument(projectId);
    if (!result) return null;
    const decoded = await deserializeWithImages({ doc: result.doc, files: result.files });
    await this.touchLastOpened(projectId);
    return { doc: decoded, files: result.files };
  }

  async getProjectDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null> {
    return this.backend.getDocument(projectId);
  }

  async updateProjectThumbnail(projectId: string, thumbnail: string): Promise<void> {
    const meta = await this.getProject(projectId);
    if (!meta) return;
    meta.thumbnail = thumbnail;
    await this.backend.putProject(meta);
  }

  async saveProjectDocument(
    projectId: string,
    doc: EngineDoc,
    options?: { thumbnail?: string },
  ): Promise<ProjectSaveResult> {
    try {
      const meta = await this.getProject(projectId);
      const ownerKey = meta?.ownerKey || "local-default";
      const serialized = serializeWithImages(doc);
      let thumbnail = options?.thumbnail;
      if (!thumbnail && typeof document !== "undefined" && doc.slides?.[0]) {
        try {
          thumbnail = await renderSlideToDataUrl(doc.slides[0], serialized.files, 480);
        } catch {
          // ignore thumbnail generation errors
        }
      }
      const savedAt = await this.backend.saveDocument(
        projectId,
        ownerKey,
        serialized.doc,
        serialized.files,
        thumbnail,
      );
      return { ok: true, savedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save project document.";
      return { ok: false, message };
    }
  }

  async exportProjectArchive(projectId: string): Promise<string> {
    return this.exportProject(projectId);
  }

  async exportAllProjectsArchive(ownerKey?: string): Promise<string> {
    return this.exportAllProjects(ownerKey);
  }

  async exportProject(projectId: string): Promise<string> {
    const meta = await this.getProject(projectId);
    if (!meta) throw new Error("Project not found");
    const docRecord = await this.backend.getDocument(projectId);
    if (!docRecord) throw new Error("Project document not found");

    const archive: ProjectArchive = {
      format: "artshift-project-v1",
      exportedAt: Date.now(),
      metadata: meta,
      document: docRecord.doc,
      assets: docRecord.files,
    };
    return JSON.stringify(archive, null, 2);
  }

  async importProject(fileContent: string, ownerKey = "local-default"): Promise<ProjectMetadata> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      throw new Error("Invalid project file: not valid JSON.");
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid project archive format.");
    }

    const archive = parsed as Partial<ProjectArchive>;
    if (archive.format !== "artshift-project-v1" || !archive.document || !archive.metadata) {
      throw new Error("Unsupported project file format or missing document payload.");
    }

    // Always generate a new unique project ID upon import to prevent accidental overwrites
    const newId = crypto.randomUUID();
    const now = Date.now();
    const importedName = archive.metadata.name ? `${archive.metadata.name}` : "Imported Project";

    const doc = archive.document;
    doc.id = newId;
    doc.title = importedName;
    doc.updatedAt = now;

    const metadata: ProjectMetadata = {
      id: newId,
      ownerKey,
      name: importedName,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      slideCount: doc.slides?.length ?? 1,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    };

    await this.backend.putProject(metadata);
    await this.backend.saveDocument(newId, ownerKey, doc, archive.assets || {});

    return metadata;
  }

  async exportAllProjects(ownerKey?: string): Promise<string> {
    const projects = await this.listProjects(ownerKey);
    const archives: ProjectArchive[] = [];
    for (const p of projects) {
      const docRecord = await this.backend.getDocument(p.id);
      if (docRecord) {
        archives.push({
          format: "artshift-project-v1",
          exportedAt: Date.now(),
          metadata: p,
          document: docRecord.doc,
          assets: docRecord.files,
        });
      }
    }
    const bundle: AllProjectsArchive = {
      format: "artshift-all-projects-v1",
      exportedAt: Date.now(),
      projects: archives,
    };
    return JSON.stringify(bundle, null, 2);
  }

  async detectLegacyWorkspace(): Promise<EngineDoc | null> {
    if (typeof window === "undefined") return null;
    const migrated = localStorage.getItem(LEGACY_MIGRATION_FLAG);
    if (migrated === "true") return null;

    // Check localStorage active engine key
    const localActive = localStorage.getItem("artshift:engine:active:v2");
    if (localActive) {
      try {
        const parsed = JSON.parse(localActive);
        if (parsed?.payload?.doc?.slides?.length) {
          return parsed.payload.doc as EngineDoc;
        }
      } catch {
        // ignore parse errors
      }
    }

    // Check legacy mighty-slides key
    const legacyRaw = localStorage.getItem("mighty-slides:engine:v1");
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw);
        if (parsed?.doc?.slides?.length) {
          return parsed.doc as EngineDoc;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  async migrateLegacyWorkspace(ownerKey = "local-default"): Promise<ProjectMetadata | null> {
    const legacyDoc = await this.detectLegacyWorkspace();
    if (!legacyDoc) return null;

    const title = legacyDoc.title && legacyDoc.title !== "Untitled" ? legacyDoc.title : "Imported Artwork";
    const metadata = await this.createProject({
      name: title,
      doc: legacyDoc,
      ownerKey,
    });

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGACY_MIGRATION_FLAG, "true");
    }

    return metadata;
  }

  dismissLegacyMigrationNotice(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGACY_MIGRATION_FLAG, "true");
    }
  }

  async clearAll(): Promise<void> {
    await this.backend.clearAll();
  }
}

// Global project store singleton
export const projectStore = new ResilientProjectStore();

// Expose factory for testing with in-memory store
export function createTestProjectStore(): ResilientProjectStore {
  return new ResilientProjectStore(new MemoryProjectBackend());
}

// Helper: wrap IDBRequest into a Promise
function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IDB request failed"));
  });
}

// Helper: wait for IDBTransaction to finish
function idbTxDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IDB transaction aborted"));
  });
}
