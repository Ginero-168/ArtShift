import { type NextRequest, NextResponse } from "next/server";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { type PublicAiExecuteRequest, parsePublicAiExecuteRequest } from "@/lib/ai-runtime/schemas";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_500_000;
const executeLimiter = new RateLimiter(20, 60_000);

export async function POST(req: NextRequest) {
  const limit = executeLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: { code: "PROVIDER_RATE_LIMIT", message: "Rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return invalidRequest("AI request body is too large.", 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES)
      return invalidRequest("AI request body is too large.", 413);
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  const request = parsePublicAiExecuteRequest(body);
  if (!request) return invalidRequest("Invalid AI task payload.");

  try {
    const execution = await executePublicTask(request, req.signal);
    return NextResponse.json({ execution });
  } catch (error) {
    const normalized =
      error instanceof AiRuntimeError
        ? error
        : new AiRuntimeError("PROVIDER_UNAVAILABLE", "AI execution failed.", { cause: error });
    return NextResponse.json(
      { error: { code: normalized.code, message: normalized.message } },
      { status: errorStatus(normalized) },
    );
  }
}

function executePublicTask(request: PublicAiExecuteRequest, signal: AbortSignal) {
  const ai = getServerAiRuntime();
  const options = { ...request.options, signal };
  switch (request.task) {
    case "vision.describe":
      return ai.execute(request.task, request.input, options);
    case "vision.propose":
      return ai.execute(request.task, request.input, options);
    case "vision.ocr":
      return ai.execute(request.task, request.input, options);
    case "prompt.enhance":
      return ai.execute(request.task, request.input, options);
    case "image.generate":
      return ai.execute(request.task, request.input, options);
  }
}

function invalidRequest(message: string, status = 400) {
  return NextResponse.json({ error: { code: "INVALID_INPUT", message } }, { status });
}

function errorStatus(error: AiRuntimeError): number {
  switch (error.code) {
    case "INVALID_INPUT":
      return 400;
    case "POLICY_DENIED":
      return 403;
    case "PROVIDER_AUTH":
    case "NO_PROVIDER":
      return 503;
    case "PROVIDER_RATE_LIMIT":
      return 429;
    case "BUDGET_EXCEEDED":
      return 402;
    case "ABORTED":
      return 499;
    case "TIMEOUT":
      return 504;
    default:
      return 502;
  }
}
