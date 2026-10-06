import type { EngineDoc } from "@/lib/engine/types";
import type { ProjectMetadata, ProjectStoreBackend } from "./projectStore";

async function requestJson(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

export class HttpProjectBackend implements ProjectStoreBackend {
  async list(): Promise<ProjectMetadata[]> {
    const response = await requestJson("/api/projects");
    if (!response.ok) throw new Error(await errorMessage(response, "Could not list projects."));
    const body = (await response.json()) as { projects: ProjectMetadata[] };
    return body.projects;
  }

  async get(projectId: string): Promise<ProjectMetadata | null> {
    const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await errorMessage(response, "Could not open project."));
    const body = (await response.json()) as { project: ProjectMetadata };
    return body.project;
  }

  async putProject(metadata: ProjectMetadata): Promise<void> {
    const response = await requestJson(`/api/projects/${encodeURIComponent(metadata.id)}`, {
      method: "PUT",
      body: JSON.stringify(metadata),
    });
    if (!response.ok) throw new Error(await errorMessage(response, "Could not save project."));
  }

  async delete(projectId: string): Promise<void> {
    const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(await errorMessage(response, "Could not delete project."));
  }

  async getDocument(
    projectId: string,
  ): Promise<{ doc: EngineDoc; files: Record<string, string> } | null> {
    const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/document`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await errorMessage(response, "Could not load project."));
    return (await response.json()) as { doc: EngineDoc; files: Record<string, string> };
  }

  async saveDocument(
    projectId: string,
    _ownerKey: string,
    doc: EngineDoc,
    files: Record<string, string>,
    thumbnail?: string,
  ): Promise<number> {
    const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/document`, {
      method: "PUT",
      body: JSON.stringify({ doc, files, thumbnail }),
    });
    if (!response.ok) throw new Error(await errorMessage(response, "Could not save project."));
    const body = (await response.json()) as { savedAt: number };
    return body.savedAt;
  }

  async clearAll(): Promise<void> {
    const projects = await this.list();
    for (const project of projects) await this.delete(project.id);
  }
}
