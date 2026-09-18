import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_CONSENT_PROMPT,
  CLOUD_CONSENT_SESSION_KEY,
  CLOUD_CONSENT_STORAGE_KEY,
  ensureCloudConsent,
  hasStoredCloudConsent,
  setAccountCloudConsent,
  setSessionCloudConsent,
} from "@/lib/ai/cloudConsent";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("cloud consent helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses a stored AI Provider Settings flag without prompting", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    local.setItem(CLOUD_CONSENT_STORAGE_KEY, "granted");
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session, confirm: vi.fn() });
    const confirm = window.confirm as ReturnType<typeof vi.fn>;

    expect(hasStoredCloudConsent()).toBe(true);
    expect(ensureCloudConsent()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks once per session and remembers the grant", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session, confirm });

    expect(ensureCloudConsent(CLOUD_CONSENT_PROMPT)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(session.getItem(CLOUD_CONSENT_SESSION_KEY)).toBe("granted");
    expect(ensureCloudConsent()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not grant consent when the user cancels", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("window", {
      localStorage: local,
      sessionStorage: session,
      confirm: vi.fn(() => false),
    });

    expect(ensureCloudConsent()).toBe(false);
    expect(hasStoredCloudConsent()).toBe(false);
    expect(session.getItem(CLOUD_CONSENT_SESSION_KEY)).toBeNull();
  });

  it("persists and clears the account-level preference", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session, confirm: vi.fn() });

    setAccountCloudConsent(true);
    expect(local.getItem(CLOUD_CONSENT_STORAGE_KEY)).toBe("granted");
    setAccountCloudConsent(false);
    expect(local.getItem(CLOUD_CONSENT_STORAGE_KEY)).toBeNull();
    setSessionCloudConsent(true);
    expect(session.getItem(CLOUD_CONSENT_SESSION_KEY)).toBe("granted");
  });
});
