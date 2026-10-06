import type { NextRequest } from "next/server";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { jsonNoStore } from "@/lib/server/http";
import { listOwnedProjects } from "@/lib/server/projects/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = getUserAccount(req);
  if (!account) return jsonNoStore({ error: "Authentication is required." }, { status: 401 });
  return jsonNoStore({ projects: listOwnedProjects(account.id) });
}
