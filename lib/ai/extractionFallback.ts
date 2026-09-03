import type { ModelStatus } from "./modelRegistry";

export type RmbgRuntime = "local" | "vps-fallback";

export type RmbgFallbackInput = {
  localStatus: ModelStatus;
  allowServerFallback: boolean;
  runLocal: () => Promise<string>;
  runServer: () => Promise<string>;
  onRuntime?: (runtime: RmbgRuntime) => void;
  onServerFallback?: () => void;
};

/** Use the VPS only when the browser model is not ready and consent exists. */
export function shouldUseServerRmbg(
  localStatus: ModelStatus,
  allowServerFallback: boolean,
): boolean {
  return allowServerFallback && localStatus !== "loaded";
}

/**
 * Execute one RMBG operation without coupling model warmup to document mutation.
 * A failed VPS attempt falls back to the browser runtime so the feature remains
 * useful when the server queue is unavailable.
 */
export async function runRmbgWithFallback({
  localStatus,
  allowServerFallback,
  runLocal,
  runServer,
  onRuntime,
  onServerFallback,
}: RmbgFallbackInput): Promise<{ dataUrl: string; runtime: RmbgRuntime }> {
  if (shouldUseServerRmbg(localStatus, allowServerFallback)) {
    try {
      onServerFallback?.();
      const dataUrl = await runServer();
      onRuntime?.("vps-fallback");
      return { dataUrl, runtime: "vps-fallback" };
    } catch {
      // The local runtime is still a valid fallback if the VPS is unavailable.
    }
  }

  try {
    const dataUrl = await runLocal();
    onRuntime?.("local");
    return { dataUrl, runtime: "local" };
  } catch (localError) {
    if (!allowServerFallback || shouldUseServerRmbg(localStatus, allowServerFallback)) {
      throw localError;
    }
    onServerFallback?.();
    const dataUrl = await runServer();
    onRuntime?.("vps-fallback");
    return { dataUrl, runtime: "vps-fallback" };
  }
}
