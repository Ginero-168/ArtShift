import { NextResponse } from "next/server";
import { PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clientId =
    process.env.PINTEREST_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_PINTEREST_CLIENT_ID?.trim() ||
    "";
  if (!clientId) {
    return NextResponse.json(
      {
        error: "Pinterest OAuth is not configured.",
        officialSavedPins: PINTEREST_API_STATUS.officialSavedPins,
      },
      { status: 501 },
    );
  }
  return NextResponse.json(
    {
      error: "Pinterest OAuth redirect is reserved until the app passes partner review.",
      officialSavedPins: PINTEREST_API_STATUS.officialSavedPins,
    },
    { status: 501 },
  );
}
