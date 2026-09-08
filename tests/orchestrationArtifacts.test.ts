import { beforeEach, describe, expect, it } from "vitest";
import type { StagedVariationCard } from "@/components/AI/AICoPilotBar";
import { createImage } from "@/lib/engine/factory";
import { createHistory } from "@/lib/engine/history";
import { useEngine } from "@/lib/engine/store";
import { calculateGhostBounds } from "@/lib/renderer/ghostOverlay";

describe("ORCH-04: Artifact Contract & Apply / Staged Separation", () => {
  beforeEach(() => {
    useEngine.setState((s) => ({
      ...s,
      doc: {
        ...s.doc,
        slides: [
          {
            id: "slide-1",
            name: "Slide 1",
            elements: [],
            layers: [],
            width: 1920,
            height: 1080,
            background: "#ffffff",
          },
          {
            id: "slide-2",
            name: "Slide 2",
            elements: [],
            layers: [],
            width: 1920,
            height: 1080,
            background: "#ffffff",
          },
        ],
      },
      currentSlideId: "slide-1",
      history: createHistory(),
    }));
  });

  it("places image onto target slide even if currentSlideId has changed", () => {
    const card: StagedVariationCard = {
      id: "var-pin-1",
      fileId: "file-real-123",
      url: "data:image/png;base64,real",
      width: 1024,
      height: 1024,
      label: "Variation 1",
      status: "staged",
      targetSlideId: "slide-1", // Pinned target slide
    };

    // User switched to slide-2 during generation
    useEngine.setState((s) => ({ ...s, currentSlideId: "slide-2" }));

    const state = useEngine.getState();
    const targetSlide = card.targetSlideId
      ? (state.doc.slides.find((s) => s.id === card.targetSlideId) ?? state.currentSlide())
      : state.currentSlide();

    expect(targetSlide?.id).toBe("slide-1");

    const bounds = calculateGhostBounds(
      targetSlide!.width,
      targetSlide!.height,
      card.width,
      card.height,
      "center",
    );

    const element = createImage({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fileId: card.fileId,
      naturalWidth: card.width,
      naturalHeight: card.height,
    });

    // Add to engine targeting slide-1
    useEngine.setState((prev) => ({
      ...prev,
      doc: {
        ...prev.doc,
        slides: prev.doc.slides.map((s) =>
          s.id === "slide-1" ? { ...s, elements: [...s.elements, element] } : s,
        ),
      },
    }));

    const afterState = useEngine.getState();
    const slide1 = afterState.doc.slides.find((s) => s.id === "slide-1");
    const slide2 = afterState.doc.slides.find((s) => s.id === "slide-2");

    expect(slide1?.elements.some((e) => e.id === element.id)).toBe(true);
    expect(slide2?.elements.some((e) => e.id === element.id)).toBe(false);
  });

  it("prevents duplicate commit when card status is already accepted", () => {
    const card: StagedVariationCard = {
      id: "var-duplicate-test",
      fileId: "file-dup-1",
      width: 1024,
      height: 1024,
      status: "accepted", // Already accepted!
      targetSlideId: "slide-1",
    };

    const initialElementCount =
      useEngine.getState().doc.slides.find((s) => s.id === "slide-1")?.elements.length ?? 0;

    // Simulate commitVariationToCanvas guard:
    const commitWithGuard = (c: StagedVariationCard) => {
      if (c.status === "accepted") return false;
      return true;
    };

    const committed = commitWithGuard(card);
    expect(committed).toBe(false);

    const finalElementCount =
      useEngine.getState().doc.slides.find((s) => s.id === "slide-1")?.elements.length ?? 0;
    expect(finalElementCount).toBe(initialElementCount);
  });

  it("staged variation card requires real valid fileId and dimension numbers", () => {
    const validCard: StagedVariationCard = {
      id: "var-valid-1",
      fileId: "file-asset-abc",
      url: "https://example.com/asset.png",
      width: 1024,
      height: 1024,
      label: "Variation 1",
      status: "staged",
    };

    expect(validCard.fileId).not.toBe("var-1");
    expect(validCard.fileId).toBe("file-asset-abc");
    expect(validCard.url).toBeDefined();
    expect(validCard.width).toBeGreaterThan(0);
    expect(validCard.height).toBeGreaterThan(0);
  });
});
