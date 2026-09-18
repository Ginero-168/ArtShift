import type { EngineDoc } from "../engine/types";
import type { ProjectMetadata } from "./projectStore";

export type PresentProjectStore = {
  listProjects(ownerKey?: string): Promise<ProjectMetadata[]>;
  loadProjectDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null>;
};

export type PresentLoadResult =
  | { status: "loaded"; doc: EngineDoc; projectId: string; name?: string }
  | { status: "empty" }
  | { status: "missing"; projectId: string };

/**
 * Resolve the document to present: explicit projectId, else last-opened project.
 * `loadProjectDocument` hydrates image binaries into the engine cache.
 */
export async function loadPresentDocument(
  store: PresentProjectStore,
  projectId?: string | null,
): Promise<PresentLoadResult> {
  const requested = projectId?.trim() ?? "";
  if (requested) {
    const loaded = await store.loadProjectDocument(requested);
    if (!loaded) return { status: "missing", projectId: requested };
    return { status: "loaded", doc: loaded.doc, projectId: requested, name: loaded.doc.title };
  }

  const projects = await store.listProjects();
  const latest = projects[0];
  if (!latest) return { status: "empty" };
  const loaded = await store.loadProjectDocument(latest.id);
  if (!loaded) return { status: "missing", projectId: latest.id };
  return {
    status: "loaded",
    doc: loaded.doc,
    projectId: latest.id,
    name: latest.name,
  };
}
