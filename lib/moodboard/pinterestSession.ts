export type PinterestSession = {
  connected: boolean;
  mode: "oauth" | "local";
  connectedAt: number | null;
};

const STORAGE_KEY = "artshift.pinterest.session.v1";

export const EMPTY_PINTEREST_SESSION: PinterestSession = {
  connected: false,
  mode: "local",
  connectedAt: null,
};

export function readPinterestSession(): PinterestSession {
  if (typeof window === "undefined") return EMPTY_PINTEREST_SESSION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PinterestSession>) : null;
    if (!parsed || typeof parsed !== "object") return EMPTY_PINTEREST_SESSION;
    return {
      connected: parsed.connected === true,
      mode: parsed.mode === "oauth" ? "oauth" : "local",
      connectedAt: typeof parsed.connectedAt === "number" ? parsed.connectedAt : null,
    };
  } catch {
    return EMPTY_PINTEREST_SESSION;
  }
}

export function connectPinterestSession(
  mode: PinterestSession["mode"] = "local",
): PinterestSession {
  const next: PinterestSession = { connected: true, mode, connectedAt: Date.now() };
  persist(next);
  return next;
}

export function disconnectPinterestSession(): PinterestSession {
  persist(EMPTY_PINTEREST_SESSION);
  return EMPTY_PINTEREST_SESSION;
}

function persist(session: PinterestSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
