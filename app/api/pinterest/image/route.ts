import { type NextRequest, NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/http";
import { withPinterestSession } from "@/lib/server/pinterest/guard";
import { allowlistedPinImageUrl, downloadPinImage } from "@/lib/server/pinterest/imageProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withPinterestSession(req, "Could not download the Pin.", async () => {
    const target = allowlistedPinImageUrl(req.nextUrl.searchParams.get("src") ?? "");
    if (!target) {
      return jsonNoStore({ error: "Pin image URL is not allowed." }, { status: 400 });
    }
    const image = await downloadPinImage(target, req.signal);
    const body = new ArrayBuffer(image.bytes.byteLength);
    new Uint8Array(body).set(image.bytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
