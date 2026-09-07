import { AiResultCache, RoutedAiRuntime } from "@/lib/ai-runtime/runtime";
import { InMemoryAiUsageLedger } from "@/lib/ai-runtime/usage";
import { AnthropicAiAdapter } from "./adapters/anthropicAdapter";
import { GoogleAiAdapter } from "./adapters/googleAdapter";
import { OpenAiAdapter } from "./adapters/openaiAdapter";
import { ReplicateAiAdapter } from "./adapters/replicateAdapter";
import { AI_DEFAULT_PROFILES, createAiRouteTable } from "./modelManifest";

const ledger = new InMemoryAiUsageLedger(1_000);
const resultCache = new AiResultCache(10 * 60_000, 100);
const DEFAULT_MONTHLY_BUDGET_USD = 10;
const monthlyBudgetUsd =
  parsePositiveNumber(process.env.AI_MONTHLY_BUDGET_USD) ?? DEFAULT_MONTHLY_BUDGET_USD;

export type ServerAiCredentials = {
  replicateToken?: string;
  accountId?: string;
};

export function createServerAiRuntime(credentials: ServerAiCredentials = {}): RoutedAiRuntime {
  return new RoutedAiRuntime({
    adapters: [
      new AnthropicAiAdapter(),
      new ReplicateAiAdapter(credentials.replicateToken),
      new GoogleAiAdapter(),
      new OpenAiAdapter(),
    ],
    routes: createAiRouteTable(),
    defaultProfiles: AI_DEFAULT_PROFILES,
    ledger,
    cache: credentials.replicateToken ? new AiResultCache(10 * 60_000, 100) : resultCache,
    monthlyBudgetUsd,
  });
}

const runtime = createServerAiRuntime();

export function getServerAiRuntime(credentials: ServerAiCredentials = {}): RoutedAiRuntime {
  return credentials.replicateToken || credentials.accountId
    ? createServerAiRuntime(credentials)
    : runtime;
}

export function getAiBudgetStatus(accountId?: string) {
  return {
    monthlyBudgetUsd,
    monthlyUsage: ledger.summary(undefined, accountId),
    persistence: "memory" as const,
  };
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
