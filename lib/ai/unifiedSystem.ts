export type UnifiedPromptRoute = "local-plan" | "tool-command" | "design-agent";

type VisualRouteHint = {
  route: "direct" | "orchestrator" | "clarify";
  capabilityAvailable: boolean;
};

export const UNIFIED_AI_SYSTEM = Object.freeze({
  label: "AI Assistance",
  description: "Local-first assistance that automatically chooses the right tool or model.",
  localFirst: true,
  userSelectableModes: false,
});

export function routeUnifiedPrompt(input: {
  hasLocalPlan: boolean;
  hasToolCommand: boolean;
  visualPlan?: VisualRouteHint;
}): UnifiedPromptRoute {
  if (input.hasLocalPlan) return "local-plan";
  if (
    input.visualPlan &&
    (input.visualPlan.route !== "direct" || !input.visualPlan.capabilityAvailable)
  ) {
    return "design-agent";
  }
  if (input.hasToolCommand) return "tool-command";
  return "design-agent";
}
