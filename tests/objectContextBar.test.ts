import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { getObjectContextIconName } from "@/components/Canvas/objectContextIconRegistry";

describe("ObjectContextBar Hook Rules and Convert to Brief Action", () => {
  const fileContent = readFileSync("components/Canvas/ObjectContextBar.tsx", "utf-8");

  it("declares all React hooks before any early return statements to adhere strictly to Rules of Hooks", () => {
    const earlyReturnIndex = fileContent.indexOf("if (isDragging || !first) return null;");
    expect(earlyReturnIndex).toBeGreaterThan(0);

    // briefBusy useState hook must appear before the early return statement
    const briefBusyHookIndex = fileContent.indexOf("const [briefBusy, setBriefBusy] = useState(false);");
    expect(briefBusyHookIndex).toBeGreaterThan(0);
    expect(briefBusyHookIndex).toBeLessThan(earlyReturnIndex);

    // activeImageTool useState hook must also appear before early return
    const activeToolIndex = fileContent.indexOf("const [activeImageTool, setActiveImageTool] = useState");
    expect(activeToolIndex).toBeGreaterThan(0);
    expect(activeToolIndex).toBeLessThan(earlyReturnIndex);

    // Verify there are no other useState, useEffect, useMemo, or useRef calls after early return
    const contentAfterEarlyReturn = fileContent.substring(earlyReturnIndex);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseState\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseEffect\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseMemo\s*\(/);
    expect(contentAfterEarlyReturn).not.toMatch(/\buseRef\s*\(/);
  });

  it("registers Convert to Brief icon in object context registry and exports IconBrief", () => {
    expect(getObjectContextIconName("Convert to Brief")).toBe("brief");
    expect(getObjectContextIconName("Creating Brief...")).toBe("brief");
    const iconsContent = readFileSync("components/icons.tsx", "utf-8");
    expect(iconsContent).toContain("export const IconBrief");
  });

  it("places Convert to Brief action after Vectorize on image selection toolbar", () => {
    const vectorizeIndex = fileContent.indexOf("controls.push(\n      action(VECTORIZE_GROUP_LABEL");
    const briefIndex = fileContent.indexOf('controls.push(\n      action(\n        briefBusy ? "Creating Brief..." : "Convert to Brief"');
    expect(vectorizeIndex).toBeGreaterThan(0);
    expect(briefIndex).toBeGreaterThan(vectorizeIndex);
  });

  it("renders text labels for Option Bar buttons while keeping Download icon-only", () => {
    expect(fileContent).toContain('const isDownload = label.toLowerCase() === "download";');
    expect(fileContent).toContain('className="object-context-label"');
    expect(fileContent).toContain("{!isDownload && (");
    expect(fileContent).toContain("{label}");
  });

  it("provides Merge and Ungroup controls when a group is selected", () => {
    expect(fileContent).toContain('if (isGroup) {');
    expect(fileContent).toContain('controls.push(action("Merge", handleMergeElements));');
    expect(fileContent).toContain('controls.push(action("Ungroup", () => ungroupElements(ids)));');
  });
});
