export { appearancePadding, appearanceRenderPad } from "./bounds";
export { type AppearanceCapability, appearanceCapabilities } from "./capabilities";
export { changeAppearance } from "./commands";
export {
  clampPathCurvature,
  DEFAULT_GLOW,
  DEFAULT_SHADOW,
  defaultBackgroundItem,
  defaultFillItem,
  defaultGlowItem,
  defaultShadowItem,
  defaultStrokeItem,
  defaultTextStrokeItem,
} from "./defaults";
export { appearanceFingerprint } from "./fingerprints";
export {
  appearanceToLegacyPatch,
  migrateTextPaintSemantics,
  readAppearance,
  synthesizeAppearanceFromLegacy,
} from "./legacyAdapter";
export {
  clamp01,
  emptyAppearance,
  normalizeAppearance,
  validateAppearance,
} from "./normalize";
export {
  addBackgroundOperation,
  addFillOperation,
  addGlowOperation,
  addShadowOperation,
  addStrokeOperation,
  backgroundInsertIndex,
  backgroundItemPatchOperation,
  backgroundPaintOperation,
  fillItemPatchOperation,
  fillPaintOperation,
  glowPatchOperation,
  nudgeItemOperation,
  paintInsertIndex,
  removeItemOperation,
  removeStackKind,
  replaceStackOperation,
  setRootBlendOperation,
  setRootOpacityOperation,
  shadowPatchOperation,
  strokePatchOperation,
  toggleItemVisibleOperation,
  toggleStackKindVisible,
} from "./ops";
export {
  type AppearanceStackRow,
  appearanceItemLabel,
  appearanceItemSwatch,
  appearanceItemTypeLabel,
  appearanceStackRows,
  findBackground,
  findBackgrounds,
  findEffect,
  findFill,
  findFills,
  findStroke,
  findStrokes,
  resolveAppearanceExpandedKey,
  stackKindOf,
  toggleAppearanceExpandedKey,
} from "./panelModel";
export {
  appearanceElementPatch,
  dualWriteElement,
  hydrateDocumentAppearance,
  hydrateElementAppearance,
  snapshotToAppearance,
  syncElementAppearance,
  tryNormalizeAppearance,
} from "./persist";
export {
  appearanceMaxStrokeWidth,
  type CanvasPaintPass,
  type CanvasShadowPass,
  canvasGaussianBlurRadius,
  canvasPaintPasses,
  canvasPaintRoles,
  canvasShadowPasses,
  usesStackedPaint,
} from "./renderPlan";
export type { TextEffectFamily, TextEffectPreset, TextEffectStaticCap } from "./textEffectPresets";
export {
  applyTextEffectPreset,
  applyTextEffectPresetOperation,
  COLORION_INK,
  getTextEffectPreset,
  searchTextEffectPresets,
  TEXT_EFFECT_FAMILY_LABELS,
  TEXT_EFFECT_FAMILY_ORDER,
  TEXT_EFFECT_PRESET_COUNT,
  TEXT_EFFECT_PRESETS,
  textEffectPresetsByFamily,
  textEffectPreviewStyle,
} from "./textEffectPresets";
export type {
  Appearance,
  AppearanceBlendMode,
  AppearanceError,
  AppearanceItem,
  AppearanceItemBlendMode,
  AppearanceOperation,
  AppearancePaint,
  AppearanceShadowLayer,
  AppearanceSnapshot,
  BackgroundAppearance,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";
