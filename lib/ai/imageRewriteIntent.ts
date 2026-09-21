/**
 * Systemic rewrite / instruction-preservation helpers.
 * Not tied to a single subject or style (cat, pixel art, …).
 */

const FOLLOW_UP_MARKERS = [
  "=== LAST IMAGE GENERATION PACKAGE",
  "=== SMART RECALL",
  "=== PRIOR IMAGE GENERATION TO CONTINUE",
  "=== SHARED ANCHORS",
  "=== UNTRUSTED LOCAL CONTEXT",
];

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

/**
 * True when the current ask is a directed style / medium / aspect rewrite —
 * a clear edit, not a blank new brief. Works for any subject.
 */
export function isDirectedImageRewrite(prompt: string): boolean {
  const text = currentUserInstruction(prompt);
  if (!text) return false;
  if (/\d+\s*:\s*\d+/.test(text)) return true;
  if (/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:cm|mm|m|in|px)?/iu.test(text)) return true;
  if (/(?:สัดส่วน|aspect(?:\s*ratio)?|\bratio\b)/iu.test(text)) return true;
  if (/(?:สไตล์|แนว(?:ศิลป์)?|โทนสี|medium|style)\b/iu.test(text)) return true;
  if (/(?:ปรับ|ทำให้|เปลี่ยน|แปลง|ทำ)\s*(?:ให้)?\s*เป็น/iu.test(text)) return true;
  if (
    /\b(?:make|change|convert|turn|render|redraw|restyle)\b[\s\S]{0,48}\b(?:as|to|into|in)\b/iu.test(
      text,
    )
  ) {
    return true;
  }
  return /(?:pixel\s*art|watercolor|watercolour|cartoon|anime|manga|vector(?:ized)?|illustration|oil\s*paint|sketch|line\s*art|low[-\s]?poly|voxel|isometric|risograph|ukiyo|halftone|pop\s*art|flat\s+vector|chibi|ghibli)/iu.test(
    text,
  );
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
