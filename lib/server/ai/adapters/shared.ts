import type { AiObjectProposal, AiProviderId } from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";

export async function assertProviderResponse(
  response: Response,
  provider: AiProviderId,
): Promise<void> {
  if (response.ok) return;
  const retryAfter = Number(response.headers.get("retry-after") ?? 0) || undefined;
  const detail = await response.text().catch(() => "");
  const message = detail.slice(0, 500) || `${provider} returned HTTP ${response.status}.`;
  if (response.status === 401 || response.status === 403) {
    throw new AiRuntimeError("PROVIDER_AUTH", message, { provider });
  }
  if (response.status === 429) {
    throw new AiRuntimeError("PROVIDER_RATE_LIMIT", message, {
      provider,
      retryAfterSeconds: retryAfter,
    });
  }
  throw new AiRuntimeError("PROVIDER_UNAVAILABLE", message, { provider });
}

export function textFromUnknownOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map(textFromUnknownOutput).join("");
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.output_text === "string") return record.output_text;
  }
  return "";
}

export function parseObjectProposals(text: string): AiObjectProposal[] {
  const parsed = parseJsonCandidate(text);
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { objects?: unknown }).objects)
      ? (parsed as { objects: unknown[] }).objects
      : [];

  const objects: AiObjectProposal[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const box = normalizeBox(record.box ?? record.bbox);
    if (!label || !box) continue;
    const confidence = clampOptionalNumber(record.confidence, 0, 1);
    objects.push({ label, box, ...(confidence === undefined ? {} : { confidence }) });
  }
  return deduplicateProposals(objects);
}

function parseJsonCandidate(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = Math.min(
      ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((index) => index >= 0),
    );
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (!Number.isFinite(start) || start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeBox(value: unknown): AiObjectProposal["box"] | null {
  if (Array.isArray(value) && value.length >= 4) {
    return createBox(value[0], value[1], value[2], value[3]);
  }
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  return createBox(box.x, box.y, box.width ?? box.w, box.height ?? box.h);
}

function createBox(x: unknown, y: unknown, width: unknown, height: unknown) {
  if (
    ![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    return null;
  }
  const nextX = clamp(Number(x), 0, 1);
  const nextY = clamp(Number(y), 0, 1);
  const nextWidth = clamp(Number(width), 0, 1 - nextX);
  const nextHeight = clamp(Number(height), 0, 1 - nextY);
  if (nextWidth <= 0 || nextHeight <= 0) return null;
  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

function clampOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deduplicateProposals(objects: AiObjectProposal[]): AiObjectProposal[] {
  const result: AiObjectProposal[] = [];
  for (const object of objects) {
    const duplicate = result.some(
      (candidate) =>
        candidate.label.toLowerCase() === object.label.toLowerCase() &&
        boxIoU(candidate.box, object.box) > 0.9,
    );
    if (!duplicate) result.push(object);
  }
  return result;
}

function boxIoU(a: AiObjectProposal["box"], b: AiObjectProposal["box"]): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new AiRuntimeError("INVALID_INPUT", "Expected a JPEG, PNG or WebP data URL.");
  }
  return { mimeType: match[1], base64: match[2] };
}
