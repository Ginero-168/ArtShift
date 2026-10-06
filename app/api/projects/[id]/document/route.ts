import type { NextRequest } from "next/server";
import type { EngineDoc } from "@/lib/engine/types";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";
import {
  ProjectAccessError,
  readOwnedDocument,
  saveOwnedDocument,
} from "@/lib/server/projects/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 48 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const { id } = await context.params;
  const record = readOwnedDocument(account.id, id);
  if (!record) return jsonNoStore({ error: "Project not found" }, { status: 404 });
  return jsonNoStore(record);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return jsonNoStore({ error: "Project is larger than 48 MB." }, { status: 413 });
  }
  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as {
    doc?: EngineDoc;
    files?: Record<string, string>;
    thumbnail?: string;
  } | null;
  if (!body?.doc || typeof body.doc !== "object" || !body.files || typeof body.files !== "object") {
    return jsonNoStore({ error: "Document payload is required." }, { status: 400 });
  }
  try {
    const savedAt = saveOwnedDocument(
      account.id,
      id,
      body.doc,
      body.files,
      typeof body.thumbnail === "string" ? body.thumbnail : undefined,
    );
    return jsonNoStore({ ok: true, savedAt });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return jsonNoStore({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes("48 MB")) {
      return jsonNoStore({ error: error.message }, { status: 413 });
    }
    throw error;
  }
}
