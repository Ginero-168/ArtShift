import { createHash, timingSafeEqual } from "node:crypto";

export const CATALOG_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const CATALOG_WEBHOOK_MAX_BOOKS = 50;
export const CATALOG_WEBHOOK_SECRET_HEADER = "x-catalog-webhook-secret";

export function catalogWebhookSecretConfigured(): boolean {
  return Boolean(process.env.CATALOG_WEBHOOK_SECRET?.trim());
}

export function catalogWebhookSecretMatches(provided: string | null | undefined): boolean {
  const expected = process.env.CATALOG_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected || typeof provided !== "string" || !provided) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}
