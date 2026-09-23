/**
 * Prompt Helper option thumbnail URLs.
 *
 * Files live under `public/prompt-helper/thumbs/` but MUST be served via the
 * dynamic API route — Next.js production only exposes `public/` files that
 * existed at build time, so runtime-generated jpgs would otherwise 404.
 */

/** @deprecated Kept for tests/scripts that iterate known historical ids. */
export const PROMPT_HELPER_THUMB_SRCS: Readonly<Record<string, string>> = {
  "3d": "/api/ai/prompt-helper/thumbs/3d",
  abstract: "/api/ai/prompt-helper/thumbs/abstract",
  cinematic: "/api/ai/prompt-helper/thumbs/cinematic",
  closeup: "/api/ai/prompt-helper/thumbs/closeup",
  dark: "/api/ai/prompt-helper/thumbs/dark",
  density_airy: "/api/ai/prompt-helper/thumbs/density_airy",
  density_centered: "/api/ai/prompt-helper/thumbs/density_centered",
  density_dense: "/api/ai/prompt-helper/thumbs/density_dense",
  density_left: "/api/ai/prompt-helper/thumbs/density_left",
  earth: "/api/ai/prompt-helper/thumbs/earth",
  flat: "/api/ai/prompt-helper/thumbs/flat",
  front: "/api/ai/prompt-helper/thumbs/front",
  isometric: "/api/ai/prompt-helper/thumbs/isometric",
  mood_drama: "/api/ai/prompt-helper/thumbs/mood_drama",
  mood_energy: "/api/ai/prompt-helper/thumbs/mood_energy",
  mood_graphic: "/api/ai/prompt-helper/thumbs/mood_graphic",
  mood_minimal: "/api/ai/prompt-helper/thumbs/mood_minimal",
  mood_premium: "/api/ai/prompt-helper/thumbs/mood_premium",
  nature: "/api/ai/prompt-helper/thumbs/nature",
  neon: "/api/ai/prompt-helper/thumbs/neon",
  painting: "/api/ai/prompt-helper/thumbs/painting",
  pastel: "/api/ai/prompt-helper/thumbs/pastel",
  photorealistic: "/api/ai/prompt-helper/thumbs/photorealistic",
  room: "/api/ai/prompt-helper/thumbs/room",
  sig_bold: "/api/ai/prompt-helper/thumbs/sig_bold",
  sig_corner: "/api/ai/prompt-helper/thumbs/sig_corner",
  sig_frame: "/api/ai/prompt-helper/thumbs/sig_frame",
  sig_stroke: "/api/ai/prompt-helper/thumbs/sig_stroke",
  struct_flat: "/api/ai/prompt-helper/thumbs/struct_flat",
  struct_frame: "/api/ai/prompt-helper/thumbs/struct_frame",
  struct_gradient: "/api/ai/prompt-helper/thumbs/struct_gradient",
  struct_split: "/api/ai/prompt-helper/thumbs/struct_split",
  studio: "/api/ai/prompt-helper/thumbs/studio",
  vibrant: "/api/ai/prompt-helper/thumbs/vibrant",
};

/** Cache filename and URL segment. Rejects path separators and dots. */
export const PROMPT_HELPER_THUMB_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

export function isPromptHelperThumbId(optionId: string): boolean {
  return PROMPT_HELPER_THUMB_ID_PATTERN.test(optionId);
}

/** Canonical browser URL for an option thumb (API-backed, works for post-build files). */
export function promptHelperThumbPath(optionId: string): string {
  return `/api/ai/prompt-helper/thumbs/${encodeURIComponent(optionId)}`;
}

export function promptHelperThumbSrc(optionId: string): string | undefined {
  return promptHelperThumbPath(optionId);
}
