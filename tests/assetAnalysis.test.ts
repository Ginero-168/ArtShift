import { describe, expect, it, vi } from "vitest";
import {
  type AssetAnalysisResult,
  createAssetAnalysisScheduler,
  summarizeAssetPixels,
} from "@/lib/vision/assetAnalysis";

const readyResult: AssetAnalysisResult = {
  fileId: "asset-1",
  sourceWidth: 1200,
  sourceHeight: 800,
  sampleWidth: 768,
  sampleHeight: 512,
  alphaCoverage: 0.42,
  hasTransparency: true,
  alphaComponents: [{ x_min: 0.1, y_min: 0.1, x_max: 0.4, y_max: 0.5, area: 100 }],
  analyzedAt: 1,
  mode: "alpha",
};

describe("asset analysis scheduler", () => {
  it("exposes progress and publishes one ready result for an asset", async () => {
    const analyze = vi.fn(async (_input, _signal, onProgress) => {
      onProgress?.(0.5, "sampling");
      return readyResult;
    });
    const runNow = (task: () => void) => task();
    const scheduler = createAssetAnalysisScheduler({ analyze, schedule: runNow });
    const listener = vi.fn();

    scheduler.subscribe(listener);
    scheduler.enqueue({
      fileId: "asset-1",
      dataURL: "data:image/png;base64,asset",
      width: 1200,
      height: 800,
    });
    await scheduler.whenIdle();

    expect(analyze).toHaveBeenCalledOnce();
    expect(scheduler.get("asset-1")).toMatchObject({
      status: "ready",
      progress: 1,
      result: readyResult,
    });
    expect(listener).toHaveBeenCalled();
  });

  it("deduplicates an asset already queued or ready", async () => {
    const analyze = vi.fn(async () => readyResult);
    const runNow = (task: () => void) => task();
    const scheduler = createAssetAnalysisScheduler({ analyze, schedule: runNow });
    const input = {
      fileId: "asset-1",
      dataURL: "data:image/png;base64,asset",
      width: 1200,
      height: 800,
    };

    scheduler.enqueue(input);
    scheduler.enqueue(input);
    await scheduler.whenIdle();
    scheduler.enqueue(input);
    await scheduler.whenIdle();

    expect(analyze).toHaveBeenCalledOnce();
  });

  it("cancels an active analysis without publishing a false ready state", async () => {
    let resolveAnalysis: ((result: AssetAnalysisResult) => void) | undefined;
    const analyze = vi.fn(
      (_input: unknown, signal: AbortSignal) =>
        new Promise<AssetAnalysisResult>((resolve, reject) => {
          resolveAnalysis = resolve;
          signal.addEventListener("abort", () => {
            const error = new Error("cancelled");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const schedule = (task: () => void) => task();
    const scheduler = createAssetAnalysisScheduler({ analyze, schedule });

    scheduler.enqueue({
      fileId: "asset-1",
      dataURL: "data:image/png;base64,asset",
      width: 1200,
      height: 800,
    });
    await Promise.resolve();
    scheduler.cancel("asset-1");
    resolveAnalysis?.(readyResult);
    await scheduler.whenIdle();

    expect(scheduler.get("asset-1")).toMatchObject({ status: "cancelled", progress: 0 });
  });
});

describe("asset pixel analysis", () => {
  it("finds transparent foreground components without running a model", () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0,
      0, 0, 0,
    ]);

    const result = summarizeAssetPixels("asset-alpha", 4, 2, rgba, 4, 2);

    expect(result.hasTransparency).toBe(true);
    expect(result.alphaCoverage).toBe(0.25);
    expect(result.alphaComponents).toEqual([
      { x_min: 0, y_min: 0.5, x_max: 0.5, y_max: 1, area: 2 },
    ]);
    expect(result.mode).toBe("alpha");
  });
});
