export type UnifiedPromptRoute = "local-plan" | "tool-command" | "design-agent";

export const UNIFIED_AI_SYSTEM = Object.freeze({
  label: "AI Assistance",
  description: "Local-first assistance that automatically chooses the right tool or model.",
  localFirst: true,
  userSelectableModes: false,
});

export function routeUnifiedPrompt(input: {
  hasLocalPlan: boolean;
  hasToolCommand: boolean;
}): UnifiedPromptRoute {
  if (input.hasLocalPlan) return "local-plan";
  if (input.hasToolCommand) return "tool-command";
  return "design-agent";
}
