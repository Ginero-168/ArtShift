/**
 * Client-side cloud-AI consent.
 *
 * Stored preference (AI Provider Settings) survives reloads.
 * A one-time session confirm is enough for the rest of the tab.
 * Local-only chat/canvas paths must not call `ensureCloudConsent`.
 */

export const CLOUD_CONSENT_STORAGE_KEY = "artshift:cloud-consent";
export const CLOUD_CONSENT_SESSION_KEY = "artshift:cloud-consent-session";

export const CLOUD_CONSENT_PROMPT =
  "งานนี้จะส่งคำสั่งไปยัง Gemini 3 Flash Creative Director เพื่อวางแผน อาจค้น Reference ผ่าน Unsplash/Pexels เมื่อจำเป็น แล้วเรียก Image Model เพื่อสร้างและตรวจผลลัพธ์\n\nอนุญาตให้ส่ง prompt และภาพออกนอกเครื่องในเซสชันนี้หรือไม่?";

function readFlag(storage: Storage | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "granted";
  } catch {
    return false;
  }
}

function writeFlag(storage: Storage | undefined, key: string, granted: boolean): void {
  if (!storage) return;
  try {
    if (granted) storage.setItem(key, "granted");
    else storage.removeItem(key);
  } catch {
    // Private mode / quota — consent stays in-memory for this call only.
  }
}

export function hasStoredCloudConsent(): boolean {
  if (typeof window === "undefined") return false;
  return (
    readFlag(window.localStorage, CLOUD_CONSENT_STORAGE_KEY) ||
    readFlag(window.sessionStorage, CLOUD_CONSENT_SESSION_KEY)
  );
}

/** Persist a durable account/browser preference from AI Provider Settings. */
export function setAccountCloudConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  writeFlag(window.localStorage, CLOUD_CONSENT_STORAGE_KEY, granted);
  if (granted) writeFlag(window.sessionStorage, CLOUD_CONSENT_SESSION_KEY, true);
  else writeFlag(window.sessionStorage, CLOUD_CONSENT_SESSION_KEY, false);
}

export function setSessionCloudConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  writeFlag(window.sessionStorage, CLOUD_CONSENT_SESSION_KEY, granted);
}

/**
 * Return stored consent, or ask once per session via `window.confirm`.
 * Callers must thread the boolean into Director / image-gen requests.
 */
export function ensureCloudConsent(message: string = CLOUD_CONSENT_PROMPT): boolean {
  if (hasStoredCloudConsent()) return true;
  if (typeof window === "undefined") return false;
  const granted = window.confirm(message);
  if (granted) setSessionCloudConsent(true);
  return granted;
}
