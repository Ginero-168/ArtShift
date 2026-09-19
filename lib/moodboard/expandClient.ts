"use client";

import { ensureCloudConsent } from "@/lib/ai/cloudConsent";
import { useEngine } from "@/lib/engine/store";
import { MOODBOARD_CLOUD_CONSENT_PROMPT } from "./expandPrompt";
import { parseMoodboardExpandJson } from "./expandSchema";
import { fillMoodboardFromPack } from "./fill";
import { isMoodboardSlide } from "./types";

export type MoodboardExpandClientResult =
  | { ok: true; itemCount: number; placeholderCount: number }
  | { ok: false; message: string };

/**
 * Keyword → LLM vibe/structure only (labels + chips).
 * Does not call stock, SerpAPI, CSE, or generative image routes.
 */
export async function expandActiveMoodboard(
  keyword: string,
  options: { signal?: AbortSignal } = {},
): Promise<MoodboardExpandClientResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { ok: false, message: "Enter a keyword to expand." };

  const slide = useEngine.getState().currentSlide();
  if (!isMoodboardSlide(slide)) {
    return { ok: false, message: "Switch to a Moodboard slide first." };
  }

  const cloudConsent = ensureCloudConsent(MOODBOARD_CLOUD_CONSENT_PROMPT);
  if (!cloudConsent) {
    return { ok: false, message: "Cloud consent is required to expand a moodboard." };
  }

  const response = await fetch("/api/moodboard/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword: trimmed, cloudConsent: true }),
    signal: options.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: "Moodboard expand returned an invalid response." };
  }

  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const error = isRecord(record.error) ? record.error : record;
    const message =
      (typeof error.message === "string" && error.message) ||
      (typeof error.error === "string" && error.error) ||
      "Moodboard expand failed.";
    return { ok: false, message };
  }

  const parsed = parseMoodboardExpandJson(isRecord(payload) ? (payload.pack ?? payload) : payload);
  if (!parsed.ok) {
    return { ok: false, message: parsed.reason };
  }

  const items = await fillMoodboardFromPack(parsed.pack);
  useEngine.getState().replaceMoodboard(items, trimmed, "expand moodboard structure");
  return {
    ok: true,
    itemCount: items.length,
    placeholderCount: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
