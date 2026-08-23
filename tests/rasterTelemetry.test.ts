import { beforeEach, describe, expect, it } from "vitest";
import {
  getRasterTelemetrySnapshot,
  recordRasterJob,
  resetRasterTelemetry,
} from "@/lib/raster/telemetry";

describe("Raster telemetry", () => {
  beforeEach(() => resetRasterTelemetry());

  it("keeps bounded percentile stats and failure counts per job kind", () => {
    for (let index = 1; index <= 70; index++) recordRasterJob("magicWand", index, index !== 70);

    const stats = getRasterTelemetrySnapshot().magicWand;
    expect(stats.count).toBe(64);
    expect(stats.lastMs).toBe(70);
    expect(stats.p95Ms).toBeGreaterThanOrEqual(65);
    expect(stats.failures).toBe(1);
  });
});
