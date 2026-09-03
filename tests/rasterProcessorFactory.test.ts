import { describe, expect, it } from "vitest";
import { ApiRasterProcessor } from "@/lib/raster/apiRasterProcessor";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";
import { configureRasterProcessor, getRasterProcessor } from "@/lib/raster/processorFactory";

describe("unified raster processor entry point", () => {
  it("allows a host platform to inject an adapter without exposing a UI mode", () => {
    const injected = new ApiRasterProcessor("/api/raster/process");
    configureRasterProcessor(injected);

    expect(getRasterProcessor()).toBe(injected);

    configureRasterProcessor(null);
    expect(getRasterProcessor()).toBe(getLocalRasterProcessor());
  });

  it("returns the local-first processor without a user-selectable mode", () => {
    const processor = getRasterProcessor();
    expect(processor).toBe(getLocalRasterProcessor());
    expect(processor.capabilities()).toMatchObject({
      progress: true,
      jobKinds: expect.arrayContaining(["magicWand", "selectionMask"]),
    });
  });
});
