import { getAccountById } from "@/lib/server/auth/accountStore";

/** Operator account. Spend does not debit a balance. */
const UNLIMITED_CREDIT_EMAILS = new Set(["mhoomheemah@gmail.com"]);

export function isUnlimitedCreditEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return UNLIMITED_CREDIT_EMAILS.has(email.trim().toLowerCase());
}

export function accountHasUnlimitedCredits(accountId: string): boolean {
  return isUnlimitedCreditEmail(getAccountById(accountId)?.email);
}
