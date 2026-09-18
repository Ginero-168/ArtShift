/**
 * Tiny markdown-lite for chat bubbles: headings, bullets, bold.
 * No HTML passthrough — text is escaped via React text nodes.
 */

export type ChatMdInline = { type: "text"; text: string } | { type: "bold"; text: string };

export type ChatMdBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: ChatMdInline[] }
  | { type: "paragraph"; inlines: ChatMdInline[] }
  | { type: "list"; items: ChatMdInline[][] }
  | { type: "spacer" };

const BOLD_RE = /\*\*(.+?)\*\*/g;

export function parseChatMdInlines(text: string): ChatMdInline[] {
  const out: ChatMdInline[] = [];
  let last = 0;
  BOLD_RE.lastIndex = 0;
  let match = BOLD_RE.exec(text);
  while (match) {
    if (match.index > last) {
      out.push({ type: "text", text: text.slice(last, match.index) });
    }
    out.push({ type: "bold", text: match[1] ?? "" });
    last = match.index + match[0].length;
    match = BOLD_RE.exec(text);
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  if (out.length === 0 && text) out.push({ type: "text", text });
  return out;
}

function headingLevel(line: string): 1 | 2 | 3 | null {
  if (/^###\s+/.test(line)) return 3;
  if (/^##\s+/.test(line)) return 2;
  if (/^#\s+/.test(line)) return 1;
  return null;
}

function isRule(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isBullet(line: string): boolean {
  return /^(\s*)([-*•]|\d+\.)\s+/.test(line);
}

function bulletBody(line: string): string {
  return line.replace(/^(\s*)([-*•]|\d+\.)\s+/, "");
}

/** Detect content that benefits from markdown-lite rendering. */
export function looksLikeChatMarkdown(content: string): boolean {
  return /(^|\n)\s{0,3}#{1,3}\s+\S|(^|\n)\s*([-*•]|\d+\.)\s+\S|\*\*[^*\n]+\*\*/.test(content);
}

export function parseChatMarkdown(content: string): ChatMdBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChatMdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      if (blocks.length > 0 && blocks[blocks.length - 1]?.type !== "spacer") {
        blocks.push({ type: "spacer" });
      }
      i += 1;
      continue;
    }

    if (isRule(trimmed)) {
      i += 1;
      continue; // skip noisy horizontal rules in chat
    }

    const level = headingLevel(trimmed);
    if (level) {
      const title = trimmed.replace(/^#{1,3}\s+/, "");
      blocks.push({ type: "heading", level, inlines: parseChatMdInlines(title) });
      i += 1;
      continue;
    }

    if (isBullet(line)) {
      const items: ChatMdInline[][] = [];
      while (i < lines.length && isBullet(lines[i] ?? "")) {
        items.push(parseChatMdInlines(bulletBody(lines[i] ?? "")));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      const nextTrim = next.trim();
      if (!nextTrim || isRule(nextTrim) || headingLevel(nextTrim) || isBullet(next)) {
        break;
      }
      para.push(nextTrim);
      i += 1;
    }
    blocks.push({ type: "paragraph", inlines: parseChatMdInlines(para.join(" ")) });
  }

  while (blocks.length > 0 && blocks[blocks.length - 1]?.type === "spacer") {
    blocks.pop();
  }
  return blocks;
}
