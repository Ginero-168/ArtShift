export type ParsedVisionResponse = {
  caption: string;
  objects: string[];
  visibleText: string;
  style?: string;
  dominantColors?: string[];
  layoutNotes?: string;
  inconsistencies?: string[];
};

export function parseVisionResponse(raw: string): ParsedVisionResponse {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    const json = JSON.parse(cleaned) as Record<string, unknown>;
    const inconsistencies = Array.isArray(json.inconsistencies)
      ? json.inconsistencies.map(String).filter((s) => s.trim().length > 0)
      : [];
    return {
      caption: typeof json.caption === "string" ? json.caption : cleaned,
      objects: Array.isArray(json.objects) ? json.objects.map(String) : [],
      visibleText: typeof json.visibleText === "string" ? json.visibleText : "",
      style: typeof json.style === "string" ? json.style : undefined,
      dominantColors: Array.isArray(json.dominantColors)
        ? json.dominantColors.map(String)
        : [],
      layoutNotes: typeof json.layoutNotes === "string" ? json.layoutNotes : undefined,
      inconsistencies,
    };
  } catch {
    return {
      caption: cleaned,
      objects: [],
      visibleText: "",
    };
  }
}

/** Fold optional vision fields into notes the Creative Director already consumes. */
export function visionExtrasAsAppearanceNotes(parsed: ParsedVisionResponse): string[] {
  const notes: string[] = [];
  if (parsed.style?.trim()) notes.push(`Style: ${parsed.style.trim()}`);
  if (parsed.layoutNotes?.trim()) notes.push(`Layout: ${parsed.layoutNotes.trim()}`);
  for (const item of parsed.inconsistencies ?? []) {
    const t = item.trim();
    if (t) notes.push(`Inconsistency: ${t}`);
  }
  if (parsed.dominantColors?.length) {
    notes.push(`Colors: ${parsed.dominantColors.slice(0, 6).join(", ")}`);
  }
  return notes;
}
