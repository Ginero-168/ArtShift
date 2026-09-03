import type { AiCommand, PlanProposal } from "./contracts";

export type PlanReviewSummary = {
  summary: string;
  commandCount: number;
  targets: string[];
  changes: string[];
  estimatedRemoteCostUsd: number;
  requiresApproval: boolean;
};

export function summarizePlanForReview(plan: PlanProposal): PlanReviewSummary {
  return {
    summary: plan.summary,
    commandCount: plan.commands.length,
    targets: unique(plan.commands.map(targetLabel)),
    changes: plan.commands.map(changeLabel),
    estimatedRemoteCostUsd: plan.estimatedRemoteCostUsd,
    requiresApproval: plan.requiresApproval,
  };
}

function targetLabel(command: AiCommand): string {
  switch (command.kind) {
    case "background":
      return "Artwork";
    case "insert_text":
    case "insert_shape":
      return "Layer";
    case "update":
    case "delete":
      return "Object";
  }
}

function changeLabel(command: AiCommand): string {
  switch (command.kind) {
    case "update": {
      const keys = Object.keys(command.patch);
      return keys.length ? `Update object (${keys.slice(0, 6).join(", ")})` : "Update object";
    }
    case "delete":
      return "Delete object";
    case "background":
      return "Change artwork background";
    case "insert_text":
      return `Insert text “${truncate(command.payload.text)}”`;
    case "insert_shape":
      return `Insert ${command.payload.shape} shape`;
  }
}

function truncate(value: string, max = 80): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
