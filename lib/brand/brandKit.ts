/**
 * Publisher Brand Kit System for ArtShift.
 * Manages publisher identities, color tokens, typography rules, logos, and governance policies.
 */

export type BrandColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
};

export type BrandTypography = {
  headerFont: string;
  bodyFont: string;
  badgeFont: string;
};

export type BrandLogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type BrandLogo = {
  dataUrl?: string;
  position: BrandLogoPosition;
  size: number; // width in px
  opacity: number;
};

export type BrandRules = {
  requireLogo: boolean;
  requireIsbn: boolean;
  requirePriceNotice: boolean;
  minContrastRatio: number; // 4.5 for WCAG AA
};

export type BrandKit = {
  id: string;
  name: string;
  publisherName: string;
  tagline?: string;
  colors: BrandColors;
  typography: BrandTypography;
  logo: BrandLogo;
  rules: BrandRules;
};

export const BRAND_KIT_STORAGE_KEY = "artshift:active-brand-kit";

export const DEFAULT_PUBLISHER_LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 48" width="160" height="48"><rect width="160" height="48" rx="8" fill="%230f172a"/><path d="M24 16 L32 32 L16 32 Z" fill="%23f59e0b"/><text x="44" y="30" fill="%23f8fafc" font-size="16" font-family="sans-serif" font-weight="bold">PUBLISHER</text></svg>`;

export const PRESET_BRAND_KITS: BrandKit[] = [
  {
    id: "siam-editorial",
    name: "Siam Editorial (วรรณกรรม & ประวัติศาสตร์)",
    publisherName: "สำนักพิมพ์สยามวรรณ",
    tagline: "ส่งต่อคุณค่าแห่งตัวอักษร",
    colors: {
      primary: "#1e293b",
      secondary: "#475569",
      accent: "#d97706",
      background: "#fbf8f3",
      surface: "#ffffff",
      text: "#1c1917",
    },
    typography: {
      headerFont: "Prompt, sans-serif",
      bodyFont: "Sarabun, sans-serif",
      badgeFont: "Prompt, sans-serif",
    },
    logo: {
      dataUrl: DEFAULT_PUBLISHER_LOGO_SVG,
      position: "top-right",
      size: 140,
      opacity: 0.95,
    },
    rules: {
      requireLogo: true,
      requireIsbn: true,
      requirePriceNotice: true,
      minContrastRatio: 4.5,
    },
  },
  {
    id: "tech-business",
    name: "Tech & Business Imprint (ธุรกิจ & นวัตกรรม)",
    publisherName: "NextGen Books",
    tagline: "Empowering Modern Leaders",
    colors: {
      primary: "#0f172a",
      secondary: "#334155",
      accent: "#0284c7",
      background: "#0b0f19",
      surface: "#1e293b",
      text: "#f8fafc",
    },
    typography: {
      headerFont: "Kanit, sans-serif",
      bodyFont: "Inter, sans-serif",
      badgeFont: "Kanit, sans-serif",
    },
    logo: {
      dataUrl: DEFAULT_PUBLISHER_LOGO_SVG,
      position: "top-right",
      size: 140,
      opacity: 0.9,
    },
    rules: {
      requireLogo: true,
      requireIsbn: false,
      requirePriceNotice: false,
      minContrastRatio: 4.5,
    },
  },
  {
    id: "fiction-fantasy",
    name: "Fantasy & Romance House (นิยาย & แฟนตาซี)",
    publisherName: "Rosewood Fiction",
    tagline: "มนตร์เสน่ห์แห่งเรื่องราว",
    colors: {
      primary: "#881337",
      secondary: "#be123c",
      accent: "#fb7185",
      background: "#fff1f2",
      surface: "#ffffff",
      text: "#4c0519",
    },
    typography: {
      headerFont: "Prompt, sans-serif",
      bodyFont: "Sarabun, sans-serif",
      badgeFont: "Prompt, sans-serif",
    },
    logo: {
      dataUrl: DEFAULT_PUBLISHER_LOGO_SVG,
      position: "bottom-right",
      size: 130,
      opacity: 0.9,
    },
    rules: {
      requireLogo: true,
      requireIsbn: true,
      requirePriceNotice: false,
      minContrastRatio: 3.5,
    },
  },
  {
    id: "minimalist-press",
    name: "Minimalist Books (มินิมอล & พัฒนาตนเอง)",
    publisherName: "Simplicity Press",
    tagline: "Read Less, Understand More",
    colors: {
      primary: "#18181b",
      secondary: "#71717a",
      accent: "#059669",
      background: "#fafafa",
      surface: "#ffffff",
      text: "#09090b",
    },
    typography: {
      headerFont: "Inter, sans-serif",
      bodyFont: "Prompt, sans-serif",
      badgeFont: "Inter, sans-serif",
    },
    logo: {
      dataUrl: DEFAULT_PUBLISHER_LOGO_SVG,
      position: "top-left",
      size: 120,
      opacity: 0.85,
    },
    rules: {
      requireLogo: false,
      requireIsbn: true,
      requirePriceNotice: false,
      minContrastRatio: 4.5,
    },
  },
];

let memoryActiveBrandKit: BrandKit = { ...PRESET_BRAND_KITS[0] };

export function getActiveBrandKit(): BrandKit {
  if (typeof window === "undefined") return memoryActiveBrandKit;
  try {
    const raw = localStorage.getItem(BRAND_KIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.colors) {
        memoryActiveBrandKit = parsed;
        return parsed;
      }
    }
  } catch (_e) {
    // fallback
  }
  return memoryActiveBrandKit;
}

export function saveActiveBrandKit(kit: BrandKit): void {
  memoryActiveBrandKit = kit;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(kit));
    } catch (_e) {
      // quota
    }
  }
}
