import type { NextRequest } from "next/server";
import type { ProjectMetadata } from "@/lib/project/projectStore";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";
import {
  deleteOwnedProject,
  getOwnedProject,
  ProjectAccessError,
  upsertOwnedProject,
} from "@/lib/server/projects/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const { id } = await context.params;
  const project = getOwnedProject(account.id, id);
  if (!project) return jsonNoStore({ error: "Project not found" }, { status: 404 });
  return jsonNoStore({ project });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as Partial<ProjectMetadata> | null;
  if (!body || typeof body.name !== "string") {
    return jsonNoStore({ error: "Project name is required." }, { status: 400 });
  }
  try {
    const project = upsertOwnedProject(account.id, {
      id,
      ownerKey: account.id,
      name: body.name,
      createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
      updatedAt: typeof body.updatedAt === "number" ? body.updatedAt : Date.now(),
      lastOpenedAt: typeof body.lastOpenedAt === "number" ? body.lastOpenedAt : Date.now(),
      thumbnail: typeof body.thumbnail === "string" ? body.thumbnail : undefined,
      slideCount: typeof body.slideCount === "number" ? body.slideCount : undefined,
      schemaVersion: typeof body.schemaVersion === "number" ? body.schemaVersion : 1,
    });
    return jsonNoStore({ project });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return jsonNoStore({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const { id } = await context.params;
  const deleted = deleteOwnedProject(account.id, id);
  if (!deleted) return jsonNoStore({ error: "Project not found" }, { status: 404 });
  return jsonNoStore({ ok: true });
}
