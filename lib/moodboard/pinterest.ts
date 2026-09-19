/**
 * Pinterest intake — honest first slice.
 *
 * Official saved-Pins / board APIs require a Pinterest developer app with
 * partner review. ArtShift does not scrape Pinterest or Google Images.
 *
 * This module only classifies Pin URLs the user already copied and stores
 * them locally until OAuth is available.
 */

export const PINTEREST_API_STATUS = {
  officialSavedPins: "blocked_pending_app_review",
  userPaste: "supported",
  scrape: "not_supported",
} as const;

export function isPinterestUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes("pinterest.") || host.includes("pinimg.com");
  } catch {
    return false;
  }
}
