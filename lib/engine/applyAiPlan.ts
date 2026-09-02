import type {
  AiCommand,
  ExecutionReceipt,
  InsertShapePayload,
  InsertTextPayload,
  PlanProposal,
  Revision,
  TargetRef,
} from "@/lib/designAgent/contracts";
import { createEllipse, createRect, createText, createTriangle } from "./factory";
import { pushHistory } from "./history";
import { useEngine } from "./store";
import { measureTextElementHeight } from "./textLayout";
import type { EngineDoc, EngineElement, EngineLayer, EngineSlide } from "./types";

export type AiRevision = Revision;
export type AiTargetRef = TargetRef;
export type AiPlanCommand = AiCommand;
export type AiPlan = PlanProposal;

type ApplySuccess = {
  ok: true;
  doc: EngineDoc;
  receipts: ExecutionReceipt[];
};

type ApplyFailure = {
  ok: false;
  doc: EngineDoc;
  receipts: ExecutionReceipt[];
  error: string;
};

export type ApplyAiPlanResult = ApplySuccess | ApplyFailure;

export type ApplyAiPlanOptions = {
  approved?: boolean;
};

const MAX_COMMANDS = 40;
const MAX_TEXT_LENGTH = 20_000;
const MAX_NAME_LENGTH = 200;
const MAX_COLOR_LENGTH = 128;
const MAX_COORDINATE = 100_000;
const MAX_DIMENSION = 100_000;

const SAFE_PATCH_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "angle",
  "opacity",
  "strokeColor",
  "backgroundColor",
  "strokeWidth",
  "strokeStyle",
  "fillStyle",
  "fillType",
  "gradientColors",
  "gradientAngle",
  "gradientStops",
  "fillPattern",
  "shadow",
  "glow",
  "blendMode",
  "name",
  "text",
  "textPreset",
  "fontSize",
  "fontFamily",
  "fontStyle",
  "textAlign",
  "verticalAlign",
  "lineHeight",
  "padding",
  "cornerRadius",
  "pathCurvature",
  "filterBlur",
  "adjustments",
  "mask",
  "focalPoint",
]);

const VISUAL_PATCH_KEYS = new Set([
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "strokeWidth",
  "strokeStyle",
  "fillStyle",
  "fillType",
  "gradientColors",
  "gradientAngle",
  "gradientStops",
  "fillPattern",
  "shadow",
  "glow",
  "blendMode",
  "text",
  "textPreset",
  "fontSize",
  "fontFamily",
  "fontStyle",
  "textAlign",
  "verticalAlign",
  "lineHeight",
  "padding",
  "cornerRadius",
  "pathCurvature",
  "filterBlur",
  "adjustments",
  "mask",
  "focalPoint",
]);

/**
 * Validate and apply a complete AI plan without mutating the input document.
 * Every command is checked against the same base snapshot before any command
 * is transformed. A failed command makes the whole batch fail atomically.
 */
export function applyAiPlanToDocument(doc: EngineDoc, plan: AiPlan): ApplyAiPlanResult {
  const initialFailure = validatePlan(doc, plan);
  if (initialFailure) return failure(doc, plan, initialFailure);

  const targetFailures = plan.commands
    .map((command) => ({ command, reason: validateCommandTarget(doc, command) }))
    .find((item) => item.reason);
  if (targetFailures?.reason)
    return failure(doc, plan, targetFailures.reason, targetFailures.command.id);

  const patchFailures = plan.commands
    .map((command) => ({ command, reason: validateCommandPayload(command) }))
    .find((item) => item.reason);
  if (patchFailures?.reason)
    return failure(doc, plan, patchFailures.reason, patchFailures.command.id);

  const next = structuredClone(doc);
  const applied: ExecutionReceipt[] = [];

  for (const command of plan.commands) {
    const result = applyCommand(next, command);
    if (!result.ok) {
      return failure(doc, plan, result.reason, command.id);
    }
    applied.push({ commandId: command.id, status: "applied" });
  }

  next.updatedAt = nextRevision(doc.updatedAt);
  return { ok: true, doc: next, receipts: applied };
}

/**
 * Apply a validated plan to the live engine in one synchronous store update.
 * The history snapshot is taken once, before the transformed document is set.
 */
export function applyAiPlan(plan: AiPlan, options: ApplyAiPlanOptions = {}): ApplyAiPlanResult {
  const current = useEngine.getState();
  if (plan.requiresApproval && options.approved !== true) {
    return failure(current.doc, plan, "Plan approval is required before applying these changes.");
  }

  const result = applyAiPlanToDocument(current.doc, plan);
  if (!result.ok) return result;

  pushHistory(current.history, current.doc, `AI plan: ${plan.planId}`);
  const selectedIds = new Set(
    plan.commands.flatMap((command) =>
      "objectId" in command.target && command.target.objectId ? [command.target.objectId] : [],
    ),
  );
  useEngine.setState({
    doc: result.doc,
    selectedIds,
  });
  return result;
}

function validatePlan(doc: EngineDoc, plan: AiPlan): string | null {
  if (plan.protocolVersion !== 1) return "Unsupported AI plan protocol version.";
  if (!plan.planId || plan.planId.length > 200) return "Invalid AI plan id.";
  if (!plan.executionToken || plan.executionToken.length > 256)
    return "Invalid AI execution token.";
  if (!sameRevision(plan.baseRevision, doc.updatedAt))
    return "The AI plan is stale because the Artwork changed.";
  if (!Array.isArray(plan.commands) || plan.commands.length === 0)
    return "The AI plan contains no commands.";
  if (plan.commands.length > MAX_COMMANDS) return "The AI plan contains too many commands.";
  const ids = new Set<string>();
  for (const command of plan.commands) {
    if (!command.id || command.id.length > 200 || ids.has(command.id))
      return "AI command ids must be unique.";
    ids.add(command.id);
  }
  return null;
}

function validateCommandTarget(doc: EngineDoc, command: AiPlanCommand): string | null {
  const target = command.target;
  if (!target.docId || target.docId !== doc.id)
    return "The AI command targets a different document.";
  if (!target.artworkId) return "The AI command has no Artwork target.";
  if (!sameRevision(target.baseRevision, doc.updatedAt))
    return "The AI command has a stale base revision.";

  const slide = doc.slides.find((candidate) => candidate.id === target.artworkId);
  if (!slide) return "The target Artwork no longer exists.";
  if (command.kind === "background") return null;
  if (command.kind === "insert_text" || command.kind === "insert_shape") {
    if (!command.target.layerId) return "The insert command has no Layer target.";
    const layer = slide.layers.find((candidate) => candidate.id === command.target.layerId);
    if (!layer) return "The target Layer no longer exists.";
    if (layer.locked) return "The target Layer is locked.";
    if (layer.mode !== "free") return "AI insertion currently requires a Free Layer.";
    return null;
  }
  const objectTarget = command.target;
  if (!objectTarget.objectId) return "The AI command has no Object target.";

  const element = slide.elements.find((candidate) => candidate.id === objectTarget.objectId);
  if (!element || element.isDeleted) return "The target Object no longer exists.";
  if (
    objectTarget.elementVersion !== undefined &&
    objectTarget.elementVersion !== element.version
  ) {
    return "The target Object changed after this plan was created.";
  }
  const layer = findLayerForObject(slide, element.id, objectTarget.layerId);
  if (!layer) return "The target Object is not in the expected Layer.";
  if (layer.locked || element.locked) return "The target Object or Layer is locked.";
  return null;
}

function validateCommandPayload(command: AiPlanCommand): string | null {
  if (command.kind === "background")
    return validateColor(command.color) ? null : "Invalid background color.";
  if (command.kind === "delete") return null;
  if (command.kind === "insert_text") return validateInsertTextPayload(command.payload);
  if (command.kind === "insert_shape") return validateInsertShapePayload(command.payload);

  const keys = Object.keys(command.patch);
  if (!keys.length) return "The update command has no changes.";
  if (keys.some((key) => !SAFE_PATCH_KEYS.has(key)))
    return "The update contains a forbidden Object field.";

  for (const [key, value] of Object.entries(command.patch)) {
    if (typeof value === "number" && !Number.isFinite(value))
      return `Invalid numeric value for ${key}.`;
    if ((key === "x" || key === "y") && !boundedNumber(value, -MAX_COORDINATE, MAX_COORDINATE)) {
      return `Invalid coordinate for ${key}.`;
    }
    if ((key === "width" || key === "height") && !boundedNumber(value, 1, MAX_DIMENSION)) {
      return `Invalid dimension for ${key}.`;
    }
    if (key === "opacity" && !boundedNumber(value, 0, 1)) return "Opacity must be between 0 and 1.";
    if (key === "fontSize" && !boundedNumber(value, 1, 512)) return "Font size is out of bounds.";
    if (key === "text" && (!isSafeString(value) || value.length > MAX_TEXT_LENGTH)) {
      return "Text is empty, too long, or contains an invalid character.";
    }
    if (key === "name" && (!isSafeString(value) || value.length > MAX_NAME_LENGTH)) {
      return "Object name is invalid or too long.";
    }
    if ((key === "backgroundColor" || key === "strokeColor") && !validateColor(value)) {
      return `Invalid color for ${key}.`;
    }
    if (key === "fontFamily" && (!isSafeString(value) || value.length > 200)) {
      return "Font family is invalid or too long.";
    }
  }
  return null;
}

function applyCommand(
  doc: EngineDoc,
  command: AiPlanCommand,
): { ok: true } | { ok: false; reason: string } {
  const slide = doc.slides.find((candidate) => candidate.id === command.target.artworkId);
  if (!slide) return { ok: false, reason: "The target Artwork no longer exists." };

  if (command.kind === "background") {
    slide.background = command.color;
    return { ok: true };
  }

  if (command.kind === "insert_text") {
    const layer = slide.layers.find((candidate) => candidate.id === command.target.layerId);
    if (!layer || layer.locked || layer.mode !== "free") {
      return { ok: false, reason: "AI insertion requires an unlocked Free Layer." };
    }
    const element = createText({
      x: command.payload.x,
      y: command.payload.y,
      text: command.payload.text,
      width: command.payload.width,
      height: command.payload.height,
      ...(command.payload.fontSize !== undefined ? { fontSize: command.payload.fontSize } : {}),
      ...(command.payload.fontFamily ? { fontFamily: command.payload.fontFamily } : {}),
    });
    element.z = nextElementZ(slide);
    if (command.payload.fill) element.strokeColor = command.payload.fill;
    if (command.payload.textAlign) element.textAlign = command.payload.textAlign;
    slide.elements.push(element);
    layer.objectIds = [...layer.objectIds, element.id];
    return { ok: true };
  }

  if (command.kind === "insert_shape") {
    const layer = slide.layers.find((candidate) => candidate.id === command.target.layerId);
    if (!layer || layer.locked || layer.mode !== "free") {
      return { ok: false, reason: "AI insertion requires an unlocked Free Layer." };
    }
    const element = createShape(command.payload);
    element.z = nextElementZ(slide);
    if (command.payload.fill) element.backgroundColor = command.payload.fill;
    if (command.payload.stroke) element.strokeColor = command.payload.stroke;
    if (command.payload.strokeWidth !== undefined)
      element.strokeWidth = command.payload.strokeWidth;
    if (command.payload.cornerRadius !== undefined && element.type === "rect") {
      element.cornerRadius = command.payload.cornerRadius;
    }
    slide.elements.push(element);
    layer.objectIds = [...layer.objectIds, element.id];
    return { ok: true };
  }

  const objectId = command.target.objectId;
  if (!objectId) return { ok: false, reason: "The AI command has no Object target." };
  const index = slide.elements.findIndex((candidate) => candidate.id === objectId);
  if (index < 0) return { ok: false, reason: "The target Object no longer exists." };
  const element = slide.elements[index];

  if (command.kind === "delete") {
    slide.elements[index] = {
      ...element,
      isDeleted: true,
      version: element.version + 1,
    } as EngineElement;
    return { ok: true };
  }

  const next = { ...element, ...command.patch } as EngineElement;
  if (next.type === "text" && VISUAL_PATCH_KEYS.has("text") && !next.containerId) {
    next.height = Math.max(next.height, measureTextElementHeight(next));
  }
  if (Object.keys(command.patch).some((key) => VISUAL_PATCH_KEYS.has(key))) {
    next.version = element.version + 1;
  }
  slide.elements[index] = next;
  return { ok: true };
}

function findLayerForObject(
  slide: EngineSlide,
  objectId: string,
  expectedLayerId?: string,
): EngineLayer | undefined {
  if (expectedLayerId) {
    const layer = slide.layers.find((candidate) => candidate.id === expectedLayerId);
    return layer?.objectIds.includes(objectId) ? layer : undefined;
  }
  return slide.layers.find((candidate) => candidate.objectIds.includes(objectId));
}

function failure(
  doc: EngineDoc,
  plan: AiPlan,
  error: string,
  failedCommandId?: string,
): ApplyFailure {
  return {
    ok: false,
    doc,
    error,
    receipts: plan.commands.map((command) => ({
      commandId: command.id,
      status: "failed",
      reason: command.id === failedCommandId ? error : "Atomic plan was not committed.",
    })),
  };
}

function sameRevision(left: AiRevision, right: AiRevision): boolean {
  return String(left) === String(right);
}

function nextRevision(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}

function boundedNumber(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isSafeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return false;
    }
  }
  return true;
}

function validateColor(value: unknown): boolean {
  return isSafeString(value) && value.length > 0 && value.length <= MAX_COLOR_LENGTH;
}

function validateInsertTextPayload(payload: InsertTextPayload): string | null {
  if (!isSafeString(payload.text) || payload.text.length > MAX_TEXT_LENGTH)
    return "Text is invalid or too long.";
  if (!boundedNumber(payload.x, -MAX_COORDINATE, MAX_COORDINATE))
    return "Text x coordinate is invalid.";
  if (!boundedNumber(payload.y, -MAX_COORDINATE, MAX_COORDINATE))
    return "Text y coordinate is invalid.";
  if (!boundedNumber(payload.width, 1, MAX_DIMENSION)) return "Text width is invalid.";
  if (!boundedNumber(payload.height, 1, MAX_DIMENSION)) return "Text height is invalid.";
  if (payload.fontSize !== undefined && !boundedNumber(payload.fontSize, 1, 512))
    return "Text font size is invalid.";
  if (payload.fontFamily !== undefined && !validateString(payload.fontFamily, 200))
    return "Text font family is invalid.";
  if (payload.fill !== undefined && !validateColor(payload.fill)) return "Text color is invalid.";
  return null;
}

function validateInsertShapePayload(payload: InsertShapePayload): string | null {
  if (!boundedNumber(payload.x, -MAX_COORDINATE, MAX_COORDINATE))
    return "Shape x coordinate is invalid.";
  if (!boundedNumber(payload.y, -MAX_COORDINATE, MAX_COORDINATE))
    return "Shape y coordinate is invalid.";
  if (!boundedNumber(payload.width, 1, MAX_DIMENSION)) return "Shape width is invalid.";
  if (!boundedNumber(payload.height, 1, MAX_DIMENSION)) return "Shape height is invalid.";
  if (payload.fill !== undefined && !validateColor(payload.fill)) return "Shape fill is invalid.";
  if (payload.stroke !== undefined && !validateColor(payload.stroke))
    return "Shape stroke is invalid.";
  if (payload.strokeWidth !== undefined && !boundedNumber(payload.strokeWidth, 0, 128))
    return "Shape stroke width is invalid.";
  if (payload.cornerRadius !== undefined && !boundedNumber(payload.cornerRadius, 0, 512))
    return "Shape corner radius is invalid.";
  return null;
}

function createShape(payload: InsertShapePayload) {
  if (payload.shape === "ellipse") return createEllipse(payload);
  if (payload.shape === "triangle") return createTriangle(payload);
  return createRect(payload);
}

function nextElementZ(slide: EngineSlide): number {
  return slide.elements.reduce((max, element) => Math.max(max, element.z), 0) + 1;
}

function validateString(value: unknown, maxLength: number): value is string {
  return isSafeString(value) && value.length > 0 && value.length <= maxLength;
}
