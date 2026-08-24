import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The old route accepted provider-native Gemini payloads and arbitrary model IDs.
 * Keep an explicit tombstone so stale clients fail safely instead of silently
 * bypassing ArtShift task policy, model aliases and budget controls.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This provider passthrough was retired. Use POST /api/ai/execute with an ArtShift task.",
      replacement: "/api/ai/execute",
    },
    { status: 410 },
  );
}
