import { AiResultCache, RoutedAiRuntime } from "@/lib/ai-runtime/runtime";
import { InMemoryAiUsageLedger } from "@/lib/ai-runtime/usage";
import { AnthropicAiAdapter } from "./adapters/anthropicAdapter";
import { GoogleAiAdapter } from "./adapters/googleAdapter";
import { OpenAiAdapter } from "./adapters/openaiAdapter";
import { ReplicateAiAdapter } from "./adapters/replicateAdapter";
import { AI_DEFAULT_PROFILES, createAiRouteTable } from "./modelManifest";

const ledger = new InMemoryAiUsageLedger(1_000);
const resultCache = new AiResultCache(10 * 60_000, 100);

export type ServerAiCredentials = {
  replicateToken?: string;
  openAiApiKey?: string;
  accountId?: string;
};

export function createServerAiRuntime(credentials: ServerAiCredentials = {}): RoutedAiRuntime {
  const routeEnv = {
    ...process.env,
    ...(credentials.openAiApiKey ? { OPENAI_API_KEY: credentials.openAiApiKey } : {}),
    ...(credentials.replicateToken ? { REPLICATE_API_TOKEN: credentials.replicateToken } : {}),
  };
  return new RoutedAiRuntime({
    adapters: [
      new AnthropicAiAdapter(),
      new ReplicateAiAdapter(credentials.replicateToken),
      new GoogleAiAdapter(),
      new OpenAiAdapter(credentials.openAiApiKey ?? process.env.OPENAI_API_KEY),
    ],
    routes: createAiRouteTable(routeEnv),
    defaultProfiles: AI_DEFAULT_PROFILES,
    ledger,
    cache:
      credentials.replicateToken || credentials.openAiApiKey
        ? new AiResultCache(10 * 60_000, 100)
        : resultCache,
  });
}

const runtime = createServerAiRuntime();

export function getServerAiRuntime(credentials: ServerAiCredentials = {}): RoutedAiRuntime {
  return credentials.replicateToken || credentials.openAiApiKey || credentials.accountId
    ? createServerAiRuntime(credentials)
    : runtime;
}

export function getAiBudgetStatus(accountId?: string) {
  return {
    monthlyBudgetUsd: null,
    monthlyUsage: ledger.summary(undefined, accountId),
    persistence: "memory" as const,
  };
}
