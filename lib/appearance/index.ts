export { appearancePadding } from "./bounds";
export { type AppearanceCapability, appearanceCapabilities } from "./capabilities";
export { changeAppearance } from "./commands";
export {
  clampPathCurvature,
  DEFAULT_GLOW,
  DEFAULT_SHADOW,
  defaultFillItem,
  defaultGlowItem,
  defaultShadowItem,
  defaultStrokeItem,
} from "./defaults";
export { appearanceFingerprint } from "./fingerprints";
export {
  appearanceToLegacyPatch,
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
  addFillOperation,
  addGlowOperation,
  addShadowOperation,
  addStrokeOperation,
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
  appearanceStackRows,
  findEffect,
  findFill,
  findFills,
  findStroke,
  findStrokes,
  stackKindOf,
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
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";
