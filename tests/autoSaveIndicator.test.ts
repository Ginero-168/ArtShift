import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("Auto Save Status Indicator in Editor Header", () => {
  const editorSource = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
  const globalsCss = readFileSync("app/globals.css", "utf8");

  it("renders AutoSaveIndicator directly after the project title input in topbar header", () => {
    // Check that topbar has project-title input followed by AutoSaveIndicator
    expect(editorSource).toContain('aria-label="Project Title"');
    const inputIndex = editorSource.indexOf('aria-label="Project Title"');
    const indicatorIndex = editorSource.indexOf("<AutoSaveIndicator status={saveStatus} />");
    expect(indicatorIndex).toBeGreaterThan(inputIndex);
  });

  it("defines AutoSaveIndicator component with distinct SVG icons for 'saving' and 'saved'", () => {
    expect(editorSource).toContain("function AutoSaveIndicator");
    expect(editorSource).toContain("กำลัง Save");
    expect(editorSource).toContain("Save แล้ว");

    // Check SVG spinner for saving
    expect(editorSource).toContain("auto-save-spin");

    // Check SVG checkmark for saved
    expect(editorSource).toContain('d="m8.5 12.2 2.3 2.3 4.7-4.7"');

    // Icon-only display: uses title and aria-label rather than visible text element
    expect(editorSource).toContain("aria-label={label}");
    expect(editorSource).toContain("title={label}");
  });

  it("defines distinct color styles and animations in globals.css", () => {
    expect(globalsCss).toContain("@keyframes autoSaveSpin");
    expect(globalsCss).toContain(".auto-save-spin");
    expect(globalsCss).toContain(".auto-save-indicator.is-saving");
    expect(globalsCss).toContain(".auto-save-indicator.is-saved");
    expect(globalsCss).toContain(".auto-save-indicator.is-error");

    // Colors: Amber for saving, Emerald for saved
    expect(globalsCss).toContain("#d97706");
    expect(globalsCss).toContain("#059669");
  });

  it("does not claim saved while the title input is still being typed", () => {
    // Typing the title alone must not claim a save is in progress.
    const onChangeBlock = editorSource.slice(
      editorSource.indexOf("onChange={(e) => {"),
      editorSource.indexOf("onBlur={(e) => handleRename"),
    );
    expect(onChangeBlock).toContain("setProjectName(e.target.value)");
    expect(onChangeBlock).not.toContain('setSaveStatus("saving")');

    expect(editorSource).toContain("createProjectAutosave");
    expect(editorSource).toContain("handlePageLeave");
    expect(editorSource).toContain("Save ไม่สำเร็จ");
  });
});
