import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

let openCvSource: Promise<Buffer> | null = null;

function readOpenCvSource(): Promise<Buffer> {
  openCvSource ??= readFile(
    path.join(process.cwd(), "node_modules", "@techstark", "opencv-js", "dist", "opencv.js"),
  );
  return openCvSource;
}

export async function GET() {
  try {
    const source = await readOpenCvSource();
    return new NextResponse(new Uint8Array(source), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(source.byteLength),
        "Content-Type": "application/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "OpenCV.js is unavailable" }, { status: 503 });
  }
}
