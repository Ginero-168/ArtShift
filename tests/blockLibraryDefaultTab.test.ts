import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BlockLibrary Default Tab & Tab Order", () => {
  const librarySource = readFileSync("components/Builder/BlockLibrary.tsx", "utf8");
  const cssSource = readFileSync("components/Builder/Builder.module.css", "utf8");

  it("initializes activeTab state with 'assistant' so AI Assistance is the default page", () => {
    expect(librarySource).toContain(
      'const [activeTab, setActiveTab] = useState<LibraryTab>("assistant");',
    );
    expect(librarySource).not.toContain(
      'const [activeTab, setActiveTab] = useState<LibraryTab>("blocks");',
    );
  });

  it("places AI Assistance, then Block, then Pinterest in the DOM tablist", () => {
    const assistantIndex = librarySource.indexOf("<span>AI Assistance</span>");
    const blockIndex = librarySource.indexOf("<span>Block</span>");
    const pinterestIndex = librarySource.indexOf("<span>Pinterest</span>");

    expect(assistantIndex).toBeGreaterThan(-1);
    expect(blockIndex).toBeGreaterThan(-1);
    expect(pinterestIndex).toBeGreaterThan(-1);
    expect(assistantIndex).toBeLessThan(blockIndex);
    expect(blockIndex).toBeLessThan(pinterestIndex);
    expect(librarySource).toContain('useState<LibraryTab>("assistant")');
    expect(librarySource).toContain("<PinterestLibrary />");
  });

  it("assigns styles.libraryTabAssistant to the AI Assistance tab button", () => {
    expect(librarySource).toContain("styles.libraryTabAssistant");
  });

  it("styles libraryTabAssistant with active and hover states in CSS", () => {
    expect(cssSource).toContain(".libraryTabAssistant:hover {");
    expect(cssSource).toContain(".libraryTabAssistant.libraryTabActive {");
    expect(cssSource).toContain("background: #f4f2ff;");
    expect(cssSource).toContain("color: #4f46e5;");
  });

  it("keeps libraryAssistantActive 476px width for AI Assistance", () => {
    expect(cssSource).toContain(".libraryAssistantActive {");
    expect(cssSource).toContain("width: 476px;");
  });

  it("does not render Composition preset cards in the Block tab", () => {
    expect(librarySource).not.toContain("COMPOSITION_BLOCKS");
    expect(librarySource).not.toContain("insertCompositionBlock");
    expect(librarySource).not.toContain("<span>Composition</span>");
    expect(librarySource).not.toMatch(/Insert .+ composition/);
  });
});
