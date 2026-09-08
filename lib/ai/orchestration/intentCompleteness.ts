// Readiness, questions and options belong exclusively to the Creative Director.
export type ClarificationOption = { id: string; label: string };

/** Append literal conversation, never manufacture style, use or design instructions. */
export function composeClarifiedImagePrompt(
  originalPrompt: string,
  reply: string,
  question: string,
): string {
  return `${originalPrompt}\n\nDirector question: ${question}\nUser reply: ${reply}`;
}
