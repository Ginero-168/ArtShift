import { type NextRequest, NextResponse } from "next/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const generateLimiter = new RateLimiter(30, 60_000);

const ALLOWED_GEMINI_ACTIONS = ["generateContent", "countTokens", "embedContent"];
const ALLOWED_GEMINI_FIELDS = [
  "contents",
  "systemInstruction",
  "generationConfig",
  "safetySettings",
  "tools",
  "toolConfig",
];

export async function POST(req: NextRequest) {
  const limit = generateLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY || "";
  if (!geminiKey) {
    return NextResponse.json({ error: "Server missing GEMINI_API_KEY" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { model, action, ...geminiPayload } = body;
  if (typeof model !== "string" || !model) {
    return NextResponse.json({ error: "Missing model in payload" }, { status: 400 });
  }

  const actionName = typeof action === "string" ? action : "generateContent";
  if (!ALLOWED_GEMINI_ACTIONS.includes(actionName)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Strip any unexpected fields from the upstream payload to prevent injection.
  const sanitizedPayload: Record<string, unknown> = {};
  for (const key of Object.keys(geminiPayload)) {
    if (ALLOWED_GEMINI_FIELDS.includes(key)) {
      sanitizedPayload[key] = geminiPayload[key];
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${encodeURIComponent(actionName)}?key=${geminiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedPayload),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("Gemini call failed:", err);
    return NextResponse.json({ error: "Upstream Gemini request failed" }, { status: 502 });
  }
}
