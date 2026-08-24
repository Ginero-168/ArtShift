import { beforeEach, describe, expect, it } from "vitest";
import {
  getEditorInteractionSnapshot,
  recordEditorInteraction,
  resetEditorTelemetry,
} from "@/lib/perf/editorTelemetry";

describe("editor interaction telemetry", () => {
  beforeEach(() => resetEditorTelemetry());

  it("keeps a bounded p95 for Canvas pointer dispatch", () => {
    for (let index = 1; index <= 140; index++) recordEditorInteraction("pointerMove", index);

    const stats = getEditorInteractionSnapshot().pointerMove;
    expect(stats.count).toBe(128);
    expect(stats.lastMs).toBe(140);
    expect(stats.p95Ms).toBeGreaterThanOrEqual(134);
    expect(stats.maxMs).toBe(140);
  });
});
