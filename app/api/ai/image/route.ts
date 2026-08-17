import { type NextRequest, NextResponse } from "next/server";
import { enrichPrompt } from "@/lib/ai/pollinations";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const imageGenLimiter = new RateLimiter(30, 60_000);

export async function POST(req: NextRequest) {
  const limit = imageGenLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPrompt = typeof body.prompt === "string" ? body.prompt : "beautiful artwork";
  const width = typeof body.width === "number" ? Math.min(1280, Math.max(256, body.width)) : 1024;
  const height =
    typeof body.height === "number" ? Math.min(1280, Math.max(256, body.height)) : 1024;
  const model = typeof body.model === "string" ? body.model : "flux";

  const cleanPrompt = enrichPrompt(rawPrompt);
  const seed = Math.floor(Math.random() * 10_000_000);

  // Try Pollinations primary models with retry/fallback
  const candidateModels = [model, "flux", "turbo"];
  let imageBuffer: ArrayBuffer | null = null;
  let contentType = "image/jpeg";

  for (const m of candidateModels) {
    const encoded = encodeURIComponent(cleanPrompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&model=${m}&nologo=true`;

    try {
      const upstreamRes = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(25_000),
      });

      if (upstreamRes.ok) {
        const ct = upstreamRes.headers.get("content-type");
        if (ct && (ct.startsWith("image/") || ct === "application/octet-stream")) {
          imageBuffer = await upstreamRes.arrayBuffer();
          if (imageBuffer.byteLength > 1000) {
            contentType = ct.startsWith("image/") ? ct : "image/jpeg";
            break;
          }
        }
      }
    } catch {
      // Try next candidate model
    }
  }

  // Fallback: If AI upstream fails, fetch from Unsplash stock source
  if (!imageBuffer) {
    try {
      const unsplashUrl = `https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=${width}&h=${height}&fit=crop&q=80`;
      const stockRes = await fetch(unsplashUrl, { signal: AbortSignal.timeout(10_000) });
      if (stockRes.ok) {
        imageBuffer = await stockRes.arrayBuffer();
        contentType = "image/jpeg";
      }
    } catch {
      // fallback failed
    }
  }

  if (!imageBuffer || imageBuffer.byteLength === 0) {
    return NextResponse.json(
      { error: "Failed to generate image from AI servers. Please try again." },
      { status: 502 },
    );
  }

  const base64 = Buffer.from(imageBuffer).toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  return NextResponse.json({
    success: true,
    dataUrl,
    prompt: cleanPrompt,
    width,
    height,
    seed,
  });
}
