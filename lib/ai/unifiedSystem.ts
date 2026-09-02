export type UnifiedPromptRoute = "local-plan" | "local-tool" | "design-agent";

export const UNIFIED_AI_SYSTEM = Object.freeze({
  label: "AI Assistance",
  description: "Local-first assistance that automatically chooses the right tool or model.",
  localFirst: true,
  userSelectableModes: false,
});

export function routeUnifiedPrompt(input: {
  hasLocalPlan: boolean;
  specialized: boolean;
}): UnifiedPromptRoute {
  if (input.hasLocalPlan) return "local-plan";
  if (input.specialized) return "local-tool";
  return "design-agent";
}
