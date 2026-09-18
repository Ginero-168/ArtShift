export { appearancePadding } from "./bounds";
export { type AppearanceCapability, appearanceCapabilities } from "./capabilities";
export { changeAppearance } from "./commands";
export { appearanceFingerprint } from "./fingerprints";
export { appearanceToLegacyPatch, readAppearance } from "./legacyAdapter";
export {
  clamp01,
  emptyAppearance,
  normalizeAppearance,
  validateAppearance,
} from "./normalize";
export type {
  Appearance,
  AppearanceBlendMode,
  AppearanceError,
  AppearanceItem,
  AppearanceOperation,
  AppearanceSnapshot,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";
