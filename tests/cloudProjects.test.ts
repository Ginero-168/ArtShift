// @vitest-environment node

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as listProjects } from "@/app/api/projects/route";
import { createEmptyEngineDoc } from "@/lib/engine/store";
import type { ProjectMetadata } from "@/lib/project/projectStore";
import {
  deleteOwnedProject,
  getOwnedProject,
  listOwnedProjects,
  ProjectAccessError,
  readOwnedDocument,
  saveOwnedDocument,
  upsertOwnedProject,
} from "@/lib/server/projects/store";

beforeAll(() => {
  process.env.ARTSHIFT_PROJECT_DB_PATH = join(
    mkdtempSync(join(tmpdir(), "artshift-projects-")),
    "projects.sqlite",
  );
});

function metadata(id: string, name: string): ProjectMetadata {
  const now = Date.now();
  return {
    id,
    ownerKey: "ignored",
    name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    schemaVersion: 1,
  };
}

describe("cloud projects", () => {
  it("keeps a project on the account that saved it", () => {
    const saved = upsertOwnedProject("account-a", metadata("poster", "Poster"));
    const doc = createEmptyEngineDoc("Poster");
    doc.id = "poster";
    doc.updatedAt = saved.updatedAt;
    saveOwnedDocument("account-a", "poster", doc, { "file-1": "data:image/png;base64,aaa" });

    expect(listOwnedProjects("account-a").map((project) => project.name)).toEqual(["Poster"]);
    expect(listOwnedProjects("account-b")).toEqual([]);
    expect(getOwnedProject("account-b", "poster")).toBeNull();
    expect(() => upsertOwnedProject("account-b", metadata("poster", "Stolen"))).toThrow(
      ProjectAccessError,
    );
    expect(readOwnedDocument("account-a", "poster")?.files["file-1"]).toBe(
      "data:image/png;base64,aaa",
    );
    expect(readOwnedDocument("account-b", "poster")).toBeNull();
    expect(deleteOwnedProject("account-b", "poster")).toBe(false);
    expect(getOwnedProject("account-a", "poster")?.name).toBe("Poster");
  });

  it("rejects a project list without a session", async () => {
    const response = await listProjects(new NextRequest("http://localhost/api/projects"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication is required." });
  });
});
