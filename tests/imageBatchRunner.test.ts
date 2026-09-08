import { describe, expect, it, vi } from "vitest";
import type { CreativeDirection } from "@/lib/ai/orchestration/creativeDirector";
import {
  MAX_IMAGE_OUTPUTS_PER_BATCH,
  planImageBatches,
  runContextAwareImageRun,
} from "@/lib/ai/orchestration/imageBatchRunner";
import type { ContextAwareTaskResult } from "@/lib/ai/orchestration/imageTaskRunner";
import { computeMultiImagePlacement } from "@/lib/ai/orchestration/imageTaskRunner";
import {
  type ContextAwareTurnInput,
  createDirectedImageRun,
} from "@/lib/ai/orchestration/turnOrchestrator";
import { createEngineLayer } from "@/lib/engine/layers";

const mockSlide = {
  id: "slide-1",
  name: "Hero",
  width: 1920,
  height: 1080,
  background: "#fff",
  layers: [createEngineLayer("free", { name: "Main" })],
  elements: [],
};

const baseInput: ContextAwareTurnInput = {
  prompt: "สร้างภาพ 3 ภาพ สำหรับโปรโมทกาแฟ",
  refs: [],
  analyses: [],
  canvas: { slide: mockSlide, selectedIds: new Set() },
};

const baseDirection: Extract<CreativeDirection, { kind: "image-task" }> = {
  kind: "image-task",
  outputCount: 1,
  requestedOutputCount: 3,
  summary: "สร้างภาพกาแฟ 3 รูปแบบ",
  refinedPrompt: "Coffee cup in warm morning lighting",
  specialist: "image_generator",
  capability: "IMAGE_DEFAULT",
  modelAlias: "image-gpt-2",
  knowledgeSkillIds: [],
  reviewCriteria: ["Professional presentation"],
  search: { required: false, queries: [], sources: [] },
  outputBriefs: [
    "Espresso shot with rich crema",
    "Iced caramel latte in tall glass",
    "Pour over coffee being brewed",
  ],
};

describe("image batch runner & multi-image orchestration", () => {
  describe("planImageBatches", () => {
    it("plans a single batch for 1 to 5 images", () => {
      expect(planImageBatches(1)).toEqual([{ index: 1, itemIndexes: [0] }]);
      expect(planImageBatches(3)).toEqual([{ index: 1, itemIndexes: [0, 1, 2] }]);
      expect(planImageBatches(5)).toEqual([{ index: 1, itemIndexes: [0, 1, 2, 3, 4] }]);
    });

    it("splits runs into batches capped at MAX_IMAGE_OUTPUTS_PER_BATCH (5)", () => {
      const batches = planImageBatches(8);
      expect(batches).toHaveLength(2);
      expect(batches[0]).toEqual({ index: 1, itemIndexes: [0, 1, 2, 3, 4] });
      expect(batches[1]).toEqual({ index: 2, itemIndexes: [5, 6, 7] });
    });

    it("throws on non-integer, 0, or count > 100", () => {
      expect(() => planImageBatches(0)).toThrow();
      expect(() => planImageBatches(-1)).toThrow();
      expect(() => planImageBatches(2.5)).toThrow();
      expect(() => planImageBatches(101)).toThrow();
    });
  });

  describe("computeMultiImagePlacement", () => {
    it("returns baseBounds unchanged when outputCount <= 1 or placement undefined", () => {
      const base = { x: 100, y: 100, width: 400, height: 400 };
      expect(computeMultiImagePlacement(base, undefined, 1920, 1080)).toEqual(base);
      expect(
        computeMultiImagePlacement(base, { outputIndex: 1, requestedOutputCount: 1 }, 1920, 1080),
      ).toEqual(base);
    });

    it("positions 1-5 images side by side without overlapping", () => {
      const base = { x: 200, y: 200, width: 300, height: 300 };
      const count = 3;
      const placements = [1, 2, 3].map((outputIndex) =>
        computeMultiImagePlacement(base, { outputIndex, requestedOutputCount: count }, 1920, 1080),
      );

      expect(placements).toHaveLength(3);
      // All items should have equal width and height
      expect(placements[0].width).toBe(placements[1].width);
      expect(placements[1].width).toBe(placements[2].width);
      // Each consecutive item must have x >= previous.x + previous.width (no overlap!)
      expect(placements[1].x).toBeGreaterThanOrEqual(placements[0].x + placements[0].width);
      expect(placements[2].x).toBeGreaterThanOrEqual(placements[1].x + placements[1].width);
      // All items stay within slide width (1920)
      expect(placements[2].x + placements[2].width).toBeLessThanOrEqual(1920);
    });

    it("scales down proportionally when 5 images exceed available width", () => {
      const base = { x: 0, y: 0, width: 600, height: 600 };
      const count = 5;
      const placements = [1, 2, 3, 4, 5].map((outputIndex) =>
        computeMultiImagePlacement(base, { outputIndex, requestedOutputCount: count }, 1000, 1000),
      );

      // Total row must fit within slide width 1000
      const last = placements[4];
      expect(last.x + last.width).toBeLessThanOrEqual(1000);
      for (let i = 1; i < count; i++) {
        expect(placements[i].x).toBeGreaterThanOrEqual(
          placements[i - 1].x + placements[i - 1].width,
        );
      }
    });
  });

  describe("createDirectedImageRun", () => {
    it("creates a valid DirectedImageRun with distinct task plans and briefs", () => {
      const run = createDirectedImageRun(baseInput, baseDirection);

      expect(run.requestedOutputCount).toBe(3);
      expect(run.maxBatchSize).toBe(MAX_IMAGE_OUTPUTS_PER_BATCH);
      expect(run.totalBatches).toBe(1);
      expect(run.tasks).toHaveLength(3);
      expect(run.batches).toEqual([{ index: 1, itemIndexes: [0, 1, 2] }]);

      // Check task metadata
      expect(run.tasks[0].prompt).toContain("Espresso shot with rich crema");
      expect(run.tasks[1].prompt).toContain("Iced caramel latte in tall glass");
      expect(run.tasks[2].prompt).toContain("Pour over coffee being brewed");

      expect(run.tasks[0].imageRun).toEqual({
        runId: run.id,
        outputIndex: 1,
        requestedOutputCount: 3,
        batchIndex: 1,
        totalBatches: 1,
        maxBatchSize: 5,
      });
      expect(run.tasks[1].imageRun?.outputIndex).toBe(2);
      expect(run.tasks[2].imageRun?.outputIndex).toBe(3);
    });
  });

  describe("runContextAwareImageRun execution", () => {
    it("fails closed when explicit cloud consent is missing", async () => {
      const run = createDirectedImageRun(baseInput, baseDirection);
      await expect(runContextAwareImageRun(run, [])).rejects.toThrow(
        "Explicit cloud consent is required",
      );
    });

    it("executes 1-5 tasks concurrently within the batch", async () => {
      const run = createDirectedImageRun(baseInput, baseDirection);
      const executionLog: string[] = [];
      let activeConcurrentCount = 0;
      let maxSeenConcurrent = 0;

      const mockExecutor = vi.fn(async (task) => {
        activeConcurrentCount++;
        maxSeenConcurrent = Math.max(maxSeenConcurrent, activeConcurrentCount);
        executionLog.push(`start:${task.id}`);
        // Small delay to simulate async network latency
        await new Promise((resolve) => setTimeout(resolve, 15));
        activeConcurrentCount--;
        executionLog.push(`end:${task.id}`);
        return {
          task,
          elementId: `el-${task.id}`,
          width: 1024,
          height: 1024,
        } as ContextAwareTaskResult;
      });

      const result = await runContextAwareImageRun(run, [], {
        cloudConsent: true,
        executeTask: mockExecutor,
      });

      expect(result.status).toBe("succeeded");
      expect(result.completedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(mockExecutor).toHaveBeenCalledTimes(3);
      // All 3 tasks should have run concurrently at the same time
      expect(maxSeenConcurrent).toBe(3);
    });

    it("emits progress updates for batch and individual items", async () => {
      const run = createDirectedImageRun(baseInput, baseDirection);
      const updates: string[] = [];

      const mockExecutor = vi.fn(async (task, _refs, options) => {
        options.onUpdate?.({
          stage: "generating",
          message: "Generating image...",
          attempt: 1,
          quality: "medium",
        });
        return {
          task,
          elementId: `el-${task.id}`,
          width: 1024,
          height: 1024,
        } as ContextAwareTaskResult;
      });

      await runContextAwareImageRun(run, [], {
        cloudConsent: true,
        executeTask: mockExecutor,
        onUpdate: (update) => {
          updates.push(`${update.stage}:${update.outputIndex}`);
        },
      });

      expect(updates).toContain("batch-start:1");
      expect(updates).toContain("generating:1");
      expect(updates).toContain("generating:2");
      expect(updates).toContain("generating:3");
      expect(updates).toContain("succeeded:1");
      expect(updates).toContain("succeeded:2");
      expect(updates).toContain("succeeded:3");
    });

    it("isolates errors so a failed task does not break other concurrent tasks in the batch", async () => {
      const run = createDirectedImageRun(baseInput, baseDirection);

      const mockExecutor = vi.fn(async (task) => {
        if (task.imageRun?.outputIndex === 2) {
          throw new Error("Provider rate limit reached");
        }
        return {
          task,
          elementId: `el-${task.id}`,
          width: 1024,
          height: 1024,
        } as ContextAwareTaskResult;
      });

      const result = await runContextAwareImageRun(run, [], {
        cloudConsent: true,
        executeTask: mockExecutor,
      });

      expect(result.status).toBe("partial");
      expect(result.completedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.items[0].status).toBe("succeeded");
      expect(result.items[1].status).toBe("failed");
      expect(result.items[1].error).toContain("Provider rate limit");
      expect(result.items[2].status).toBe("succeeded");
    });

    it("cancels gracefully and stops subsequent batches when abort signal triggers", async () => {
      const count = 7; // 2 batches: batch 1 (5 items), batch 2 (2 items)
      const multiBatchDirection: Extract<CreativeDirection, { kind: "image-task" }> = {
        ...baseDirection,
        requestedOutputCount: count,
        outputBriefs: Array.from({ length: count }, (_, i) => `Prompt ${i + 1}`),
      };
      const run = createDirectedImageRun(baseInput, multiBatchDirection);
      expect(run.totalBatches).toBe(2);

      const abortController = new AbortController();
      let callCount = 0;

      const mockExecutor = vi.fn(async (task) => {
        callCount++;
        if (callCount === 2) {
          abortController.abort();
        }
        return {
          task,
          elementId: `el-${task.id}`,
          width: 1024,
          height: 1024,
        } as ContextAwareTaskResult;
      });

      const result = await runContextAwareImageRun(run, [], {
        cloudConsent: true,
        signal: abortController.signal,
        executeTask: mockExecutor,
      });

      expect(result.cancelled).toBe(true);
      expect(result.status).toBe("cancelled");
      // Batch 2 items should remain cancelled without starting
      expect(result.items[5].status).toBe("cancelled");
      expect(result.items[6].status).toBe("cancelled");
    });
  });
});
