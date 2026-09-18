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
  // End-user runtimes (accountId set) must not inherit deploy env BYOK keys.
  // Ops/unscoped runtimes may still use process.env for local/dev adapters.
  const isEndUser = Boolean(credentials.accountId);
  const openAiApiKey = isEndUser
    ? credentials.openAiApiKey || ""
    : (credentials.openAiApiKey ?? process.env.OPENAI_API_KEY);
  const replicateToken = isEndUser
    ? credentials.replicateToken
    : (credentials.replicateToken ?? process.env.REPLICATE_API_TOKEN);
  const routeEnv = {
    ...process.env,
    ...(isEndUser
      ? {
          OPENAI_API_KEY: credentials.openAiApiKey || "",
          REPLICATE_API_TOKEN: credentials.replicateToken || "",
        }
      : {
          ...(credentials.openAiApiKey ? { OPENAI_API_KEY: credentials.openAiApiKey } : {}),
          ...(credentials.replicateToken ? { REPLICATE_API_TOKEN: credentials.replicateToken } : {}),
        }),
  };
  return new RoutedAiRuntime({
    adapters: [
      new AnthropicAiAdapter(),
      new ReplicateAiAdapter(replicateToken),
      new GoogleAiAdapter(),
      new OpenAiAdapter(openAiApiKey),
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
