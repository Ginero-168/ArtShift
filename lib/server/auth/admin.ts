import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { AccountPublic } from "@/lib/server/auth/accountStore";
import { getAuthenticatedAccount } from "@/lib/server/auth/session";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

/**
 * Missing session and non-admin sessions both look like a missing page.
 * The admin surface should not advertise itself to other accounts.
 */
export function requireAdmin(
  req: NextRequest,
): { ok: true; account: AccountPublic } | { ok: false; response: NextResponse } {
  const account = getAuthenticatedAccount(req);
  if (!account || !isAdminEmail(account.email)) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { ok: true, account };
}
