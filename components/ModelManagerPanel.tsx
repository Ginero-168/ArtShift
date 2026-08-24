"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  type CacheStorageReport,
  clearAllCacheStorage,
  clearKnownModelCaches,
  clearModelCache,
  formatBytes,
  getModelStates,
  inspectModelCache,
  type ModelCacheInfo,
  type ModelState,
  releaseAllModelRuntimes,
  releaseModelRuntime,
  subscribeModelRegistry,
} from "@/lib/ai/modelRegistry";
import type { AiCapabilities, AiProviderStatus } from "@/lib/ai-runtime/contracts";

type ModelManagerPanelProps = {
  onResetProject: () => void;
};

type RemoteAiReport = {
  capabilities: AiCapabilities;
  budget: {
    monthlyBudgetUsd?: number;
    persistence: "memory";
    monthlyUsage: {
      requests: number;
      failures: number;
      estimatedUsd: number;
      inputTokens: number;
      outputTokens: number;
    };
  };
};

const EMPTY_SERVER_SNAPSHOT = getModelStates;

function statusLabel(model: ModelState, cache?: ModelCacheInfo): string {
  if (model.status === "loading") return `${Math.round(model.progress * 100)}% loading`;
  if (model.status === "loaded") return "Loaded in memory";
  if (model.status === "failed") return "Failed";
  if (cache?.status === "cached") return "Lazy · cached";
  return model.lazy ? "Lazy load" : "Not loaded";
}

function statusTone(model: ModelState): string {
  if (model.status === "loaded") return "is-loaded";
  if (model.status === "loading") return "is-loading";
  if (model.status === "failed") return "is-failed";
  return "is-lazy";
}

function formatStorageUsage(report: CacheStorageReport | null): string {
  if (!report?.usageBytes) return "Storage usage unavailable";
  return `${formatBytes(report.usageBytes)} used${report.quotaBytes ? ` of ${formatBytes(report.quotaBytes)}` : ""}`;
}

function providerTone(provider: AiProviderStatus): string {
  if (provider.state === "ready") return "is-loaded";
  if (provider.state === "degraded") return "is-loading";
  return "is-failed";
}

function formatProviderPricing(provider: AiProviderStatus): string {
  const pricing = provider.models.find((model) => model.pricing)?.pricing;
  if (!pricing) return "Pricing unavailable";
  if (typeof pricing.perRunUsd === "number") return `$${pricing.perRunUsd.toFixed(4)} / run`;
  if (
    typeof pricing.inputPerMillionTokens === "number" ||
    typeof pricing.outputPerMillionTokens === "number"
  ) {
    return `$${pricing.inputPerMillionTokens ?? "—"} in · $${pricing.outputPerMillionTokens ?? "—"} out / 1M`;
  }
  return pricing.note ?? "Usage-based pricing";
}

export default function ModelManagerPanel({ onResetProject }: ModelManagerPanelProps) {
  const models = useSyncExternalStore(
    subscribeModelRegistry,
    getModelStates,
    EMPTY_SERVER_SNAPSHOT,
  );
  const [report, setReport] = useState<CacheStorageReport | null>(null);
  const [remoteReport, setRemoteReport] = useState<RemoteAiReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setReport(await inspectModelCache());
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      if (response.ok) setRemoteReport((await response.json()) as RemoteAiReport);
      else setRemoteReport(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not inspect browser storage.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (id: string, action: () => Promise<{ deleted?: number; success?: boolean } | null>) => {
      setBusyId(id);
      setNotice(null);
      try {
        const result = await action();
        if (result && "success" in result && result.success === false) {
          setNotice("The browser blocked part of this cache operation.");
        } else {
          const deleted = result && "deleted" in result ? result.deleted : undefined;
          setNotice(
            deleted ? `Removed ${deleted} cached file${deleted === 1 ? "" : "s"}.` : "Done.",
          );
        }
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Cache operation failed.");
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const clearRemoteResultCache = useCallback(async () => {
    setBusyId("remote-result-cache");
    setNotice(null);
    try {
      const response = await fetch("/api/ai/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-result-cache" }),
      });
      if (!response.ok) throw new Error("Could not clear the server AI result cache.");
      setNotice("Server AI result cache cleared.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI cache operation failed.");
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const loadedCount = models.filter((model) => model.status === "loaded").length;
  const loadingCount = models.filter((model) => model.status === "loading").length;
  const cachedCount = models.filter(
    (model) => report?.models[model.id]?.status === "cached",
  ).length;
  const storageRatio =
    report?.usageBytes && report.quotaBytes
      ? Math.min(100, Math.round((report.usageBytes / report.quotaBytes) * 100))
      : 0;

  return (
    <section className="model-manager" aria-label="Model and cache manager">
      <div className="model-manager-head">
        <div>
          <div className="model-manager-kicker">Local runtime</div>
          <h2>Models & cache</h2>
          <p>Models load only when a feature needs them.</p>
        </div>
        <button
          className="model-manager-icon-button"
          onClick={() => void refresh()}
          disabled={refreshing}
          title="Refresh model and cache status"
          aria-label="Refresh model and cache status"
        >
          <span className={refreshing ? "model-manager-spin" : ""}>↻</span>
        </button>
      </div>

      <div className="model-manager-summary">
        <div>
          <strong>{loadedCount}</strong>
          <span>Loaded</span>
        </div>
        <div>
          <strong>{loadingCount}</strong>
          <span>Loading</span>
        </div>
        <div>
          <strong>{cachedCount}</strong>
          <span>Cached</span>
        </div>
      </div>

      <div className="model-manager-storage">
        <div className="model-manager-row-head">
          <span>Browser storage</span>
          <span>{formatStorageUsage(report)}</span>
        </div>
        <div className="model-manager-storage-track" aria-hidden="true">
          <div style={{ width: `${storageRatio}%` }} />
        </div>
        <div className="model-manager-storage-meta">
          <span>Known model cache: {formatBytes(report?.totalModelBytes)}</span>
          <span>{report?.totalModelEntries ?? 0} files</span>
        </div>
      </div>

      <div className="model-manager-list">
        {models.map((model) => {
          const cache = report?.models[model.id];
          const busy = busyId === model.id;
          return (
            <article className="model-manager-card" key={model.id}>
              <div className="model-manager-card-head">
                <span className={`model-manager-dot ${statusTone(model)}`} aria-hidden="true" />
                <div className="model-manager-card-title">
                  <strong>{model.label}</strong>
                  <span>{model.provider}</span>
                </div>
                <span className={`model-manager-status ${statusTone(model)}`}>
                  {statusLabel(model, cache)}
                </span>
              </div>
              <p>{model.description}</p>
              {model.status === "loading" && (
                <div
                  className="model-manager-progress"
                  role="progressbar"
                  aria-label={`${model.label} loading progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(model.progress * 100)}
                >
                  <div style={{ width: `${Math.round(model.progress * 100)}%` }} />
                </div>
              )}
              {model.error && <div className="model-manager-error">{model.error}</div>}
              <div className="model-manager-card-foot">
                <span>
                  {model.kind === "runtime"
                    ? "Runtime memory"
                    : cache?.status === "cached"
                      ? `${formatBytes(cache.bytes)} cached`
                      : "No cached files found"}
                </span>
                <div className="model-manager-card-actions">
                  {model.status === "loaded" && (
                    <button
                      className="model-manager-mini-button"
                      onClick={() =>
                        void runAction(model.id, async () => {
                          await releaseModelRuntime(model.id);
                          return null;
                        })
                      }
                      disabled={busy}
                    >
                      Release RAM
                    </button>
                  )}
                  {cache?.status === "cached" && (
                    <button
                      className="model-manager-mini-button is-danger"
                      onClick={() => void runAction(model.id, () => clearModelCache(model.id))}
                      disabled={busy}
                    >
                      Clear cache
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="model-manager-section-head">
        <div>
          <div className="model-manager-kicker">Remote runtime</div>
          <h3>Providers & usage</h3>
        </div>
        <span>
          {remoteReport
            ? `${remoteReport.budget.monthlyUsage.requests} requests this month`
            : "Unavailable"}
        </span>
      </div>

      {remoteReport && (
        <>
          <div className="model-manager-storage">
            <div className="model-manager-row-head">
              <span>Estimated monthly AI cost</span>
              <span>${remoteReport.budget.monthlyUsage.estimatedUsd.toFixed(4)}</span>
            </div>
            <div className="model-manager-storage-meta">
              <span>
                {remoteReport.budget.monthlyUsage.inputTokens.toLocaleString()} input ·{" "}
                {remoteReport.budget.monthlyUsage.outputTokens.toLocaleString()} output tokens
              </span>
              <span>
                {remoteReport.budget.monthlyBudgetUsd
                  ? `$${remoteReport.budget.monthlyBudgetUsd.toFixed(2)} budget`
                  : "No server budget configured"}{" "}
                · in-memory estimate
              </span>
            </div>
          </div>

          <div className="model-manager-list">
            {remoteReport.capabilities.providers.map((provider) => (
              <article className="model-manager-card" key={provider.id}>
                <div className="model-manager-card-head">
                  <span
                    className={`model-manager-dot ${providerTone(provider)}`}
                    aria-hidden="true"
                  />
                  <div className="model-manager-card-title">
                    <strong>{provider.label}</strong>
                    <span>{provider.tasks.join(" · ") || "No exposed tasks"}</span>
                  </div>
                  <span className={`model-manager-status ${providerTone(provider)}`}>
                    {provider.state === "ready" ? "Ready" : provider.state.replace("-", " ")}
                  </span>
                </div>
                <p>{provider.message ?? formatProviderPricing(provider)}</p>
                <div className="model-manager-card-foot">
                  <span>
                    {provider.models.map((model) => model.alias ?? model.id).join(" · ") ||
                      "No models"}
                  </span>
                  <span>{formatProviderPricing(provider)}</span>
                </div>
              </article>
            ))}
          </div>

          <button
            className="model-manager-action-button"
            onClick={() => void clearRemoteResultCache()}
            disabled={busyId !== null}
          >
            Clear server AI result cache
          </button>
        </>
      )}

      <div className="model-manager-actions">
        <button
          className="model-manager-action-button"
          onClick={() => void runAction("all-models", clearKnownModelCaches)}
          disabled={busyId !== null}
        >
          Clear model cache
        </button>
        <button
          className="model-manager-action-button"
          onClick={() =>
            void runAction("all-runtimes", async () => {
              await releaseAllModelRuntimes();
              return null;
            })
          }
          disabled={busyId !== null}
        >
          Release all RAM
        </button>
        <button
          className="model-manager-action-button is-danger"
          onClick={() => {
            if (
              confirm(
                "Clear every CacheStorage entry for this browser origin? This may remove non-model app caches too.",
              )
            ) {
              void runAction("all-cache-storage", clearAllCacheStorage);
            }
          }}
          disabled={busyId !== null}
        >
          Clear all CacheStorage
        </button>
      </div>

      <div className="model-manager-note">
        <strong>Control boundary</strong>
        <span>
          ArtShift can manage known model files and its runtime memory. Browser storage usage may
          include other app data and is reported as an estimate.
        </span>
      </div>

      {notice && <div className="model-manager-notice">{notice}</div>}

      <div className="model-manager-reset">
        <button onClick={onResetProject}>Reset project data…</button>
      </div>
    </section>
  );
}
