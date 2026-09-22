/** Extract a JSON value from noisy model text (fences, prose, trailing commas). */

const PREVIEW_MAX = 240;
const SECRET_PATTERN =
  /\b(?:r8_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key["']?\s*[:=]\s*["']?[^\s"']+)/gi;

export function parseJsonCandidate(text: string): unknown {
  if (!text || typeof text !== "string") return null;

  for (const attempt of collectJsonAttempts(text)) {
    const parsed = tryParseJson(attempt);
    if (parsed !== undefined) return unwrapJsonString(parsed);
  }
  return null;
}

/**
 * Short, secret-free preview of raw model text for 502 debugging.
 * Never include tokens, keys, or long dumps.
 */
export function safeModelTextPreview(text: string, max = PREVIEW_MAX): string {
  if (!text || typeof text !== "string") return "(empty)";
  const stripped = stripControlChars(text)
    .replace(SECRET_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "(empty)";
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

function collectJsonAttempts(text: string): string[] {
  const trimmed = text.trim();
  const attempts: string[] = [];
  const push = (value: string | null | undefined) => {
    const next = value?.trim();
    if (next && !attempts.includes(next)) attempts.push(next);
  };

  push(trimmed);

  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenced?.[1]) {
    push(fenced[1]);
    push(extractFirstJsonValue(fenced[1]));
  }

  push(extractFirstJsonValue(trimmed));

  const start = firstJsonStart(trimmed);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    push(trimmed.slice(start, end + 1));
  }

  return attempts;
}

export function looksTruncatedJson(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (extractFirstJsonValue(trimmed)) return false;
  const start = firstJsonStart(trimmed);
  if (start < 0) return false;
  return (
    trimmed.includes('"keyword"') ||
    trimmed.includes('"associations"') ||
    trimmed.includes('"roles"') ||
    trimmed.includes('"imagePrompts"')
  );
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }
  const sanitized = sanitizeJsonText(text);
  if (sanitized !== text) {
    try {
      return JSON.parse(sanitized);
    } catch {
      // continue
    }
  }
  const repaired = repairTruncatedJson(text);
  if (repaired && repaired !== text) {
    try {
      return JSON.parse(repaired);
    } catch {
      // continue
    }
    try {
      return JSON.parse(sanitizeJsonText(repaired));
    } catch {
      // continue
    }
  }
  return undefined;
}

/** Close open strings/arrays/objects so a cut-off model reply can parse. */
export function repairTruncatedJson(str: string): string {
  if (!str || typeof str !== "string") return str;
  const startIdx = firstJsonStart(str);
  if (startIdx < 0) return str;

  const target = str.slice(startIdx);
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < target.length; i++) {
    const char = target[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}" && stack[stack.length - 1] === "{") {
        stack.pop();
      } else if (char === "]" && stack[stack.length - 1] === "[") {
        stack.pop();
      }
    }
  }

  let repaired = target;
  if (inString) {
    if (repaired.endsWith("\\")) {
      repaired = repaired.slice(0, -1);
    }
    repaired += '"';
  }

  if (/:\s*$/.test(repaired)) {
    repaired += "null";
  }

  repaired = repaired.replace(/,\s*$/, "");

  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") repaired += "}";
    else if (last === "[") repaired += "]";
  }

  return repaired;
}

/** Tolerate trailing commas before } or ]. */
function sanitizeJsonText(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function unwrapJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const inner = value.trim();
  if (!inner || (inner[0] !== "{" && inner[0] !== "[" && inner[0] !== '"')) return value;
  const parsed = parseJsonCandidate(inner);
  return parsed ?? value;
}

function extractFirstJsonValue(text: string): string | null {
  const start = firstJsonStart(text);
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" && stack[stack.length - 1] === "{") {
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1);
    } else if (char === "]" && stack[stack.length - 1] === "[") {
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stripControlChars(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    result += code < 32 ? " " : text[i];
  }
  return result;
}

function firstJsonStart(text: string): number {
  const brace = text.indexOf("{");
  const bracket = text.indexOf("[");
  const start = Math.min(...[brace, bracket].filter((index) => index >= 0));
  return Number.isFinite(start) && start >= 0 ? start : -1;
}
