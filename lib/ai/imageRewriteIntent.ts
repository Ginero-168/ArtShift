/**
 * Chat-turn policies that apply to every subject and style.
 *
 * 1. Size (highest first): current-ask text → this-turn inserted image →
 *    last package (short follow-up only) → defaults.
 *    Implemented in chatContinuity.resolveFollowUpDimensions.
 * 2. Always keep the current user instruction in refinedPrompt / task prompt.
 *    Never replace it with a generic stock English template.
 * 3. Quality gate: a clear style / aspect / tone rewrite of a reference is a
 *    transform, not a photoreal fidelity lock. Do not hard-fail when local
 *    analysis cannot prove object-by-object overlap.
 *
 * Detection is structural (verbs, aspect, tone language, tagged source) —
 * not a catalog of named styles or subjects.
 */

const FOLLOW_UP_MARKERS = [
  "=== LAST IMAGE GENERATION PACKAGE",
  "=== SMART RECALL",
  "=== PRIOR IMAGE GENERATION TO CONTINUE",
  "=== SHARED ANCHORS",
  "=== UNTRUSTED LOCAL CONTEXT",
];

export type DirectedRewriteOptions = {
  /** Tagged / inserted reference on this turn (not last-package carry-forward). */
  hasReference?: boolean;
};

/** The user's current command, ignoring injected package / recall blocks and @tags. */
export function currentUserInstruction(prompt: string): string {
  const text = (prompt || "").trim();
  if (!text) return "";
  const labeled =
    /User (?:follow-up (?:request|command)|instruction(?: \(authoritative\))?):\s*([^\n]+)/iu.exec(
      text,
    );
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 500);
  let cut = text;
  for (const marker of FOLLOW_UP_MARKERS) {
    const idx = cut.indexOf(marker);
    if (idx >= 0) cut = cut.slice(0, idx);
  }
  const firstLine = cut
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine || cut)
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim()
    .slice(0, 500);
}

function isCountOnlyVariation(text: string): boolean {
  const trimmed = text.trim();
  return (
    /^(?:(?:ช่วย|ขอ)\s*)?(?:สร้าง|ทำ|เอา|วาด|เจน|ผลิต|ออกแบบ|generate|create|make)\s*(?:มา|ให้|เพิ่ม)?\s*อีก(?:\s*(?:\d+|หนึ่ง|สอง|สาม|สี่|ห้า|one|two|three|four|five))?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)?\s*$/iu.test(
      trimmed,
    ) ||
    /^(?:another|more)\s+\d+\s*(?:images?|variations?|options?)?\s*$/iu.test(trimmed) ||
    /^(?:ขอตัวเลือกเพิ่ม|ตัวเลือกเพิ่ม|สร้างเพิ่ม|ทำเพิ่ม|variation)\s*$/iu.test(trimmed)
  );
}

function hasNamedSizeOrAspect(text: string): boolean {
  return (
    /\d+\s*:\s*\d+/.test(text) ||
    /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:cm|mm|m|in|px)?/iu.test(text) ||
    /(?:สัดส่วน|aspect(?:\s*ratio)?|\bratio\b)/iu.test(text)
  );
}

function looksLikeFreshGeneration(text: string): boolean {
  if (/(?:จาก(?:ภาพ|รูป)|from this|this (?:photo|image|picture|shot))/iu.test(text)) {
    return false;
  }
  return /^(?:(?:ช่วย|ขอ)\s*)?(?:สร้าง|วาด|ทำ|ขอ|generate|create|draw|picture of|image of)\s*(?:รูป|ภาพ|image|a|an)?/iu.test(
    text,
  );
}

/**
 * Structural “clear edit” signals — verbs, tone/style language, look-like,
 * from-this-source. No named-style catalog (pixel art, watercolor, …).
 */
function hasTransformOrTreatmentLanguage(text: string): boolean {
  if (/(?:สไตล์|แนว(?:ศิลป์)?|โทน(?:สี|ภาพ)?|medium|style)\b/iu.test(text)) return true;
  if (/(?:ปรับ|ทำให้|เปลี่ยน|แปลง|ทำ)\s*(?:ให้)?\s*เป็น/iu.test(text)) return true;
  if (/(?:ปรับ|เปลี่ยน|ทำ)\s*โทน/iu.test(text)) return true;
  if (
    /\b(?:make|change|convert|turn|render|redraw|restyle|stylize)\b[\s\S]{0,48}\b(?:as|to|into|in|like)\b/iu.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(?:in the style of|look(?:s)? like|styled as|stylize(?:d)? as)\b/iu.test(text)) {
    return true;
  }
  if (/(?:จาก(?:ภาพ|รูป)นี้|from this (?:photo|image|picture|shot))/iu.test(text)) return true;
  return false;
}

/**
 * True when the current ask is a directed style / medium / aspect rewrite —
 * a clear edit, not a blank new brief. Works for any subject.
 */
export function isDirectedImageRewrite(prompt: string, options?: DirectedRewriteOptions): boolean {
  const text = currentUserInstruction(prompt);
  if (!text) return false;
  if (isCountOnlyVariation(text)) return false;
  if (hasNamedSizeOrAspect(text)) return true;
  if (hasTransformOrTreatmentLanguage(text)) return true;
  // Inserted source + a short remaining command is a treatment of that source,
  // even when the user names a medium this file has never listed.
  if (options?.hasReference && !looksLikeFreshGeneration(text) && text.length <= 48) {
    return true;
  }
  return false;
}

/** Tokens from the user ask that a compiled prompt must not drop. */
export function userInstructionTokens(prompt: string): string[] {
  const command = currentUserInstruction(prompt);
  if (!command) return [];
  const tokens: string[] = [];
  const aspects = command.match(/\d+\s*:\s*\d+/g);
  if (aspects) tokens.push(...aspects.map((item) => item.replace(/\s+/g, "")));
  const sizes = command.match(/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:cm|mm|px)?/giu);
  if (sizes) tokens.push(...sizes.map((item) => item.replace(/\s+/g, "").toLowerCase()));
  const words = command.match(/[A-Za-z][A-Za-z0-9-]{2,}/g);
  if (words) {
    tokens.push(
      ...words.filter(
        (word) =>
          !/^(the|and|for|with|from|this|that|into|make|change|convert|turn|give|please|image|photo|picture)$/i.test(
            word,
          ),
      ),
    );
  }
  const thaiChunks = command.match(/[\u0E00-\u0E7F]{2,}/g);
  if (thaiChunks) {
    tokens.push(
      ...thaiChunks.filter(
        (chunk) =>
          !/^(?:ปรับ|ทำให้|เปลี่ยน|แปลง|ทำ|เป็น|ให้เป็น|จาก|ภาพ|รูป|นี้|นั้น|หน่อย|ครับ|ค่ะ)$/u.test(chunk),
      ),
    );
  }
  return [...new Set(tokens.map((item) => item.trim()).filter((item) => item.length >= 2))];
}

/**
 * Never let a compiler / Director drop the current user instruction.
 * Prepends the command when compiled English is missing its tokens.
 */
export function preserveUserInstructionInPrompt(
  compiledPrompt: string,
  userPrompt: string,
): string {
  const command = currentUserInstruction(userPrompt);
  const compiled = (compiledPrompt || "").trim();
  if (!command) return compiled;
  if (!compiled) return command;
  if (compiled.toLocaleLowerCase().includes(command.toLocaleLowerCase())) return compiled;
  const tokens = userInstructionTokens(command);
  const missing = tokens.filter(
    (token) => !compiled.toLocaleLowerCase().includes(token.toLocaleLowerCase()),
  );
  // No extractable tokens (or any still missing) → keep the raw current ask.
  if (tokens.length === 0 || missing.length > 0) {
    return `User instruction (authoritative): ${command}\n\n${compiled}`;
  }
  return compiled;
}
