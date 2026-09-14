export function parseVisionResponse(raw: string): {
  caption: string;
  objects: string[];
  visibleText: string;
  style?: string;
  dominantColors?: string[];
} {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    const json = JSON.parse(cleaned);
    return {
      caption: typeof json.caption === "string" ? json.caption : cleaned,
      objects: Array.isArray(json.objects) ? json.objects.map(String) : [],
      visibleText: typeof json.visibleText === "string" ? json.visibleText : "",
      style: typeof json.style === "string" ? json.style : undefined,
      dominantColors: Array.isArray(json.dominantColors) ? json.dominantColors.map(String) : [],
    };
  } catch {
    return {
      caption: cleaned,
      objects: [],
      visibleText: "",
    };
  }
}
