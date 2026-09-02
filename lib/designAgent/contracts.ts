export type Revision = number | string;

export type AssetRef = {
  fileId: string;
  kind: "image" | "pdf";
  mimeType: string;
  consent: "local-only" | "remote-analysis-allowed";
  sourceName?: string;
};

export type TargetRef = {
  docId: string;
  artworkId: string;
  layerId?: string;
  objectId?: string;
  elementVersion?: number;
  baseRevision: Revision;
};

export type InsertTextPayload = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
  fill?: string;
};

export type InsertShapePayload = {
  shape: "rect" | "ellipse" | "triangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

export type AiCommand =
  | {
      id: string;
      kind: "update";
      target: TargetRef & { objectId: string };
      patch: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "delete";
      target: TargetRef & { objectId: string };
    }
  | {
      id: string;
      kind: "background";
      target: TargetRef;
      color: string;
    }
  | {
      id: string;
      kind: "insert_text";
      target: TargetRef & { layerId: string };
      payload: InsertTextPayload;
    }
  | {
      id: string;
      kind: "insert_shape";
      target: TargetRef & { layerId: string };
      payload: InsertShapePayload;
    };

export type DesignBrief = {
  goal: string;
  audience?: string;
  format?: string;
  width?: number;
  height?: number;
  copy?: string[];
  constraints?: string[];
  assetRefs?: AssetRef[];
  brandKitId?: string;
  language?: "th" | "en" | "other";
};

export type PlanProposal = {
  protocolVersion: 1;
  planId: string;
  executionToken: string;
  baseRevision: Revision;
  summary: string;
  commands: AiCommand[];
  estimatedRemoteCostUsd: number;
  requiresApproval: boolean;
};

export type ExecutionReceipt = {
  commandId: string;
  status: "applied" | "skipped" | "failed";
  reason?: string;
};

export type AgentEvent =
  | { protocolVersion: 1; type: "text"; delta: string }
  | { protocolVersion: 1; type: "question"; id: string; text: string; options?: string[] }
  | { protocolVersion: 1; type: "proposal"; proposal: PlanProposal }
  | { protocolVersion: 1; type: "receipt"; receipts: ExecutionReceipt[] }
  | { protocolVersion: 1; type: "error"; message: string; retryable?: boolean }
  | { protocolVersion: 1; type: "done" };

type ParseSuccess<T> = { ok: true; value: T };
type ParseFailure = { ok: false; error: string };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const MAX_ID_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 20_000;
const MAX_COMMANDS = 40;
const MAX_PATCH_KEYS = 32;
const MAX_PATCH_STRING_LENGTH = 20_000;
const FORBIDDEN_PATCH_KEYS = new Set([
  "id",
  "type",
  "version",
  "locked",
  "isDeleted",
  "z",
  "groupIds",
]);

export function parsePlanProposal(input: unknown): ParseResult<PlanProposal> {
  if (!isRecord(input)) return invalid("Proposal must be an object.");
  if (input.protocolVersion !== 1) return invalid("Unsupported proposal protocol version.");
  if (!boundedId(input.planId) || !boundedId(input.executionToken)) {
    return invalid("Proposal identifiers are invalid.");
  }
  if (!isRevision(input.baseRevision)) return invalid("Proposal base revision is invalid.");
  if (!isSafeString(input.summary) || input.summary.length > MAX_SUMMARY_LENGTH) {
    return invalid("Proposal summary is invalid or too long.");
  }
  if (
    !Array.isArray(input.commands) ||
    input.commands.length === 0 ||
    input.commands.length > MAX_COMMANDS
  ) {
    return invalid("Proposal command count is invalid.");
  }
  if (!boundedMoney(input.estimatedRemoteCostUsd) || typeof input.requiresApproval !== "boolean") {
    return invalid("Proposal cost or approval flag is invalid.");
  }

  const commands: AiCommand[] = [];
  const ids = new Set<string>();
  for (const raw of input.commands) {
    const command = parseCommand(raw);
    if (!command.ok) return command;
    if (ids.has(command.value.id)) return invalid("Command ids must be unique.");
    ids.add(command.value.id);
    commands.push(command.value);
  }

  return {
    ok: true,
    value: {
      protocolVersion: 1,
      planId: input.planId,
      executionToken: input.executionToken,
      baseRevision: input.baseRevision,
      summary: input.summary,
      commands,
      estimatedRemoteCostUsd: input.estimatedRemoteCostUsd,
      requiresApproval: input.requiresApproval,
    },
  };
}

export function parseAgentEvent(input: unknown): ParseResult<AgentEvent> {
  if (!isRecord(input) || input.protocolVersion !== 1 || typeof input.type !== "string") {
    return invalid("Invalid agent event envelope.");
  }

  switch (input.type) {
    case "text":
      return isSafeString(input.delta) && input.delta.length <= MAX_PATCH_STRING_LENGTH
        ? { ok: true, value: { protocolVersion: 1, type: "text", delta: input.delta } }
        : invalid("Invalid text event.");
    case "question": {
      if (
        !boundedId(input.id) ||
        !isSafeString(input.text) ||
        input.text.length > MAX_SUMMARY_LENGTH
      ) {
        return invalid("Invalid question event.");
      }
      if (
        input.options !== undefined &&
        (!Array.isArray(input.options) || input.options.length > 8)
      ) {
        return invalid("Invalid question options.");
      }
      const options = input.options as unknown[] | undefined;
      if (options?.some((option: unknown) => !isSafeString(option) || option.length > 500)) {
        return invalid("Invalid question option.");
      }
      return {
        ok: true,
        value: {
          protocolVersion: 1,
          type: "question",
          id: input.id,
          text: input.text,
          ...(options ? { options: options as string[] } : {}),
        },
      };
    }
    case "proposal": {
      const proposal = parsePlanProposal(input.proposal);
      return proposal.ok
        ? { ok: true, value: { protocolVersion: 1, type: "proposal", proposal: proposal.value } }
        : proposal;
    }
    case "receipt":
      if (!Array.isArray(input.receipts) || input.receipts.length > MAX_COMMANDS) {
        return invalid("Invalid receipt list.");
      }
      if (input.receipts.some((receipt) => !isReceipt(receipt)))
        return invalid("Invalid execution receipt.");
      return { ok: true, value: { protocolVersion: 1, type: "receipt", receipts: input.receipts } };
    case "error":
      return isSafeString(input.message) && input.message.length <= MAX_SUMMARY_LENGTH
        ? {
            ok: true,
            value: {
              protocolVersion: 1,
              type: "error",
              message: input.message,
              ...(typeof input.retryable === "boolean" ? { retryable: input.retryable } : {}),
            },
          }
        : invalid("Invalid error event.");
    case "done":
      return { ok: true, value: { protocolVersion: 1, type: "done" } };
    default:
      return invalid("Unsupported agent event type.");
  }
}

function parseCommand(input: unknown): ParseResult<AiCommand> {
  if (!isRecord(input) || !boundedId(input.id) || !isRecord(input.target)) {
    return invalid("Invalid AI command envelope.");
  }
  const target = parseTarget(input.target);
  if (!target.ok) return target;

  if (input.kind === "update") {
    if (!target.value.objectId || !isRecord(input.patch)) return invalid("Invalid update command.");
    const objectTarget: TargetRef & { objectId: string } = {
      ...target.value,
      objectId: target.value.objectId,
    };
    const keys = Object.keys(input.patch);
    if (
      keys.length === 0 ||
      keys.length > MAX_PATCH_KEYS ||
      keys.some((key) => FORBIDDEN_PATCH_KEYS.has(key))
    ) {
      return invalid("Update patch contains forbidden or excessive fields.");
    }
    if (Object.values(input.patch).some((value) => !validPatchValue(value))) {
      return invalid("Update patch contains an invalid value.");
    }
    return {
      ok: true,
      value: { id: input.id, kind: "update", target: objectTarget, patch: input.patch },
    };
  }
  if (input.kind === "delete") {
    if (!target.value.objectId) return invalid("Delete command has no Object target.");
    const objectTarget: TargetRef & { objectId: string } = {
      ...target.value,
      objectId: target.value.objectId,
    };
    return target.value.objectId
      ? { ok: true, value: { id: input.id, kind: "delete", target: objectTarget } }
      : invalid("Delete command has no Object target.");
  }
  if (input.kind === "background") {
    return isSafeString(input.color) && input.color.length <= 128
      ? {
          ok: true,
          value: { id: input.id, kind: "background", target: target.value, color: input.color },
        }
      : invalid("Background color is invalid.");
  }
  if (input.kind === "insert_text") {
    if (!target.value.layerId || !isRecord(input.payload))
      return invalid("Invalid insert-text command.");
    const payload = input.payload;
    if (
      !isSafeString(payload.text) ||
      payload.text.length > MAX_PATCH_STRING_LENGTH ||
      !boundedGeometry(payload.x, payload.y, payload.width, payload.height) ||
      !optionalBoundedNumber(payload.fontSize, 1, 512) ||
      !optionalString(payload.fontFamily, 200) ||
      !optionalPick(payload.textAlign, ["left", "center", "right"] as const) ||
      !optionalString(payload.fill, 128)
    ) {
      return invalid("Insert-text payload is invalid.");
    }
    return {
      ok: true,
      value: {
        id: input.id,
        kind: "insert_text",
        target: { ...target.value, layerId: target.value.layerId },
        payload: payload as InsertTextPayload,
      },
    };
  }
  if (input.kind === "insert_shape") {
    if (!target.value.layerId || !isRecord(input.payload))
      return invalid("Invalid insert-shape command.");
    const payload = input.payload;
    if (
      !optionalPick(payload.shape, ["rect", "ellipse", "triangle"] as const) ||
      !boundedGeometry(payload.x, payload.y, payload.width, payload.height) ||
      !optionalString(payload.fill, 128) ||
      !optionalString(payload.stroke, 128) ||
      !optionalBoundedNumber(payload.strokeWidth, 0, 128) ||
      !optionalBoundedNumber(payload.cornerRadius, 0, 512)
    ) {
      return invalid("Insert-shape payload is invalid.");
    }
    return {
      ok: true,
      value: {
        id: input.id,
        kind: "insert_shape",
        target: { ...target.value, layerId: target.value.layerId },
        payload: payload as InsertShapePayload,
      },
    };
  }
  return invalid("Unsupported AI command type.");
}

function parseTarget(input: Record<string, unknown>): ParseResult<TargetRef> {
  if (
    !isSafeString(input.docId) ||
    !isSafeString(input.artworkId) ||
    !isRevision(input.baseRevision)
  ) {
    return invalid("Invalid target identity.");
  }
  if (input.layerId !== undefined && !isSafeString(input.layerId))
    return invalid("Invalid layer target.");
  if (input.objectId !== undefined && !isSafeString(input.objectId))
    return invalid("Invalid Object target.");
  if (input.elementVersion !== undefined) {
    if (
      typeof input.elementVersion !== "number" ||
      !Number.isInteger(input.elementVersion) ||
      input.elementVersion < 0
    ) {
      return invalid("Invalid Object version.");
    }
  }
  return {
    ok: true,
    value: {
      docId: input.docId as string,
      artworkId: input.artworkId as string,
      baseRevision: input.baseRevision as Revision,
      ...(input.layerId !== undefined ? { layerId: input.layerId as string } : {}),
      ...(input.objectId !== undefined ? { objectId: input.objectId as string } : {}),
      ...(input.elementVersion !== undefined
        ? { elementVersion: input.elementVersion as number }
        : {}),
    },
  };
}

function isReceipt(input: unknown): input is ExecutionReceipt {
  if (!isRecord(input) || !boundedId(input.commandId)) return false;
  if (input.status !== "applied" && input.status !== "skipped" && input.status !== "failed")
    return false;
  return input.reason === undefined || (isSafeString(input.reason) && input.reason.length <= 2_000);
}

function validPatchValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string")
    return isSafeString(value) && value.length <= MAX_PATCH_STRING_LENGTH;
  if (Array.isArray(value)) return value.length <= 64 && value.every(validPatchValue);
  if (isRecord(value))
    return Object.keys(value).length <= 16 && Object.values(value).every(validPatchValue);
  return false;
}

function boundedId(value: unknown): value is string {
  return isSafeString(value) && value.length > 0 && value.length <= MAX_ID_LENGTH;
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

function isRevision(value: unknown): value is Revision {
  return (typeof value === "number" && Number.isFinite(value)) || boundedId(value);
}

function boundedMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000;
}

function boundedGeometry(x: unknown, y: unknown, width: unknown, height: unknown): boolean {
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    x >= -100_000 &&
    x <= 100_000 &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    y >= -100_000 &&
    y <= 100_000 &&
    typeof width === "number" &&
    Number.isFinite(width) &&
    width >= 1 &&
    width <= 100_000 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height >= 1 &&
    height <= 100_000
  );
}

function optionalBoundedNumber(value: unknown, min: number, max: number): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max)
  );
}

function optionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || (isSafeString(value) && value.length <= maxLength);
}

function optionalPick<T extends readonly string[]>(
  value: unknown,
  choices: T,
): value is T[number] | undefined {
  return value === undefined || (typeof value === "string" && choices.includes(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(error: string): ParseResult<T> {
  return { ok: false, error };
}
