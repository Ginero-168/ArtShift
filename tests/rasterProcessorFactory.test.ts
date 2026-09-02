import { describe, expect, it } from "vitest";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";
import { getRasterProcessor } from "@/lib/raster/processorFactory";

describe("unified raster processor entry point", () => {
  it("returns the local-first processor without a user-selectable mode", () => {
    expect(getRasterProcessor()).toBe(getLocalRasterProcessor());
  });
});
