export type AIMode = "eco" | "fast";

export const AI_MODE_STORAGE_KEY = "artshift:ai-mode:v1";

export const AI_MODE_CONFIG: Record<
  AIMode,
  {
    icon: string;
    label: string;
    description: string;
    accent: string;
  }
> = {
  eco: {
    icon: "🍃",
    label: "Eco",
    description: "Local-first, free, and runs on this device where supported",
    accent: "#15803d",
  },
  fast: {
    icon: "∞",
    label: "Fast",
    description: "Uses the configured paid API for faster planning and composition",
    accent: "#4f46e5",
  },
};

export function loadAIMode(): AIMode {
  if (typeof window === "undefined") return "eco";
  const value = window.localStorage.getItem(AI_MODE_STORAGE_KEY);
  return value === "fast" || value === "eco" ? value : "eco";
}

export function saveAIMode(mode: AIMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_MODE_STORAGE_KEY, mode);
}
