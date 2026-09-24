/**
 * Creative Director live-text protocol.
 *
 * Provider adapters emit raw model text (SSE tokens or one fallback snapshot).
 * The director route turns that into user-visible thought snapshots and forwards
 * them as SSE while the structured plan is still being validated.
 *
 *   event: thought
 *   data: {"text":"<display text so far>"}
 *
 *   event: done
 *   data: {"direction":{...},"model":"google/gemini-3-flash"}
 *
 *   event: error
 *   data: {"error":"...","code":"..."}
 *
 * Image generation is not part of this stream. The client switches to a
 * model-name status once the plan is ready and rendering starts.
 */

export type DirectorSseEventName = "thought" | "done" | "error";

export type DirectorThoughtEvent = { event: "thought"; text: string };
export type DirectorDoneEvent = {
  event: "done";
  direction: unknown;
  model: string | null;
};
export type DirectorErrorEvent = { event: "error"; error: string; code?: string };
export type DirectorStreamEvent = DirectorThoughtEvent | DirectorDoneEvent | DirectorErrorEvent;

export type SseFrame = { event: string; data: string };

const DISPLAY_KEYS = ["summary", "text", "question"] as const;
type DisplayKey = (typeof DISPLAY_KEYS)[number];

const DIRECTION_KINDS = new Set([
  "answer",
  "text",
  "clarification",
  "image-task",
  "design-plan",
  "sequential-plan",
]);

/** Join a provider delta onto the current pass without duplicating cumulative snapshots. */
export function absorbModelDelta(previous: string, delta: string): string {
  if (!delta) return previous;
  if (!previous) return delta;
  if (delta.startsWith(previous)) return delta;
  if (previous.endsWith(delta)) return previous;
  return previous + delta;
}

/**
 * Pull the user-visible reply out of a partial Director JSON object.
 * `refinedPrompt` and other pipeline fields stay hidden.
 * Plain prose (a greeting with no JSON yet) is shown as-is.
 */
export function extractDirectorStreamThought(raw: string): string {
  const source = raw.replace(/^\uFEFF/, "");
  if (!source.trim()) return "";

  const fields = findDisplayFields(source);
  const kind = lastDirectionKind(source);
  const picked = pickDisplayField(fields, kind);
  if (picked) return picked;

  if (looksLikeStructuredPayload(source)) return "";
  const prose = source.trim();
  if (!prose || prose.startsWith("<") || prose.startsWith("{") || prose.startsWith("[")) return "";
  return prose;
}

export function encodeDirectorSse(event: DirectorSseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Split a text/event-stream buffer into complete frames, keeping a partial tail. */
export function drainSseBuffer(buffer: string): { events: SseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseFrame[] = [];
  for (const part of parts) {
    const frame = parseSseFrame(part);
    if (frame) events.push(frame);
  }
  return { events, rest };
}

export function parseDirectorSseFrame(frame: SseFrame): DirectorStreamEvent | null {
  let payload: unknown;
  try {
    payload = frame.data ? JSON.parse(frame.data) : null;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (frame.event === "thought" && typeof record.text === "string") {
    return { event: "thought", text: record.text };
  }
  if (frame.event === "done" && "direction" in record) {
    return {
      event: "done",
      direction: record.direction,
      model: typeof record.model === "string" ? record.model : null,
    };
  }
  if (frame.event === "error") {
    return {
      event: "error",
      error: typeof record.error === "string" ? record.error : "Creative Director stream failed.",
      ...(typeof record.code === "string" ? { code: record.code } : {}),
    };
  }
  return null;
}

/**
 * Decode one Replicate `event: output` data payload into text.
 * Plain tokens pass through. JSON-encoded strings are unwrapped.
 * Stream envelopes (`chunk` / `output`) yield their text.
 * A director JSON object is kept verbatim so summary/text can be extracted —
 * dropping it made the Thought panel stay on the canned status until `done`.
 */
export function decodeReplicateOutputData(data: string): string {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return "";
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string").join("");
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.chunk === "string") return record.chunk;
      if (typeof record.output === "string") return record.output;
      if (Array.isArray(record.output)) {
        return record.output.filter((item) => typeof item === "string").join("");
      }
      if (
        "kind" in record ||
        "summary" in record ||
        "calls" in record ||
        "refinedPrompt" in record ||
        "question" in record
      ) {
        return trimmed;
      }
    }
    return "";
  } catch {
    return trimmed;
  }
}

function parseSseFrame(part: string): SseFrame | null {
  if (!part.trim()) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const line of part.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n") };
}

function looksLikeStructuredPayload(source: string): boolean {
  return (
    source.includes("{") ||
    source.includes("[") ||
    source.includes('"kind"') ||
    source.includes('"summary"') ||
    source.includes('"refinedPrompt"') ||
    source.includes("propose_creative_direction")
  );
}

function lastDirectionKind(source: string): string | null {
  const matches = findDisplayFields(source, ["kind"]);
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const value = matches[index]?.value.trim();
    if (value && DIRECTION_KINDS.has(value)) return value;
  }
  return null;
}

function pickDisplayField(fields: readonly DisplayField[], kind: string | null): string {
  const visible = fields.filter((field) => field.value.trim().length > 0);
  if (visible.length === 0) return "";
  const order: DisplayKey[] =
    kind === "clarification"
      ? ["question", "text", "summary"]
      : kind === "answer" || kind === "text"
        ? ["text", "summary", "question"]
        : ["summary", "text", "question"];
  for (const key of order) {
    const matches = visible.filter((field) => field.key === key);
    const last = matches[matches.length - 1];
    if (last) return last.value;
  }
  return "";
}

type DisplayField = { key: string; value: string; closed: boolean; index: number };

function findDisplayFields(source: string, keys: readonly string[] = DISPLAY_KEYS): DisplayField[] {
  const fields: DisplayField[] = [];
  for (const key of keys) {
    const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"`, "g");
    let match = pattern.exec(source);
    while (match) {
      const valueStart = match.index + match[0].length;
      const read = readJsonStringValue(source, valueStart);
      fields.push({ key, value: read.value, closed: read.closed, index: match.index });
      match = pattern.exec(source);
    }
  }
  fields.sort((left, right) => left.index - right.index);
  return fields;
}

function readJsonStringValue(source: string, start: number): { value: string; closed: boolean } {
  let value = "";
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      if (index + 1 >= source.length) break;
      const next = source[index + 1];
      if (next === "u") {
        if (index + 5 >= source.length) break;
        const hex = source.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }
      if (next === "n") value += "\n";
      else if (next === "t") value += "\t";
      else if (next === "r") value += "\r";
      else if (next === '"') value += '"';
      else if (next === "\\") value += "\\";
      else if (next === "/") value += "/";
      else value += next;
      index += 2;
      continue;
    }
    if (char === '"') return { value, closed: true };
    value += char;
    index += 1;
  }
  return { value, closed: false };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
