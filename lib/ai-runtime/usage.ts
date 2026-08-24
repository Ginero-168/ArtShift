import type { AiModelPricing, AiProviderId, AiTaskKind, AiUsage } from "./contracts";

export type AiUsageRecord = {
  at: number;
  task: AiTaskKind;
  provider: AiProviderId;
  model: string;
  durationMs: number;
  usage: AiUsage;
  cached: boolean;
  ok: boolean;
  errorCode?: string;
};

export type AiUsageSummary = {
  since: number;
  requests: number;
  failures: number;
  estimatedUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export interface AiUsageLedger {
  record(entry: AiUsageRecord): void;
  summary(since?: number): AiUsageSummary;
  recent(limit?: number): AiUsageRecord[];
}

export class InMemoryAiUsageLedger implements AiUsageLedger {
  private readonly entries: AiUsageRecord[] = [];

  constructor(private readonly maxEntries = 500) {}

  record(entry: AiUsageRecord): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  summary(since = startOfCurrentMonth()): AiUsageSummary {
    const entries = this.entries.filter((entry) => entry.at >= since);
    return {
      since,
      requests: entries.length,
      failures: entries.filter((entry) => !entry.ok).length,
      estimatedUsd: entries.reduce((sum, entry) => sum + (entry.usage.estimatedUsd ?? 0), 0),
      inputTokens: entries.reduce((sum, entry) => sum + (entry.usage.inputTokens ?? 0), 0),
      outputTokens: entries.reduce((sum, entry) => sum + (entry.usage.outputTokens ?? 0), 0),
    };
  }

  recent(limit = 20): AiUsageRecord[] {
    return this.entries.slice(-Math.max(0, limit)).reverse();
  }
}

export function estimateAiCost(usage: AiUsage, pricing?: AiModelPricing): number | undefined {
  if (!pricing) return usage.estimatedUsd;
  if (typeof pricing.perRunUsd === "number") return pricing.perRunUsd;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  if (
    typeof pricing.inputPerMillionTokens !== "number" &&
    typeof pricing.outputPerMillionTokens !== "number"
  ) {
    return usage.estimatedUsd;
  }
  return (
    (input * (pricing.inputPerMillionTokens ?? 0) +
      output * (pricing.outputPerMillionTokens ?? 0)) /
    1_000_000
  );
}

function startOfCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
