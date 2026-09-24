import type { NextRequest } from "next/server";
import { adminChangeCredits } from "@/lib/credits/ledger";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getAccountById } from "@/lib/server/auth/accountStore";
import { requireAdmin } from "@/lib/server/auth/admin";
import { jsonNoStore } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const account = getAccountById(id);
  if (!account) return jsonNoStore({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await readBoundedJson(req, 8_000);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonNoStore({ error: "Request is too large." }, { status: 413 });
    }
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonNoStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const mode = record.mode === "adjust" ? "adjust" : record.mode === "top_up" ? "top_up" : null;
  if (!mode) return jsonNoStore({ error: "mode must be top_up or adjust." }, { status: 400 });
  if (typeof record.amount !== "number" || typeof record.reason !== "string") {
    return jsonNoStore({ error: "amount and reason are required." }, { status: 400 });
  }

  const result = adminChangeCredits({
    accountId: account.id,
    mode,
    amount: record.amount,
    reason: record.reason,
    actorEmail: admin.account.email,
  });
  if (!result.ok) return jsonNoStore({ error: result.error }, { status: 400 });
  return jsonNoStore({ balance: result.balance, entry: result.entry });
}
