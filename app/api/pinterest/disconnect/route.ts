import { jsonNoStore } from "@/lib/server/http";
import { clearPinterestSessionCookie } from "@/lib/server/pinterest/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = jsonNoStore({ connected: false });
  clearPinterestSessionCookie(response);
  return response;
}
