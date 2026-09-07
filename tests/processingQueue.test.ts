import { afterEach, describe, expect, it } from "vitest";
import { clearProcessingPreview, getProcessingPreviews } from "@/lib/engine/processingPreview";
import { cancelProcessingJob, enqueueProcessingJob } from "@/lib/engine/processingQueue";

describe("processing queue", () => {
  afterEach(() => {
    for (const preview of [...getProcessingPreviews()]) {
      clearProcessingPreview(preview.id);
    }
  });

  it("runs jobs in FIFO order while keeping the queued preview visible", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueueProcessingJob({
      preview: {
        kind: "vectorize",
        label: "First",
        x: 100,
        y: 80,
        width: 640,
        height: 360,
        progress: 0,
      },
      run: async () => {
        events.push("first:start");
        await firstGate;
        events.push("first:end");
      },
    });
    const second = enqueueProcessingJob({
      preview: {
        kind: "extract",
        label: "Second",
        x: 900,
        y: 80,
        width: 640,
        height: 360,
        progress: 0,
      },
      run: async () => {
        events.push("second:start");
      },
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    expect(getProcessingPreviews()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, phase: "running" }),
        expect.objectContaining({ id: second.id, phase: "queued", queuePosition: 1 }),
      ]),
    );

    releaseFirst();
    await Promise.all([first.promise, second.promise]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(getProcessingPreviews()).toHaveLength(0);
  });

  it("cancels a queued job without stopping the active job", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const events: string[] = [];

    const first = enqueueProcessingJob({
      preview: {
        kind: "remove-bg",
        label: "First",
        x: 100,
        y: 80,
        width: 640,
        height: 360,
        progress: 0,
      },
      run: async () => {
        events.push("first:start");
        await firstGate;
        events.push("first:end");
      },
    });
    const second = enqueueProcessingJob({
      preview: {
        kind: "vectorize",
        label: "Second",
        x: 900,
        y: 80,
        width: 640,
        height: 360,
        progress: 0,
      },
      run: async () => {
        events.push("second:start");
      },
    });

    cancelProcessingJob(second.id);
    expect(getProcessingPreviews().map((preview) => preview.id)).toEqual([first.id]);
    releaseFirst();
    await first.promise;
    await second.promise;
    expect(events).toEqual(["first:start", "first:end"]);
  });

  it("cancels a queued job when its caller signal aborts", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const controller = new AbortController();
    const events: string[] = [];

    const first = enqueueProcessingJob({
      preview: {
        kind: "generate",
        label: "First",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        progress: 0,
      },
      run: async () => {
        events.push("first:start");
        await firstGate;
      },
    });
    const second = enqueueProcessingJob({
      signal: controller.signal,
      preview: {
        kind: "generate",
        label: "Second",
        x: 120,
        y: 0,
        width: 100,
        height: 100,
        progress: 0,
      },
      run: async () => {
        events.push("second:start");
      },
    });

    controller.abort();
    await second.promise;
    expect(events).toEqual(["first:start"]);
    expect(getProcessingPreviews().map((preview) => preview.id)).toEqual([first.id]);

    releaseFirst();
    await first.promise;
  });
});
