import { AiResultCache, RoutedAiRuntime } from "@/lib/ai-runtime/runtime";
import { InMemoryAiUsageLedger } from "@/lib/ai-runtime/usage";
import { AnthropicAiAdapter } from "./adapters/anthropicAdapter";
import { GoogleAiAdapter } from "./adapters/googleAdapter";
import { OpenAiAdapter } from "./adapters/openaiAdapter";
import { PollinationsAiAdapter } from "./adapters/pollinationsAdapter";
import { ReplicateAiAdapter } from "./adapters/replicateAdapter";
import { AI_DEFAULT_PROFILES, createAiRouteTable } from "./modelManifest";

const ledger = new InMemoryAiUsageLedger(1_000);
const resultCache = new AiResultCache(10 * 60_000, 100);
const monthlyBudgetUsd = parsePositiveNumber(process.env.AI_MONTHLY_BUDGET_USD);

const runtime = new RoutedAiRuntime({
  adapters: [
    new AnthropicAiAdapter(),
    new ReplicateAiAdapter(),
    new GoogleAiAdapter(),
    new OpenAiAdapter(),
    new PollinationsAiAdapter(),
  ],
  routes: createAiRouteTable(),
  defaultProfiles: AI_DEFAULT_PROFILES,
  ledger,
  cache: resultCache,
  monthlyBudgetUsd,
});

export function getServerAiRuntime(): RoutedAiRuntime {
  return runtime;
}

export function getAiBudgetStatus() {
  return {
    monthlyBudgetUsd,
    monthlyUsage: ledger.summary(),
    persistence: "memory" as const,
  };
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
