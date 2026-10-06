export type ChatChoice = {
  key: string;
  label: string;
  action: "send" | "compose";
};

const CHOICE_LINE = /^(?:([A-Za-z])\)|(Other)\))\s+(\S.*?)\s*$/i;

/** Pull a lettered menu out of a reply. A normal paragraph stays one block. */
export function splitChatChoices(text: string): { prose: string; choices: ChatChoice[] } {
  const lines = text.split("\n");
  const kept: string[] = [];
  const choices: ChatChoice[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.trim().match(CHOICE_LINE);
    if (!match) {
      kept.push(line);
      continue;
    }
    const key = (match[1] || match[2] || "").toUpperCase();
    const label = match[3]?.trim() ?? "";
    if (!key || !label || seen.has(key)) {
      kept.push(line);
      continue;
    }
    seen.add(key);
    choices.push({
      key,
      label,
      action: choiceAction(key, label),
    });
  }

  if (choices.length < 2) return { prose: text, choices: [] };
  return { prose: trimBlankEdges(kept).join("\n"), choices };
}

function choiceAction(key: string, label: string): "send" | "compose" {
  if (key === "OTHER") return "compose";
  if (/พิมพ์|อื่นๆ|อื่น ๆ|something else/i.test(label)) return "compose";
  return "send";
}

function trimBlankEdges(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && !next[0]?.trim()) next.shift();
  while (next.length > 0 && !next[next.length - 1]?.trim()) next.pop();
  return next;
}
