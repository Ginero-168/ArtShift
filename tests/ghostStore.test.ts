import { beforeEach, describe, expect, it } from "vitest";
import { useEngine } from "@/lib/engine/store";
import type { GhostVariationOverlay } from "@/lib/renderer/ghostOverlay";

describe("Engine Store Ghost Overlay Integration", () => {
  beforeEach(() => {
    useEngine.getState().clearGhostOverlay();
  });

  it("initializes activeGhostOverlay as null", () => {
    expect(useEngine.getState().activeGhostOverlay).toBeNull();
  });

  it("sets and clears activeGhostOverlay correctly", () => {
    const mockOverlay: GhostVariationOverlay = {
      variationId: "var-ghost-test-1",
      image: {} as CanvasImageSource,
      x: 100,
      y: 150,
      width: 400,
      height: 300,
      opacity: 0.85,
      label: "Variation 1 (Nebula)",
    };

    useEngine.getState().setGhostOverlay(mockOverlay);
    expect(useEngine.getState().activeGhostOverlay).toEqual(mockOverlay);

    useEngine.getState().clearGhostOverlay();
    expect(useEngine.getState().activeGhostOverlay).toBeNull();
  });
});
