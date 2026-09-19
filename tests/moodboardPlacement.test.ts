import { describe, expect, it } from "vitest";
import { createMoodboardItem } from "@/lib/moodboard/factory";
import { nextMoodboardDropPoint } from "@/lib/moodboard/placement";

describe("moodboard placement", () => {
  it("cascades new drops and keeps factory rotation at 0", () => {
    const first = nextMoodboardDropPoint([]);
    expect(first).toEqual({ x: 120, y: 120 });
    const item = createMoodboardItem({ kind: "image", text: "ref" });
    expect(item.rotation).toBe(0);
    const second = nextMoodboardDropPoint([item]);
    expect(second.x).toBeGreaterThan(first.x);
  });
});
