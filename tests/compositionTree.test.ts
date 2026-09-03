import { describe, expect, it } from "vitest";
import {
  getCompositionGroup,
  getCompositionSlotLabel,
  groupCompositionLayers,
} from "@/lib/engine/compositionTree";
import { createRect } from "@/lib/engine/factory";

describe("composition tree grouping", () => {
  it("groups composition members by shared group id and preserves input order", () => {
    const background = createRect({ x: 0, y: 0, width: 10, height: 10 });
    background.groupIds = ["composition-id"];
    background.builderKind = "composition:hero:background";
    const headline = createRect({ x: 0, y: 0, width: 10, height: 10 });
    headline.groupIds = ["composition-id"];
    headline.builderKind = "composition:hero:headline";
    const ordinary = createRect({ x: 0, y: 0, width: 10, height: 10 });

    const groups = groupCompositionLayers([ordinary, headline, background]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ kind: "element", element: ordinary });
    expect(groups[1]).toMatchObject({ kind: "composition", key: "group:composition-id" });
    expect(groups[1].kind === "composition" ? groups[1].elements : []).toEqual([
      headline,
      background,
    ]);
  });

  it("falls back to builder block identity and exposes readable slot labels", () => {
    const media = createRect({ x: 0, y: 0, width: 10, height: 10 });
    media.builderKind = "composition:text-image:media";
    expect(getCompositionGroup(media)).toBe("builder:text-image");
    expect(getCompositionSlotLabel(media)).toBe("Media");
  });
});
