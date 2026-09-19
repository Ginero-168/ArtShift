import { NextResponse } from "next/server";
import { PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clientId =
    process.env.PINTEREST_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_PINTEREST_CLIENT_ID?.trim() ||
    "";
  return NextResponse.json({
    oauthConfigured: Boolean(clientId),
    officialSavedPins: PINTEREST_API_STATUS.officialSavedPins,
    userPaste: PINTEREST_API_STATUS.userPaste,
    scrape: PINTEREST_API_STATUS.scrape,
  });
}
