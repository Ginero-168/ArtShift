/**
 * Automatically derives a clean, human-readable element name from a user prompt or task brief.
 * Formats Thai names with a natural "ภาพ" prefix (e.g. "สร้างรูปแมว" -> "ภาพแมว").
 */

export function deriveGeneratedImageName(
  summaryOrPrompt?: string,
  fallbackPrompt?: string,
): string {
  const text = (summaryOrPrompt || fallbackPrompt || "").trim();
  if (!text) return "ภาพใหม่";

  // 1. Remove common AI command verbs and generation prefixes (Thai and English)
  let cleaned = text
    .replace(
      /^(ช่วย)?(สร้าง|วาด|ทำ|ขอ|ออกแบบ|เนรมิต|จัดทำ|generate|gen|draw|create|render)\s*(รูปภาพ|รูป|ภาพ|image of|picture of|a photo of|photo of|a picture of)?\s*/i,
      "",
    )
    .replace(/^(รูปภาพ|รูป|ภาพ)\s*/i, "")
    .trim();

  // If stripping left an empty string, fallback to the original trimmed text
  if (!cleaned) {
    cleaned = text;
  }

  // 2. Remove quotation marks, brackets, and markdown formatting
  cleaned = cleaned.replace(/^["'`“‘\[\(]+|["'`”’\]\)]+$/g, "").trim();

  // 3. Remove variation tags like "(variation 2)" or "แบบที่ 1"
  cleaned = cleaned.replace(/\(?(variation|แบบที่|ภาพที่)\s*\d+\)?/gi, "").trim();

  // 4. Cap length to 30 characters for clean tag display
  if (cleaned.length > 30) {
    cleaned = cleaned.slice(0, 30).trim();
  }

  // 5. Ensure the name starts with "ภาพ" for natural Thai presentation
  if (cleaned.startsWith("ภาพ")) {
    return cleaned;
  }

  // If it is English or starts with alphanumeric, add a space after ภาพ
  if (/^[A-Za-z0-9]/.test(cleaned)) {
    return `ภาพ ${cleaned}`;
  }

  return `ภาพ${cleaned}`;
}
