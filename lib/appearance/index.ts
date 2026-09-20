export { appearancePadding } from "./bounds";
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
  canvasPaintPasses,
  canvasPaintRoles,
  canvasShadowPasses,
  usesStackedPaint,
} from "./renderPlan";
export type {
  Appearance,
  AppearanceBlendMode,
  AppearanceError,
  AppearanceItem,
  AppearanceOperation,
  AppearanceSnapshot,
  BackgroundAppearance,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";
