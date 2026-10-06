export type ChatChoice = {
  key: string;
  label: string;
  action: "send" | "compose";
};

export const FREE_TEXT_CHOICE_LABEL = "พิมพ์คำตอบเอง";

const LETTERS = ["A", "B", "C"] as const;
const CHOICE_LINE = /^(?:([A-Za-z])\)|(Other)\))\s+(\S.*?)\s*$/i;

export function isFreeTextChoice(label: string): boolean {
  return /พิมพ์|อื่นๆ|อื่น ๆ|something else|^other$/i.test(label.trim());
}

/** One question, then A B C and a D line the user can type themselves. */
export function formatChoiceQuestion(
  ask: string,
  options: readonly string[],
  preface: readonly string[] = [],
): string {
  const concrete = options
    .map((option) => option.trim())
    .filter((option) => option.length > 0 && !isFreeTextChoice(option))
    .slice(0, 3);
  const lines = [ask.trim(), ""];
  for (const line of preface) {
    if (line.trim()) lines.push(line);
  }
  if (preface.some((line) => line.trim())) lines.push("");
  concrete.forEach((option, index) => {
    lines.push(`${LETTERS[index]}) ${option}`);
  });
  lines.push(`D) ${FREE_TEXT_CHOICE_LABEL}`);
  return lines.join("\n");
}

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
  const menu = toAbcdMenu(choices);
  if (menu.length < 2) return { prose: text, choices: [] };
  return { prose: trimBlankEdges(kept).join("\n"), choices: menu };
}

function toAbcdMenu(raw: readonly ChatChoice[]): ChatChoice[] {
  const send = raw.filter((choice) => choice.action === "send").slice(0, 3);
  if (send.length === 0) return [];
  const menu: ChatChoice[] = send.map((choice, index) => ({
    key: LETTERS[index] ?? "C",
    label: choice.label,
    action: "send",
  }));
  menu.push({ key: "D", label: FREE_TEXT_CHOICE_LABEL, action: "compose" });
  return menu;
}

function choiceAction(key: string, label: string): "send" | "compose" {
  if (key === "OTHER" || key === "D") return "compose";
  if (isFreeTextChoice(label)) return "compose";
  return "send";
}

function trimBlankEdges(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && !next[0]?.trim()) next.shift();
  while (next.length > 0 && !next[next.length - 1]?.trim()) next.pop();
  return next;
}
