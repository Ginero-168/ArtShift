import { ARTSHIFT_HARNESS_RULE_IDS, ARTSHIFT_HARNESS_VERSION } from "./orchestration/harnessPolicy";

export type UnifiedPromptRoute = "local-plan" | "tool-command" | "design-agent";

type VisualRouteHint = {
  route: "direct" | "orchestrator" | "clarify";
  capabilityAvailable: boolean;
  taskClass?: "simple" | "complex";
};

export const UNIFIED_AI_SYSTEM = Object.freeze({
  label: "AI Assistance",
  description: "Local-first assistance that automatically chooses the right tool or model.",
  localFirst: true,
  userSelectableModes: false,
  harnessVersion: ARTSHIFT_HARNESS_VERSION,
  harnessRuleIds: ARTSHIFT_HARNESS_RULE_IDS,
});

export function routeUnifiedPrompt(input: {
  hasLocalPlan: boolean;
  hasToolCommand: boolean;
  visualPlan?: VisualRouteHint;
}): UnifiedPromptRoute {
  if (input.hasLocalPlan) return "local-plan";
  if (
    input.visualPlan &&
    (input.visualPlan.taskClass === "complex" ||
      input.visualPlan.route !== "direct" ||
      !input.visualPlan.capabilityAvailable)
  ) {
    return "design-agent";
  }
  if (input.hasToolCommand) return "tool-command";
  return "design-agent";
}
