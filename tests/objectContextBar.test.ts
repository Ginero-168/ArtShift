import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { getObjectContextIconName } from "@/components/Canvas/objectContextIconRegistry";

describe("ObjectContextBar Hook Rules and Brief Action", () => {
  const fileContent = readFileSync("components/Canvas/ObjectContextBar.tsx", "utf-8");

  it("declares all React hooks before any early return statements to adhere strictly to Rules of Hooks", () => {
    const earlyReturnIndex = fileContent.indexOf("if (isDragging || !first) return null;");
    expect(earlyReturnIndex).toBeGreaterThan(0);

    // briefBusy useState hook must appear before the early return statement
    const briefBusyHookIndex = fileContent.indexOf(
      "const [briefBusy, setBriefBusy] = useState(false);",
    );
    expect(briefBusyHookIndex).toBeGreaterThan(0);
    expect(briefBusyHookIndex).toBeLessThan(earlyReturnIndex);

    // activeImageTool useState hook must also appear before early return
    const activeToolIndex = fileContent.indexOf(
      "const [activeImageTool, setActiveImageTool] = useState",
    );
    expect(activeToolIndex).toBeGreaterThan(0);
    expect(activeToolIndex).toBeLessThan(earlyReturnIndex);

    // Verify there are no other useState, useEffect, useMemo, or useRef calls after early return
    const contentAfterEarlyReturn = fileContent.substring(earlyReturnIndex);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseState\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseEffect\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseMemo\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseRef\s*\(/);
  });

  it("registers Brief icon in object context registry and exports IconBrief", () => {
    expect(getObjectContextIconName("Brief")).toBe("brief");
    expect(getObjectContextIconName("Creating Brief...")).toBe("brief");
    const iconsContent = readFileSync("components/icons.tsx", "utf-8");
    expect(iconsContent).toContain("export const IconBrief");
  });

  it("places Brief action after Vectorize on image selection toolbar", () => {
    const vectorizeIndex = fileContent.indexOf(
      "controls.push(\n      action(VECTORIZE_GROUP_LABEL",
    );
    const briefIndex = fileContent.indexOf(
      'controls.push(\n      action(\n        briefBusy ? "Creating Brief..." : "Brief"',
    );
    expect(vectorizeIndex).toBeGreaterThan(0);
    expect(briefIndex).toBeGreaterThan(vectorizeIndex);
  });

  it("does not expose Edit Raster on the Option bar", () => {
    expect(fileContent).not.toContain("Edit Raster");
    expect(fileContent).not.toContain("openRasterEditForElement");
  });

  it("renders text labels for Option Bar buttons while keeping Download icon-only", () => {
    expect(fileContent).toContain('const isDownload = label.toLowerCase() === "download";');
    expect(fileContent).toContain('className="object-context-label"');
    expect(fileContent).toContain("{!isDownload && (");
    expect(fileContent).toContain("{label}");
  });

  it("uses the shared app UI font token for Brief and other Option Bar labels", () => {
    // Brief is chrome, not a live artwork preview — match Properties / --font-sans (Sarabun).
    expect(fileContent).toContain('className="object-context-label"');
    expect(fileContent).toContain('fontFamily: "var(--font-sans)"');
    expect(fileContent).toContain("font-family: var(--font-sans);");
    expect(fileContent).not.toContain("Mali");
    expect(fileContent).not.toContain("Excalifont");
  });

  it("provides Merge, Mix, and group actions for multi-selection", () => {
    expect(fileContent).toContain('mergeBusy ? "Merging..." : "Merge"');
    expect(fileContent).toContain('mixBusy ? "Mixing..." : "Mix"');
    expect(fileContent).toContain("requestCoPilotExternalTurn");
    expect(fileContent).toContain("IMAGE_MIX_PROMPT");
    expect(fileContent).toContain("selectedImageIds.length >= 2");
    expect(fileContent).toContain("selectionGroups.canUngroup");
    expect(fileContent).toContain("selectionGroups.canGroup");
  });
});
