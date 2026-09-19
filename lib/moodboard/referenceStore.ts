export type MoodboardReference = {
  id: string;
  src: string;
  title: string;
  sourceUrl?: string;
  origin: "upload" | "url" | "pinterest";
  createdAt: number;
};

const STORAGE_KEY = "artshift.moodboard.references.v1";

export function listMoodboardReferences(): MoodboardReference[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isReference) : [];
  } catch {
    return [];
  }
}

export function saveMoodboardReference(
  input: Omit<MoodboardReference, "id" | "createdAt">,
): MoodboardReference {
  const next: MoodboardReference = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const items = [next, ...listMoodboardReferences()].slice(0, 80);
  persist(items);
  return next;
}

export function removeMoodboardReference(id: string): void {
  persist(listMoodboardReferences().filter((item) => item.id !== id));
}

export function classifyReferenceUrl(url: string): MoodboardReference["origin"] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("pinterest.") || host.includes("pinimg.com")) return "pinterest";
  } catch {
    // keep url
  }
  return "url";
}

function persist(items: MoodboardReference[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function isReference(value: unknown): value is MoodboardReference {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.src === "string";
}
