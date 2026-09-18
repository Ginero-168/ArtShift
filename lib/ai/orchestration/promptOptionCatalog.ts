/**
 * Visual option catalog for Prompt Helper.
 * Prefers Replicate-generated thumbnails stored on the VPS; falls back to SVG/swatch chips.
 */

import { promptHelperThumbSrc } from "./promptHelperThumbManifest";

export type OptionPreview =
  | {
      kind: "swatch";
      /** 2–4 CSS colors for a gradient chip */
      colors: readonly string[];
      accent?: string;
    }
  | {
      kind: "svg";
      /** Compact inline SVG body (viewBox 0 0 64 40) */
      svg: string;
    }
  | {
      kind: "image";
      /** VPS-hosted thumbnail under /prompt-helper/thumbs */
      src: string;
      alt?: string;
    };

export type CatalogOption = {
  id: string;
  label: string;
  /** Short character label shown under thumbnail */
  character?: string;
  modifier: string;
  preview: OptionPreview;
  /** Which variant axis this option belongs to (methodology Layer 2) */
  axis?:
    | "tone"
    | "background"
    | "camera"
    | "style"
    | "mood"
    | "structure"
    | "density"
    | "signature";
};

/** Layer-1 Shared Anchors inferred from the brief (locked — not pickable variants). */
export type SharedAnchorHint = {
  id: string;
  label: string;
  detail: string;
};

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" width="64" height="40" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

/** Shared visual library — keyed by option id across all presets. */
export const OPTION_PREVIEW_LIBRARY: Record<string, OptionPreview> = {
  // —— Tone / color ——
  vibrant: { kind: "swatch", colors: ["#FF6B35", "#F7C948", "#2EC4B6"] },
  pastel: { kind: "swatch", colors: ["#F8C8DC", "#C9E4DE", "#F7E1AE"] },
  earth: { kind: "swatch", colors: ["#8B5E3C", "#C4A484", "#E8D5B7"] },
  dark: { kind: "swatch", colors: ["#0F172A", "#334155", "#64748B"] },
  neon: { kind: "swatch", colors: ["#FF00E5", "#00F0FF", "#1A0533"] },
  orange: { kind: "swatch", colors: ["#F97316", "#FB923C", "#FED7AA"] },
  black: { kind: "swatch", colors: ["#111827", "#1F2937", "#9CA3AF"] },
  gray: { kind: "swatch", colors: ["#9CA3AF", "#D1D5DB", "#F3F4F6"] },
  white: { kind: "swatch", colors: ["#FFFFFF", "#F8FAFC", "#E2E8F0"] },
  tabby: { kind: "swatch", colors: ["#92400E", "#D97706", "#FDE68A"] },
  calico: { kind: "swatch", colors: ["#F97316", "#111827", "#F8FAFC"] },
  "golden-color": { kind: "swatch", colors: ["#EAB308", "#FDE68A", "#FEF3C7"] },
  "black-color": { kind: "swatch", colors: ["#111827", "#374151"] },
  "brown-color": { kind: "swatch", colors: ["#78350F", "#B45309", "#FCD34D"] },
  "white-color": { kind: "swatch", colors: ["#FFFFFF", "#F1F5F9"] },

  // —— Extra color / fur tones ——
  cream: { kind: "swatch", colors: ["#FEF3C7", "#FDE68A", "#F8FAFC"] },
  silver: { kind: "swatch", colors: ["#CBD5E1", "#94A3B8", "#F8FAFC"] },
  chocolate: { kind: "swatch", colors: ["#78350F", "#92400E", "#D97706"] },
  "blue-gray": { kind: "swatch", colors: ["#64748B", "#94A3B8", "#E2E8F0"] },
  "ginger-white": { kind: "swatch", colors: ["#F97316", "#FFFFFF", "#FED7AA"] },
  tuxedo: { kind: "swatch", colors: ["#111827", "#FFFFFF", "#6B7280"] },
  tortoiseshell: { kind: "swatch", colors: ["#F97316", "#111827", "#B45309"] },
  smoke: { kind: "swatch", colors: ["#374151", "#9CA3AF", "#F3F4F6"] },
  cinnamon: { kind: "swatch", colors: ["#C2410C", "#EA580C", "#FDBA74"] },
  "red-brown": { kind: "swatch", colors: ["#9A3412", "#C2410C", "#FDBA74"] },
  brindle: { kind: "swatch", colors: ["#78350F", "#1C1917", "#A8A29E"] },
  spotted: { kind: "swatch", colors: ["#FFFFFF", "#111827", "#E5E7EB"] },
  tricolor: { kind: "swatch", colors: ["#111827", "#B45309", "#FFFFFF"] },
  sable: { kind: "swatch", colors: ["#92400E", "#D97706", "#1C1917"] },
  "blue-merle": { kind: "swatch", colors: ["#64748B", "#1E293B", "#E2E8F0"] },
  fawn: { kind: "swatch", colors: ["#D6B48C", "#E7D3B0", "#F5E6D3"] },
  liver: { kind: "swatch", colors: ["#7C2D12", "#9A3412", "#C4A484"] },
  apricot: { kind: "swatch", colors: ["#FDBA74", "#FED7AA", "#FFF7ED"] },
  monochrome: { kind: "swatch", colors: ["#000000", "#6B7280", "#FFFFFF"] },
  warm: { kind: "swatch", colors: ["#F97316", "#FBBF24", "#FDE68A"] },
  cool: { kind: "swatch", colors: ["#0EA5E9", "#14B8A6", "#E0F2FE"] },
  muted: { kind: "swatch", colors: ["#A8A29E", "#D6D3D1", "#E7E5E4"] },
  "high-contrast": { kind: "swatch", colors: ["#000000", "#FFFFFF"] },
  "golden-hour": { kind: "swatch", colors: ["#F59E0B", "#FBBF24", "#FDE68A"] },
  blueprint: { kind: "swatch", colors: ["#1E3A8A", "#3B82F6", "#DBEAFE"] },
  candy: { kind: "swatch", colors: ["#F472B6", "#A78BFA", "#FDE047"] },
  sepia: { kind: "swatch", colors: ["#78350F", "#A16207", "#FEF3C7"] },
  ice: { kind: "swatch", colors: ["#F0F9FF", "#BAE6FD", "#E0F2FE"] },

  // —— Breed placeholders (until jpg lands) ——
  shorthair: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><ellipse cx="32" cy="22" rx="14" ry="12" fill="#FDBA74"/><circle cx="26" cy="20" r="2" fill="#0F172A"/><circle cx="38" cy="20" r="2" fill="#0F172A"/>`,
    ),
  },
  scottish: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E0E7FF"/><ellipse cx="32" cy="22" rx="14" ry="12" fill="#94A3B8"/><path d="M18 14 L22 20" stroke="#64748B" stroke-width="2"/><path d="M46 14 L42 20" stroke="#64748B" stroke-width="2"/>`,
    ),
  },
  british: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><ellipse cx="32" cy="22" rx="15" ry="13" fill="#94A3B8"/><circle cx="26" cy="20" r="2.5" fill="#0F172A"/><circle cx="38" cy="20" r="2.5" fill="#0F172A"/>`,
    ),
  },
  persian: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><ellipse cx="32" cy="22" rx="16" ry="14" fill="#E7E5E4"/><circle cx="26" cy="20" r="2" fill="#0F172A"/><circle cx="38" cy="20" r="2" fill="#0F172A"/>`,
    ),
  },
  siamese: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF9C3"/><ellipse cx="32" cy="22" rx="12" ry="11" fill="#FEF3C7"/><ellipse cx="22" cy="16" rx="5" ry="6" fill="#78350F"/><ellipse cx="42" cy="16" rx="5" ry="6" fill="#78350F"/><circle cx="26" cy="20" r="2" fill="#38BDF8"/><circle cx="38" cy="20" r="2" fill="#38BDF8"/>`,
    ),
  },
  golden: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><ellipse cx="32" cy="24" rx="14" ry="11" fill="#EAB308"/><ellipse cx="18" cy="18" rx="5" ry="7" fill="#CA8A04"/><ellipse cx="46" cy="18" rx="5" ry="7" fill="#CA8A04"/>`,
    ),
  },
  corgi: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FFEDD5"/><ellipse cx="32" cy="26" rx="16" ry="9" fill="#F97316"/><ellipse cx="18" cy="14" rx="5" ry="8" fill="#FB923C"/><ellipse cx="46" cy="14" rx="5" ry="8" fill="#FB923C"/>`,
    ),
  },
  shiba: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><ellipse cx="32" cy="24" rx="13" ry="11" fill="#EA580C"/><circle cx="26" cy="22" r="2" fill="#0F172A"/><circle cx="38" cy="22" r="2" fill="#0F172A"/>`,
    ),
  },
  poodle: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F8FAFC"/><circle cx="32" cy="20" r="12" fill="#E2E8F0"/><circle cx="22" cy="12" r="5" fill="#CBD5E1"/><circle cx="42" cy="12" r="5" fill="#CBD5E1"/>`,
    ),
  },
  husky: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E0F2FE"/><ellipse cx="32" cy="22" rx="13" ry="12" fill="#F8FAFC"/><circle cx="26" cy="20" r="2.5" fill="#38BDF8"/><circle cx="38" cy="20" r="2.5" fill="#38BDF8"/>`,
    ),
  },

  // —— Style extras ——
  pixel: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#1E1B4B"/><rect x="20" y="10" width="8" height="8" fill="#A78BFA"/><rect x="28" y="18" width="8" height="8" fill="#F472B6"/><rect x="36" y="10" width="8" height="8" fill="#34D399"/>`,
    ),
  },
  comic: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF08A"/><rect x="10" y="8" width="44" height="24" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M20 28 L16 36 L28 28" fill="#FFFFFF" stroke="#0F172A"/>`,
    ),
  },
  clay: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FFE4E6"/><ellipse cx="32" cy="22" rx="14" ry="12" fill="#FB7185"/><ellipse cx="28" cy="18" rx="4" ry="3" fill="#FDA4AF"/>`,
    ),
  },
  ink: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FAFAF9"/><path d="M12 30 Q24 8 40 22 T58 14" fill="none" stroke="#0F172A" stroke-width="3"/>`,
    ),
  },
  "pastel-art": {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FDF4FF"/><circle cx="24" cy="18" r="10" fill="#F9A8D4" opacity=".7"/><circle cx="42" cy="24" r="10" fill="#C4B5FD" opacity=".7"/>`,
    ),
  },

  // —— Background structure ——
  studio: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><rect x="8" y="10" width="48" height="22" rx="3" fill="#FFFFFF" stroke="#CBD5E1"/>`,
    ),
  },
  nature: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#87CEEB"/><ellipse cx="32" cy="38" rx="40" ry="14" fill="#4ADE80"/><circle cx="48" cy="12" r="7" fill="#FDE047"/>`,
    ),
  },
  room: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E7E5E4"/><rect x="0" y="26" width="64" height="14" fill="#A8A29E"/><rect x="36" y="8" width="18" height="14" fill="#BAE6FD"/>`,
    ),
  },
  abstract: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#1E1B4B"/><circle cx="20" cy="18" r="10" fill="#A78BFA" opacity=".7"/><circle cx="42" cy="24" r="12" fill="#F472B6" opacity=".55"/>`,
    ),
  },
  "living-room": {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><rect x="4" y="20" width="28" height="14" rx="2" fill="#B45309"/><rect x="40" y="8" width="16" height="12" fill="#93C5FD"/>`,
    ),
  },
  window: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF9C3"/><rect x="18" y="4" width="28" height="24" fill="#BFDBFE" stroke="#64748B"/><line x1="32" y1="4" x2="32" y2="28" stroke="#64748B"/><line x1="18" y1="16" x2="46" y2="16" stroke="#64748B"/>`,
    ),
  },
  garden: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#BBF7D0"/><circle cx="16" cy="28" r="6" fill="#F472B6"/><circle cx="32" cy="24" r="5" fill="#FB7185"/><circle cx="48" cy="28" r="6" fill="#FBBF24"/>`,
    ),
  },
  bed: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E0E7FF"/><rect x="6" y="18" width="52" height="16" rx="3" fill="#C7D2FE"/><rect x="10" y="12" width="18" height="10" rx="2" fill="#EEF2FF"/>`,
    ),
  },
  cafe: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F5E6D3"/><rect x="8" y="22" width="48" height="10" fill="#A16207"/><circle cx="44" cy="14" r="6" fill="#FEF3C7"/>`,
    ),
  },
  park: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#7DD3FC"/><ellipse cx="32" cy="36" rx="36" ry="12" fill="#22C55E"/><rect x="28" y="10" width="6" height="16" fill="#854D0E"/><circle cx="31" cy="10" r="9" fill="#16A34A"/>`,
    ),
  },
  beach: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="22" fill="#38BDF8"/><rect y="22" width="64" height="18" fill="#FDE68A"/><circle cx="50" cy="10" r="6" fill="#FACC15"/>`,
    ),
  },
  home: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#BAE6FD"/><polygon points="32,6 8,22 56,22" fill="#F87171"/><rect x="16" y="22" width="32" height="16" fill="#FED7AA"/>`,
    ),
  },
  office: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E2E8F0"/><rect x="10" y="6" width="44" height="28" fill="#94A3B8"/><rect x="14" y="10" width="16" height="10" fill="#BAE6FD"/><rect x="34" y="10" width="16" height="10" fill="#BAE6FD"/>`,
    ),
  },
  city: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#312E81"/><rect x="8" y="14" width="12" height="26" fill="#6366F1"/><rect x="24" y="8" width="14" height="32" fill="#818CF8"/><rect x="42" y="18" width="14" height="22" fill="#A5B4FC"/>`,
    ),
  },

  // —— Camera ——
  front: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F8FAFC"/><rect x="18" y="8" width="28" height="24" rx="3" fill="#CBD5E1" stroke="#64748B"/><circle cx="32" cy="20" r="6" fill="#94A3B8"/>`,
    ),
  },
  closeup: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="32" cy="20" r="14" fill="#F8FAFC"/><circle cx="32" cy="20" r="6" fill="#0EA5E9"/>`,
    ),
  },
  isometric: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#EEF2FF"/><polygon points="32,6 52,16 32,26 12,16" fill="#A5B4FC"/><polygon points="12,16 32,26 32,36 12,26" fill="#818CF8"/><polygon points="32,26 52,16 52,26 32,36" fill="#6366F1"/>`,
    ),
  },
  cinematic: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#020617"/><rect x="0" y="6" width="64" height="28" fill="#1E293B"/><rect x="8" y="12" width="48" height="16" fill="#334155"/>`,
    ),
  },
  eyelevel: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><ellipse cx="32" cy="22" rx="14" ry="10" fill="#94A3B8"/><line x1="4" y1="22" x2="60" y2="22" stroke="#64748B" stroke-dasharray="2 2"/>`,
    ),
  },
  topdown: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E2E8F0"/><circle cx="32" cy="20" r="12" fill="#94A3B8"/><circle cx="32" cy="20" r="4" fill="#475569"/>`,
    ),
  },
  wide: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#DBEAFE"/><ellipse cx="32" cy="28" rx="28" ry="8" fill="#93C5FD"/><circle cx="20" cy="18" r="5" fill="#64748B"/>`,
    ),
  },
  action: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><path d="M12 28 L28 14 L36 22 L52 8" fill="none" stroke="#F97316" stroke-width="3"/><circle cx="52" cy="8" r="4" fill="#EF4444"/>`,
    ),
  },
  portrait: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F8FAFC"/><ellipse cx="32" cy="14" rx="8" ry="8" fill="#CBD5E1"/><path d="M18 36 Q32 22 46 36" fill="#94A3B8"/>`,
    ),
  },
  headshot: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="32" cy="20" r="12" fill="#E2E8F0"/><circle cx="28" cy="18" r="2" fill="#0F172A"/><circle cx="36" cy="18" r="2" fill="#0F172A"/>`,
    ),
  },
  full: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><circle cx="32" cy="10" r="5" fill="#94A3B8"/><rect x="26" y="16" width="12" height="16" rx="2" fill="#64748B"/><line x1="26" y1="32" x2="22" y2="38" stroke="#64748B"/><line x1="38" y1="32" x2="42" y2="38" stroke="#64748B"/>`,
    ),
  },
  panoramic: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0EA5E9"/><rect y="22" width="64" height="18" fill="#22C55E"/><path d="M0 22 L16 10 L28 18 L40 8 L64 20 L64 22 Z" fill="#64748B"/>`,
    ),
  },
  drone: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#38BDF8"/><rect x="20" y="18" width="24" height="14" fill="#166534" opacity=".5"/><circle cx="32" cy="8" r="3" fill="#FFFFFF"/><line x1="32" y1="11" x2="32" y2="18" stroke="#FFFFFF"/>`,
    ),
  },

  // —— Style ——
  photorealistic: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="48" cy="10" r="5" fill="#FDE047"/><rect y="24" width="64" height="16" fill="#334155"/><circle cx="22" cy="22" r="8" fill="#E2E8F0"/>`,
    ),
  },
  "3d": {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#EEF2FF"/><ellipse cx="32" cy="22" rx="14" ry="12" fill="#A5B4FC"/><ellipse cx="32" cy="18" rx="10" ry="8" fill="#C7D2FE"/>`,
    ),
  },
  flat: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FFF7ED"/><rect x="12" y="10" width="40" height="20" fill="#FB923C"/><circle cx="32" cy="20" r="6" fill="#FED7AA"/>`,
    ),
  },
  painting: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FEF3C7"/><path d="M8 30 Q20 8 32 22 T56 12" fill="none" stroke="#B45309" stroke-width="4"/><path d="M10 32 Q28 16 50 28" fill="none" stroke="#DC2626" stroke-width="3" opacity=".7"/>`,
    ),
  },
  anime: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#DBEAFE"/><circle cx="32" cy="18" r="10" fill="#FDE68A"/><ellipse cx="28" cy="16" rx="3" ry="4" fill="#0F172A"/><ellipse cx="36" cy="16" rx="3" ry="4" fill="#0F172A"/>`,
    ),
  },
  watercolor: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F8FAFC"/><circle cx="24" cy="18" r="12" fill="#93C5FD" opacity=".55"/><circle cx="40" cy="22" r="12" fill="#F9A8D4" opacity=".5"/>`,
    ),
  },
  oil: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#451A03"/><rect x="8" y="6" width="48" height="28" fill="#92400E"/><circle cx="32" cy="20" r="8" fill="#F59E0B" opacity=".8"/>`,
    ),
  },
  cinematic_style: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#020617"/><rect x="0" y="8" width="64" height="24" fill="#1E293B"/><rect x="10" y="12" width="20" height="16" fill="#F97316" opacity=".7"/>`,
    ),
  },
  illustration: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FAFAF9"/><rect x="14" y="8" width="36" height="24" rx="4" fill="none" stroke="#0F172A" stroke-width="2"/><circle cx="32" cy="20" r="6" fill="#0EA5E9"/>`,
    ),
  },
  ghibli: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#BAE6FD"/><ellipse cx="32" cy="34" rx="30" ry="10" fill="#86EFAC"/><circle cx="48" cy="10" r="6" fill="#FFFFFF"/>`,
    ),
  },

  // —— Variant mood (methodology Layer 2) ——
  mood_premium: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0B0B0F"/><circle cx="32" cy="20" r="12" fill="none" stroke="#D4AF37" stroke-width="2"/><circle cx="32" cy="20" r="6" fill="#334155"/>`,
    ),
  },
  mood_energy: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#DC2626"/><path d="M20 30 L32 8 L36 20 L48 10 L40 32 Z" fill="#FDE047"/>`,
    ),
  },
  mood_graphic: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#111827"/><rect x="0" y="0" width="32" height="40" fill="#2563EB"/><circle cx="32" cy="20" r="10" fill="none" stroke="#F8FAFC" stroke-width="3"/>`,
    ),
  },
  mood_drama: {
    kind: "svg",
    svg: svg(
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#000"/><stop offset="1" stop-color="#7F1D1D"/></linearGradient></defs><rect width="64" height="40" fill="url(#g)"/><circle cx="40" cy="14" r="10" fill="#FDE68A" opacity=".35"/>`,
    ),
  },
  mood_minimal: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F8FAFC"/><rect x="22" y="14" width="20" height="12" fill="#0F172A"/><rect x="8" y="32" width="48" height="2" fill="#CBD5E1"/>`,
    ),
  },

  // —— Structure ——
  struct_flat: {
    kind: "svg",
    svg: svg(`<rect width="64" height="40" fill="#1E3A8A"/>`),
  },
  struct_split: {
    kind: "svg",
    svg: svg(
      `<rect width="32" height="40" fill="#0F172A"/><rect x="32" width="32" height="40" fill="#DC2626"/>`,
    ),
  },
  struct_gradient: {
    kind: "svg",
    svg: svg(
      `<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0F172A"/><stop offset="1" stop-color="#DC2626"/></linearGradient></defs><rect width="64" height="40" fill="url(#lg)"/>`,
    ),
  },
  struct_frame: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><rect x="6" y="6" width="52" height="28" fill="none" stroke="#D4AF37" stroke-width="2"/>`,
    ),
  },

  // —— Density ——
  density_centered: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><rect x="20" y="10" width="24" height="20" rx="2" fill="#334155"/>`,
    ),
  },
  density_left: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#F1F5F9"/><rect x="6" y="10" width="22" height="20" rx="2" fill="#334155"/>`,
    ),
  },
  density_dense: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#E2E8F0"/><rect x="4" y="4" width="18" height="14" fill="#64748B"/><rect x="24" y="4" width="18" height="14" fill="#475569"/><rect x="44" y="4" width="16" height="14" fill="#334155"/><rect x="4" y="22" width="56" height="14" fill="#1E293B"/>`,
    ),
  },
  density_airy: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#FAFAFA"/><rect x="24" y="14" width="16" height="10" fill="#94A3B8"/>`,
    ),
  },

  // —— Signature ——
  sig_corner: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="52" cy="10" r="8" fill="none" stroke="#D4AF37" stroke-width="2"/>`,
    ),
  },
  sig_frame: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="32" cy="20" r="14" fill="none" stroke="#D4AF37" stroke-width="2.5"/><rect x="22" y="16" width="20" height="8" fill="#F8FAFC"/>`,
    ),
  },
  sig_stroke: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><path d="M4 28 C20 8, 44 32, 60 12" fill="none" stroke="#D4AF37" stroke-width="2.5"/>`,
    ),
  },
  sig_bold: {
    kind: "svg",
    svg: svg(
      `<rect width="64" height="40" fill="#0F172A"/><circle cx="32" cy="20" r="12" fill="none" stroke="#D4AF37" stroke-width="5"/>`,
    ),
  },
};

export function resolveOptionPreview(optionId: string): OptionPreview | undefined {
  // Always prefer the canonical thumb URL. UI falls back to SVG/swatch on load error
  // so newly generated files appear on the next open (or after a mid-session poll).
  return {
    kind: "image",
    src: promptHelperThumbSrc(optionId) || `/prompt-helper/thumbs/${optionId}.jpg`,
    alt: optionId,
  };
}

/** SVG/swatch chip when the jpg is missing. */
export function resolveOptionFallbackPreview(optionId: string): OptionPreview {
  return (
    OPTION_PREVIEW_LIBRARY[optionId] ?? {
      kind: "swatch",
      colors: ["#e2e8f0", "#f8fafc", "#cbd5e1"],
    }
  );
}

/** Detect brand / shelf-sign / ad briefs that need Shared Anchor + Variant mode. */
export function isBrandVariantBrief(prompt: string): boolean {
  return /(?:ป้าย|หมวด|ชั้นหนังสือ|แบนเนอร์|banner|โฆษณา|\bad\b|poster|บรีฟ|layout|เลย์เอาต์|60\s*x\s*20|brand\s*kit|โลโก้|logo)/iu.test(
    prompt,
  );
}

export function inferSharedAnchors(prompt: string): SharedAnchorHint[] {
  const anchors: SharedAnchorHint[] = [];

  if (/(?:โลโก้|logo|wordmark|แบรนด์|brand)/iu.test(prompt)) {
    anchors.push({
      id: "logo",
      label: "โลโก้ / Wordmark",
      detail: "คงรูปทรง สี และลำดับชั้นของโลโก้ตามบรีฟ — ห้ามขยับเพื่อสร้างความต่าง",
    });
  }

  if (/(?:สีประจำ|ชุดสี|brand\s*color|ธีมสี|โทนแบรนด์)/iu.test(prompt)) {
    anchors.push({
      id: "theme",
      label: "ชุดสีแบรนด์",
      detail: "ใช้ชุดสีที่ระบุในบรีฟทุกแบบ — ห้ามเปลี่ยนโทนหลัก",
    });
  }

  const physical = /(?:ขนาด\s*)?(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:cm|ซม)/iu.exec(
    prompt,
  );
  if (physical) {
    anchors.push({
      id: "ratio",
      label: "สัดส่วน",
      detail: `${physical[1]}×${physical[2]} ซม. — ล็อกทุกแบบ`,
    });
  } else if (/3\s*:\s*1/iu.test(prompt)) {
    anchors.push({
      id: "ratio",
      label: "สัดส่วน",
      detail: "3:1 — ล็อกทุกแบบ",
    });
  } else if (/16\s*:\s*9|9\s*:\s*16|1\s*:\s*1|4\s*:\s*3|3\s*:\s*4/iu.test(prompt)) {
    const m = prompt.match(/(\d+\s*:\s*\d+)/u);
    anchors.push({
      id: "ratio",
      label: "สัดส่วน",
      detail: m ? `${m[1].replace(/\s/g, "")} — ล็อกทุกแบบ` : "สัดส่วนที่ระบุในบรีฟ",
    });
  }

  if (/@[^\s]+|merged|บรีฟ|layout|เลย์เอาต์|ปก|reference/iu.test(prompt)) {
    anchors.push({
      id: "refs",
      label: "รูปอ้างอิง",
      detail: "ใช้ชุด reference เดิมทุกแบบ — ไม่พึ่งข้อความอย่างเดียว",
    });
  }

  if (/(?:ข้อความ|headline|สโลแกน|hashtag|ตัวอักษรบนภาพ)/iu.test(prompt)) {
    anchors.push({
      id: "copy",
      label: "ข้อความบนภาพ",
      detail: "ข้อความทุกบรรทัดตามบรีฟคงเดิมทุกแบบ",
    });
  }

  if (anchors.length === 0) {
    anchors.push({
      id: "brief",
      label: "บรีฟเดิม",
      detail: "ข้อความ/หัวข้อจาก prompt ของคุณคงเดิมทุกแบบ",
    });
  }
  return anchors.slice(0, 5);
}

/** Layer-2 variant dimensions for brand/ad work — poles must not overlap. */
export function createBrandVariantDimensions(): Array<{
  id: string;
  title: string;
  hint: string;
  options: CatalogOption[];
}> {
  return [
    {
      id: "mood",
      title: "คาแรคเตอร์",
      hint: "เลือกทิศทางความรู้สึก — แต่ละขั้วคนละบุคลิก",
      options: [
        {
          id: "mood_premium",
          label: "พรีเมียม",
          character: "ลึกลับ · หรู",
          modifier: "คาแรคเตอร์พรีเมียม ลึกลับ หรูหรา แสงโลหะทองบาง ๆ บนพื้นเข้ม",
          preview: OPTION_PREVIEW_LIBRARY.mood_premium,
          axis: "mood",
        },
        {
          id: "mood_energy",
          label: "พลังงาน",
          character: "จัดจ้าน · คม",
          modifier: "คาแรคเตอร์จัดจ้าน มีพลัง คอนทราสต์สูง สีแดงเด่น",
          preview: OPTION_PREVIEW_LIBRARY.mood_energy,
          axis: "mood",
        },
        {
          id: "mood_graphic",
          label: "กราฟิก",
          character: "ตัดครึ่ง · บ๊อลด์",
          modifier: "คาแรคเตอร์กราฟิกบ๊อลด์ แบ่งพื้นสีชัด เรขาคณิตคม",
          preview: OPTION_PREVIEW_LIBRARY.mood_graphic,
          axis: "mood",
        },
        {
          id: "mood_drama",
          label: "ดราม่า",
          character: "แสงมืด · ลึก",
          modifier: "คาแรคเตอร์ดราม่า แสงเฉียงเข้ม เงาลึก อารมณ์หนัก",
          preview: OPTION_PREVIEW_LIBRARY.mood_drama,
          axis: "mood",
        },
        {
          id: "mood_minimal",
          label: "มินิมอล",
          character: "โล่ง · อ่านไกล",
          modifier: "คาแรคเตอร์มินิมอล โล่ง อ่านชัดระยะไกล พื้นเรียบ",
          preview: OPTION_PREVIEW_LIBRARY.mood_minimal,
          axis: "mood",
        },
      ],
    },
    {
      id: "structure",
      title: "โครงสร้างพื้น",
      hint: "การจัดวางสีพื้นหลัง",
      options: [
        {
          id: "struct_flat",
          label: "สีเดียว",
          character: "พื้นทึบ",
          modifier: "พื้นหลังสีเดียวล้วน ไม่มีไล่เฉด",
          preview: OPTION_PREVIEW_LIBRARY.struct_flat,
          axis: "structure",
        },
        {
          id: "struct_split",
          label: "แยกครึ่ง",
          character: "สองขั้วสี",
          modifier: "พื้นหลังแยกครึ่งสีตัดกันชัด",
          preview: OPTION_PREVIEW_LIBRARY.struct_split,
          axis: "structure",
        },
        {
          id: "struct_gradient",
          label: "ไล่เฉด",
          character: "ไหลต่อเนื่อง",
          modifier: "พื้นหลังไล่เฉดเชื่อมโทนแบรนด์อย่างนุ่มนวล",
          preview: OPTION_PREVIEW_LIBRARY.struct_gradient,
          axis: "structure",
        },
        {
          id: "struct_frame",
          label: "กรอบทอง",
          character: "ขอบประดับ",
          modifier: "พื้นเรียบพร้อมกรอบ/ขอบโลหะทองบาง ๆ",
          preview: OPTION_PREVIEW_LIBRARY.struct_frame,
          axis: "structure",
        },
      ],
    },
    {
      id: "signature",
      title: "ซิกเนเจอร์",
      hint: "บทบาทของโมทีฟหลักในงาน (เรขาคณิต / เส้น / เฟรม — ตาม visual language ของบรีฟ)",
      options: [
        {
          id: "sig_corner",
          label: "มุมประดับ",
          character: "เบา · มุม",
          modifier: "โมทีฟซิกเนเจอร์เป็นองค์ประกอบประดับมุม เส้นบาง น้ำหนักเบา",
          preview: OPTION_PREVIEW_LIBRARY.sig_corner,
          axis: "signature",
        },
        {
          id: "sig_frame",
          label: "เฟรมข้อความ",
          character: "โอบข้อความ",
          modifier: "โมทีฟซิกเนเจอร์เป็นเฟรมโอบข้อความหลัก",
          preview: OPTION_PREVIEW_LIBRARY.sig_frame,
          axis: "signature",
        },
        {
          id: "sig_stroke",
          label: "เส้นพาด",
          character: "เส้นเดียว",
          modifier: "เส้นซิกเนเจอร์ลากผ่านองค์ประกอบหลักเส้นเดียว",
          preview: OPTION_PREVIEW_LIBRARY.sig_stroke,
          axis: "signature",
        },
        {
          id: "sig_bold",
          label: "หนาชัด",
          character: "น้ำหนักสูง",
          modifier: "โมทีฟซิกเนเจอร์เส้นหนา น้ำหนักสูง เป็นจุดโฟกัส",
          preview: OPTION_PREVIEW_LIBRARY.sig_bold,
          axis: "signature",
        },
      ],
    },
    {
      id: "density",
      title: "ความหนาแน่น",
      hint: "เลย์เอาต์แน่นหรือโล่ง",
      options: [
        {
          id: "density_centered",
          label: "กลางสมมาตร",
          character: "บาลานซ์",
          modifier: "จัดวางกึ่งกลางสมมาตร อ่านง่าย",
          preview: OPTION_PREVIEW_LIBRARY.density_centered,
          axis: "density",
        },
        {
          id: "density_left",
          label: "ชิดซ้าย",
          character: "เว้นขวา",
          modifier: "ชิดซ้าย เว้นระยะว่างด้านขวา",
          preview: OPTION_PREVIEW_LIBRARY.density_left,
          axis: "density",
        },
        {
          id: "density_dense",
          label: "แน่น",
          character: "ข้อมูลครบ",
          modifier: "เลย์เอาต์แน่น ข้อมูลจัดเรียงเต็มเฟรม",
          preview: OPTION_PREVIEW_LIBRARY.density_dense,
          axis: "density",
        },
        {
          id: "density_airy",
          label: "โล่ง",
          character: "หายใจ",
          modifier: "เลย์เอาต์โล่ง อ่านชัดระยะไกล",
          preview: OPTION_PREVIEW_LIBRARY.density_airy,
          axis: "density",
        },
      ],
    },
  ];
}
