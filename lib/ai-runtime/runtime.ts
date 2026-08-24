import type {
  AiCapabilities,
  AiExecution,
  AiExecutionOptions,
  AiExecutionProfile,
  AiModelPricing,
  AiProviderId,
  AiProviderStatus,
  AiRuntime,
  AiTaskInput,
  AiTaskKind,
  AiTaskOutput,
  AiUsage,
} from "./contracts";
import { AiRuntimeError, normalizeAiError } from "./errors";
import { AI_TASK_POLICIES, assertAiTaskPolicy, LOCAL_ONLY_AI_FEATURES } from "./policy";
import { type AiUsageLedger, estimateAiCost, InMemoryAiUsageLedger } from "./usage";

export type AiProviderRequest<K extends AiTaskKind = AiTaskKind> = {
  task: K;
  input: AiTaskInput<K>;
  model: string;
  signal: AbortSignal;
  onTextDelta?: (delta: string) => void;
};

export type AiProviderResult<T> = {
  output: T;
  model?: string;
  requestId?: string;
  finishReason?: string;
  usage?: AiUsage;
  warnings?: string[];
};

export interface AiProviderAdapter {
  readonly id: AiProviderId;
  status(): Promise<AiProviderStatus>;
  execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>>;
}

export type AiRouteTarget = {
  provider: AiProviderId;
  model: string;
  alias?: string;
  pricing?: AiModelPricing;
  expectedMaxUsd?: number;
};

export type AiRouteTable = Partial<
  Record<AiTaskKind, Partial<Record<AiExecutionProfile, readonly AiRouteTarget[]>>>
>;

type RuntimeOptions = {
  adapters: AiProviderAdapter[];
  routes: AiRouteTable;
  defaultProfiles?: Partial<Record<AiTaskKind, AiExecutionProfile>>;
  ledger?: AiUsageLedger;
  monthlyBudgetUsd?: number;
  cache?: AiResultCache;
};

type CacheEntry = { expiresAt: number; value: AiExecution<unknown> };

export class AiResultCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxEntries = 100,
  ) {}

  get(key: string): AiExecution<unknown> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: AiExecution<unknown>): void {
    this.entries.set(key, { expiresAt: Date.now() + this.ttlMs, value });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export class RoutedAiRuntime implements AiRuntime {
  private readonly adapters = new Map<AiProviderId, AiProviderAdapter>();
  private readonly ledger: AiUsageLedger;
  private readonly cache: AiResultCache;

  constructor(private readonly options: RuntimeOptions) {
    for (const adapter of options.adapters) this.adapters.set(adapter.id, adapter);
    this.ledger = options.ledger ?? new InMemoryAiUsageLedger();
    this.cache = options.cache ?? new AiResultCache();
  }

  async execute<K extends AiTaskKind>(
    task: K,
    input: AiTaskInput<K>,
    executionOptions: AiExecutionOptions = {},
  ): Promise<AiExecution<AiTaskOutput<K>>> {
    assertAiTaskPolicy(task, executionOptions);
    this.assertMonthlyBudget();

    const profile = executionOptions.profile ?? this.options.defaultProfiles?.[task] ?? "economy";
    const targets = this.resolveTargets(task, profile, executionOptions);
    if (!targets.length) {
      throw new AiRuntimeError("NO_PROVIDER", `No AI provider route is configured for ${task}.`);
    }

    const attempts = executionOptions.allowFallback ? targets : targets.slice(0, 1);
    let lastError: AiRuntimeError | undefined;
    for (const target of attempts) {
      if (
        typeof executionOptions.maxCostUsd === "number" &&
        typeof target.expectedMaxUsd === "number" &&
        target.expectedMaxUsd > executionOptions.maxCostUsd
      ) {
        lastError = new AiRuntimeError(
          "BUDGET_EXCEEDED",
          `The expected maximum cost of ${target.alias ?? target.model} exceeds the $${executionOptions.maxCostUsd.toFixed(4)} command budget.`,
          { provider: target.provider },
        );
        continue;
      }
      const adapter = this.adapters.get(target.provider);
      if (!adapter) continue;
      const status = await adapter.status();
      if (!status.configured || status.state !== "ready") {
        lastError = new AiRuntimeError(
          status.state === "missing-key" ? "PROVIDER_AUTH" : "PROVIDER_UNAVAILABLE",
          status.message ?? `${status.label} is not available.`,
          { provider: target.provider },
        );
        continue;
      }

      const cacheKey =
        executionOptions.cache !== false && AI_TASK_POLICIES[task].cacheable
          ? await createCacheKey(task, target, input)
          : undefined;
      const cached = cacheKey ? this.cache.get(cacheKey) : undefined;
      if (cached) {
        return {
          ...(cached as AiExecution<AiTaskOutput<K>>),
          metadata: { ...cached.metadata, cached: true },
        };
      }

      const startedAt = performance.now();
      const { signal, dispose } = createExecutionSignal(
        executionOptions.signal,
        executionOptions.timeoutMs ?? 60_000,
      );
      try {
        const result = await adapter.execute({
          task,
          input,
          model: target.model,
          signal,
          onTextDelta: executionOptions.onTextDelta,
        });
        const durationMs = Math.round(performance.now() - startedAt);
        const usage: AiUsage = {
          ...(result.usage ?? {}),
          estimatedUsd: estimateAiCost(result.usage ?? {}, target.pricing),
        };
        if (
          typeof executionOptions.maxCostUsd === "number" &&
          (usage.estimatedUsd ?? 0) > executionOptions.maxCostUsd
        ) {
          throw new AiRuntimeError(
            "BUDGET_EXCEEDED",
            `AI execution cost exceeded the per-command budget of $${executionOptions.maxCostUsd.toFixed(4)}.`,
            { provider: target.provider },
          );
        }
        const execution: AiExecution<AiTaskOutput<K>> = {
          output: result.output,
          metadata: {
            task,
            provider: target.provider,
            model: result.model ?? target.model,
            modelAlias: target.alias,
            requestId: result.requestId,
            finishReason: result.finishReason,
            durationMs,
            usage,
            cached: false,
            warnings: result.warnings ?? [],
          },
        };
        this.ledger.record({
          at: Date.now(),
          task,
          provider: target.provider,
          model: result.model ?? target.model,
          durationMs,
          usage,
          cached: false,
          ok: true,
        });
        if (cacheKey) this.cache.set(cacheKey, execution as AiExecution<unknown>);
        return execution;
      } catch (error) {
        lastError =
          signal.aborted && signal.reason instanceof AiRuntimeError
            ? signal.reason
            : normalizeAiError(error, target.provider);
        this.ledger.record({
          at: Date.now(),
          task,
          provider: target.provider,
          model: target.model,
          durationMs: Math.round(performance.now() - startedAt),
          usage: {},
          cached: false,
          ok: false,
          errorCode: lastError.code,
        });
      } finally {
        dispose();
      }
    }
    throw lastError ?? new AiRuntimeError("NO_PROVIDER", `No available provider can run ${task}.`);
  }

  async capabilities(): Promise<AiCapabilities> {
    const providerStatuses = await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.status()),
    );
    const providers = providerStatuses.map((provider) => ({
      ...provider,
      models: this.routedModelsForProvider(provider.id, provider.models),
    }));
    return {
      tasks: Object.fromEntries(
        Object.entries(AI_TASK_POLICIES).map(([task, policy]) => [
          task,
          {
            locality: policy.locality,
            providers: providers
              .filter((provider) => provider.tasks.includes(task as AiTaskKind))
              .map((provider) => provider.id),
          },
        ]),
      ) as AiCapabilities["tasks"],
      providers,
      localOnlyFeatures: [...LOCAL_ONLY_AI_FEATURES],
    };
  }

  usageSummary() {
    return this.ledger.summary();
  }

  recentUsage(limit = 20) {
    return this.ledger.recent(limit);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private resolveTargets(
    task: AiTaskKind,
    profile: AiExecutionProfile,
    executionOptions: AiExecutionOptions,
  ): AiRouteTarget[] {
    const configured = [...(this.options.routes[task]?.[profile] ?? [])];
    return configured.filter((target) => {
      if (executionOptions.provider && target.provider !== executionOptions.provider) return false;
      if (executionOptions.modelAlias && target.alias !== executionOptions.modelAlias) return false;
      return true;
    });
  }

  private assertMonthlyBudget(): void {
    if (typeof this.options.monthlyBudgetUsd !== "number") return;
    if (this.ledger.summary().estimatedUsd >= this.options.monthlyBudgetUsd) {
      throw new AiRuntimeError(
        "BUDGET_EXCEEDED",
        `The monthly AI budget of $${this.options.monthlyBudgetUsd.toFixed(2)} has been reached.`,
      );
    }
  }

  private routedModelsForProvider(
    provider: AiProviderId,
    fallback: AiProviderStatus["models"],
  ): AiProviderStatus["models"] {
    const models = new Map<string, AiProviderStatus["models"][number]>();
    for (const profileRoutes of Object.values(this.options.routes)) {
      if (!profileRoutes) continue;
      for (const [profile, targets] of Object.entries(profileRoutes)) {
        for (const target of targets ?? []) {
          if (target.provider !== provider) continue;
          const model = {
            id: target.model,
            alias: target.alias,
            profile: profile as AiExecutionProfile,
            pricing: target.pricing,
          };
          models.set(`${model.id}:${model.alias ?? ""}:${model.profile}`, model);
        }
      }
    }
    return models.size ? [...models.values()] : fallback;
  }
}

async function createCacheKey<K extends AiTaskKind>(
  task: K,
  target: AiRouteTarget,
  input: AiTaskInput<K>,
): Promise<string> {
  const serialized = JSON.stringify([task, target.provider, target.model, input]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createExecutionSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(
    () => controller.abort(new AiRuntimeError("TIMEOUT", "AI execution timed out.")),
    Math.max(1, timeoutMs),
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}
