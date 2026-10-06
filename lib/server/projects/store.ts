import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EngineDoc } from "@/lib/engine/types";
import type { ProjectMetadata } from "@/lib/project/projectStore";

const MAX_DOCUMENT_BYTES = 48 * 1024 * 1024;

export class ProjectAccessError extends Error {
  constructor() {
    super("Project not found");
    this.name = "ProjectAccessError";
  }
}

type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
  thumbnail: string | null;
  slide_count: number | null;
  schema_version: number;
};

const openDatabases = new Map<string, DatabaseSync>();

export function projectDatabasePath(): string {
  if (process.env.ARTSHIFT_PROJECT_DB_PATH) return process.env.ARTSHIFT_PROJECT_DB_PATH;
  if (process.env.NODE_ENV === "production") return "/var/lib/artshift/projects.sqlite";
  return join(process.cwd(), ".artshift", "projects.sqlite");
}

function database(): DatabaseSync {
  const path = projectDatabasePath();
  const cached = openDatabases.get(path);
  if (cached) return cached;
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL,
      thumbnail TEXT,
      slide_count INTEGER,
      schema_version INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_by_owner ON projects(owner_id, last_opened_at);
    CREATE TABLE IF NOT EXISTS documents (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      doc_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL,
      data_url TEXT NOT NULL,
      PRIMARY KEY (project_id, file_id)
    );
  `);
  openDatabases.set(path, db);
  return db;
}

export function listOwnedProjects(ownerId: string): ProjectMetadata[] {
  const rows = database()
    .prepare(
      `SELECT id, owner_id, name, created_at, updated_at, last_opened_at, thumbnail, slide_count, schema_version
       FROM projects WHERE owner_id = ? ORDER BY last_opened_at DESC`,
    )
    .all(ownerId) as ProjectRow[];
  return rows.map(toMetadata);
}

export function getOwnedProject(ownerId: string, projectId: string): ProjectMetadata | null {
  const row = ownedRow(ownerId, projectId);
  return row ? toMetadata(row) : null;
}

export function upsertOwnedProject(ownerId: string, metadata: ProjectMetadata): ProjectMetadata {
  const db = database();
  const existing = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(metadata.id) as
    | { owner_id: string }
    | undefined;
  if (existing && existing.owner_id !== ownerId) throw new ProjectAccessError();
  const next = {
    ...metadata,
    ownerKey: ownerId,
    name: metadata.name.trim() || "Untitled Project",
  };
  db.prepare(
    `INSERT INTO projects (
      id, owner_id, name, created_at, updated_at, last_opened_at, thumbnail, slide_count, schema_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at,
      last_opened_at = excluded.last_opened_at,
      thumbnail = excluded.thumbnail,
      slide_count = excluded.slide_count,
      schema_version = excluded.schema_version`,
  ).run(
    next.id,
    ownerId,
    next.name,
    next.createdAt,
    next.updatedAt,
    next.lastOpenedAt,
    next.thumbnail ?? null,
    next.slideCount ?? null,
    next.schemaVersion,
  );
  return next;
}

export function saveOwnedDocument(
  ownerId: string,
  projectId: string,
  doc: EngineDoc,
  files: Record<string, string>,
  thumbnail?: string,
): number {
  const db = database();
  const existing = ownedRow(ownerId, projectId);
  if (!existing) throw new ProjectAccessError();
  const payload = JSON.stringify({ doc, files });
  if (Buffer.byteLength(payload) > MAX_DOCUMENT_BYTES) {
    throw new Error("Project is larger than 48 MB.");
  }
  const savedAt = doc.updatedAt || Date.now();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO documents (project_id, doc_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
    ).run(projectId, JSON.stringify(doc), savedAt);
    db.prepare("DELETE FROM assets WHERE project_id = ?").run(projectId);
    const insertAsset = db.prepare(
      "INSERT INTO assets (project_id, file_id, data_url) VALUES (?, ?, ?)",
    );
    for (const [fileId, dataUrl] of Object.entries(files)) {
      if (!fileId || typeof dataUrl !== "string") continue;
      insertAsset.run(projectId, fileId, dataUrl);
    }
    db.prepare(
      `UPDATE projects
       SET updated_at = ?, slide_count = ?, thumbnail = COALESCE(?, thumbnail)
       WHERE id = ? AND owner_id = ?`,
    ).run(
      savedAt,
      doc.slides?.length ?? existing.slide_count ?? 1,
      thumbnail ?? null,
      projectId,
      ownerId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return savedAt;
}

export function readOwnedDocument(
  ownerId: string,
  projectId: string,
): { doc: EngineDoc; files: Record<string, string> } | null {
  if (!ownedRow(ownerId, projectId)) return null;
  const db = database();
  const document = db
    .prepare("SELECT doc_json FROM documents WHERE project_id = ?")
    .get(projectId) as { doc_json: string } | undefined;
  if (!document) return null;
  const assets = db
    .prepare("SELECT file_id, data_url FROM assets WHERE project_id = ?")
    .all(projectId) as { file_id: string; data_url: string }[];
  const files: Record<string, string> = {};
  for (const asset of assets) files[asset.file_id] = asset.data_url;
  return { doc: JSON.parse(document.doc_json) as EngineDoc, files };
}

export function deleteOwnedProject(ownerId: string, projectId: string): boolean {
  const result = database()
    .prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?")
    .run(projectId, ownerId);
  return Number(result.changes) > 0;
}

function ownedRow(ownerId: string, projectId: string): ProjectRow | null {
  const row = database()
    .prepare(
      `SELECT id, owner_id, name, created_at, updated_at, last_opened_at, thumbnail, slide_count, schema_version
       FROM projects WHERE id = ?`,
    )
    .get(projectId) as ProjectRow | undefined;
  if (!row || row.owner_id !== ownerId) return null;
  return row;
}

function toMetadata(row: ProjectRow): ProjectMetadata {
  return {
    id: row.id,
    ownerKey: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    thumbnail: row.thumbnail ?? undefined,
    slideCount: row.slide_count ?? undefined,
    schemaVersion: row.schema_version,
  };
}
