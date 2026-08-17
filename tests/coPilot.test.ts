import { beforeEach, describe, expect, it } from "vitest";
import { executeCoPilotInstruction, getWorkspaceContext } from "@/lib/ai/coPilot";
import { createRect, createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";

describe("AI Co-Pilot Workspace Orchestrator", () => {
  beforeEach(() => {
    const layer = createEngineLayer("free", { name: "Test Layer" });
    const slide = {
      id: "slide-1",
      name: "Slide 1",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      layers: [layer],
      elements: [
        {
          ...createText({
            x: 100,
            y: 100,
            width: 400,
            height: 80,
            text: "Summer Collection",
          }),
          id: "txt-1",
        },
        {
          ...createRect({
            x: 100,
            y: 200,
            width: 300,
            height: 150,
          }),
          id: "rect-1",
          backgroundColor: "#6366f1",
        },
      ],
    };

    useEngine.setState({
      doc: {
        id: "doc-1",
        title: "Test Doc",
        width: 1920,
        height: 1080,
        slides: [slide],
        snapGrid: null,
        workspaceStrictness: 1,
        strictnessLevel: 1,
        strictnessValues: { 2: 1, 3: 2 },
        updatedAt: Date.now(),
        schemaVersion: 2,
      },
      currentSlideId: "slide-1",
      selectedIds: new Set(["txt-1"]),
    });
  });

  it("extracts comprehensive workspace context snapshot", () => {
    const ctx = getWorkspaceContext();
    expect(ctx).toBeDefined();
    expect(ctx.slideId).toBe("slide-1");
    expect(ctx.width).toBe(1920);
    expect(ctx.height).toBe(1080);
    expect(ctx.elementCount).toBe(2);
    expect(ctx.selectedIds).toContain("txt-1");
    expect(ctx.elementsSummary.length).toBe(2);
    expect(ctx.elementsSummary[0].text).toBe("Summer Collection");
  });

  it("handles composed layout instruction with sub-agent execution", async () => {
    const result = await executeCoPilotInstruction("จัด Layout สไลด์นี้แบบ 60-30-10");
    expect(result).toBeDefined();
    expect(result.reply).toBeDefined();
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions[0].agent).toBe("layout_designer");
    expect(result.actions[0].status).toBe("success");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("handles promotion banner creation instruction", async () => {
    const result = await executeCoPilotInstruction("สร้างแบนเนอร์โปรโมชั่น Mid-Year Sale ลด 50%");
    expect(result).toBeDefined();
    expect(result.reply).toContain("Mid-Year Sale");
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions[0].agent).toBe("copywriter");

    const st = useEngine.getState();
    const currentSlide = st.doc.slides[0];
    expect(currentSlide.elements.length).toBeGreaterThan(2);
  });
});
