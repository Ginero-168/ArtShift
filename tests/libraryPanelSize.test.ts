import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clampLibraryAssistantWidth,
  LIBRARY_ASSISTANT_DEFAULT_WIDTH,
  LIBRARY_ASSISTANT_MAX_WIDTH,
  LIBRARY_ASSISTANT_WIDTH_STORAGE_KEY,
  LIBRARY_BLOCK_WIDTH,
  LIBRARY_BLOCK_WIDTH_NARROW,
  libraryBlockWidth,
  persistLibraryAssistantWidth,
  readLibraryAssistantWidth,
} from "@/lib/ui/libraryPanelSize";

describe("library panel size", () => {
  it("uses Block panel width as the AI Assistance minimum", () => {
    expect(libraryBlockWidth(1440)).toBe(LIBRARY_BLOCK_WIDTH);
    expect(libraryBlockWidth(1100)).toBe(LIBRARY_BLOCK_WIDTH_NARROW);
    expect(clampLibraryAssistantWidth(80, LIBRARY_BLOCK_WIDTH)).toBe(LIBRARY_BLOCK_WIDTH);
    expect(clampLibraryAssistantWidth(900, LIBRARY_BLOCK_WIDTH)).toBe(LIBRARY_ASSISTANT_MAX_WIDTH);
    expect(clampLibraryAssistantWidth(LIBRARY_ASSISTANT_DEFAULT_WIDTH, LIBRARY_BLOCK_WIDTH)).toBe(
      LIBRARY_ASSISTANT_DEFAULT_WIDTH,
    );
  });

  it("persists and restores the assistant width preference", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    expect(readLibraryAssistantWidth(storage, LIBRARY_BLOCK_WIDTH)).toBe(
      LIBRARY_ASSISTANT_DEFAULT_WIDTH,
    );
    persistLibraryAssistantWidth(320, storage, LIBRARY_BLOCK_WIDTH);
    expect(memory.get(LIBRARY_ASSISTANT_WIDTH_STORAGE_KEY)).toBe("320");
    expect(readLibraryAssistantWidth(storage, LIBRARY_BLOCK_WIDTH)).toBe(320);
  });

  it("keeps the AI Assistance / Block tabs and adds a drag handle", () => {
    const library = readFileSync("components/Builder/BlockLibrary.tsx", "utf8");
    const css = readFileSync("components/Builder/Builder.module.css", "utf8");

    expect(library).toContain("<span>AI Assistance</span>");
    expect(library).toContain("<span>Block</span>");
    expect(library).toContain('role="separator"');
    expect(library).toContain("persistLibraryAssistantWidth");
    expect(library).toContain("styles.libraryResizeHandle");
    expect(css).toContain(".libraryResizeHandle");
    expect(css).toContain("cursor: ew-resize");
    expect(css).toContain("width: 476px;");
    expect(css).toContain("width: 238px;");
  });
});
