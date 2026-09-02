import type { NextRequest } from "next/server";
import { clearAuthCookie } from "@/lib/server/auth/session";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const response = jsonNoStore({ authenticated: false, user: null });
  clearAuthCookie(response);
  return response;
}
