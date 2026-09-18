import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, undoWithMetadata } from "@/lib/engine/history";
import { createEmptyEngineDoc } from "@/lib/engine/store";

describe("history raster selection snapshots", () => {
  it("reports undefined selection when a document-only snapshot was pushed", () => {
    const history = createHistory();
    const first = createEmptyEngineDoc("one");
    const second = createEmptyEngineDoc("two");
    pushHistory(history, first, "edit");
    const transition = undoWithMetadata(history, second, undefined);
    expect(transition?.rasterSelection).toBeUndefined();
  });
});
