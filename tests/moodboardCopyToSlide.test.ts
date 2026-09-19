import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyEngineDoc, useEngine } from "@/lib/engine/store";
import { copyMoodboardItemsToArtworkSlide } from "@/lib/moodboard/copyToSlide";
import { createMoodboardItem, createMoodboardNote } from "@/lib/moodboard/factory";

describe("copy moodboard items to artwork slide", () => {
  beforeEach(() => {
    useEngine.getState().loadDoc(createEmptyEngineDoc("Copy"));
    useEngine.getState().addMoodboardSlide();
  });

  it("copies selected notes and chips as normal text elements on a new artwork slide", async () => {
    const note = createMoodboardNote("Giant Swing", 40, 40);
    const chip = createMoodboardItem({
      kind: "chip",
      role: "mood",
      text: "humid night",
      x: 80,
      y: 80,
    });
    useEngine.getState().addMoodboardItem(note, "add note");
    useEngine.getState().addMoodboardItem(chip, "add chip");
    useEngine.getState().selectOnly([note.id]);

    const result = await copyMoodboardItemsToArtworkSlide();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const slide = useEngine.getState().currentSlide();
    expect(slide?.kind).toBe("artwork");
    expect(slide?.id).toBe(result.slideId);
    expect(result.elementCount).toBe(1);
    const text = slide?.elements.find((element) => element.type === "text");
    expect(text && "text" in text ? text.text : "").toBe("Giant Swing");
    expect(text?.angle ?? 0).toBe(0);
  });

  it("copies every item when nothing is selected", async () => {
    useEngine.getState().addMoodboardItem(createMoodboardNote("A", 0, 0));
    useEngine.getState().addMoodboardItem(createMoodboardNote("B", 20, 20));
    useEngine.getState().selectOnly([]);
    const result = await copyMoodboardItemsToArtworkSlide();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elementCount).toBe(2);
    expect(useEngine.getState().currentSlide()?.kind).toBe("artwork");
  });
});
