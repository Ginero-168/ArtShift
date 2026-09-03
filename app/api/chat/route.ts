import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_CHAT_REMOVED = "LEGACY_CHAT_REMOVED";

/**
 * Compatibility tombstone for the retired chat endpoint. The live editor uses
 * `/api/design-agent` and applies only validated, reviewable plans.
 */
export async function POST(_request: NextRequest) {
  return jsonNoStore(
    {
      error: "This chat endpoint has been retired. Use the unified AI Assistance flow.",
      code: LEGACY_CHAT_REMOVED,
    },
    { status: 410 },
  );
}
