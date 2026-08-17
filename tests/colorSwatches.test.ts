import { beforeEach, describe, expect, it } from "vitest";
import { addColorToHistory, clearColorHistory, getColorHistory } from "../lib/color/swatches";

describe("Color Swatches & History", () => {
  beforeEach(() => {
    clearColorHistory();
  });

  it("adds color to history and places it at the front", () => {
    const list = addColorToHistory("#ff0000");
    expect(list[0]).toBe("#ff0000");
    expect(getColorHistory()[0]).toBe("#ff0000");
  });

  it("deduplicates colors when re-added", () => {
    addColorToHistory("#123456");
    addColorToHistory("#abcdef");
    const updated = addColorToHistory("#123456");

    expect(updated[0]).toBe("#123456");
    expect(updated.filter((c) => c === "#123456").length).toBe(1);
  });

  it("limits color history to maximum 12 items", () => {
    for (let i = 0; i < 20; i++) {
      addColorToHistory(`#${String(i).padStart(6, "0")}`);
    }
    const history = getColorHistory();
    expect(history.length).toBeLessThanOrEqual(12);
  });
});
