import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isBroadImagePrompt,
  createPromptRefinement,
  buildRefinedPromptString,
} from "../lib/ai/orchestration/promptRefinement";

describe("เสาหลักที่ 4: Architecture Refactoring and Prompt Refinement Card", () => {
  it("verifies AICoPilotBar is decoupled into specialized submodules", () => {
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
    const lines = barSource.split("\n").length;

    // Line count reduced from ~2,975 lines down to under 1,500 lines
    expect(lines).toBeLessThan(1600);

    // Integrates the 4 extracted submodules
    expect(barSource).toContain("useCanvasSelectionBridge");
    expect(barSource).toContain("<ChatThread");
    expect(barSource).toContain("<ChatComposer");
    expect(barSource).toContain("<ChatActionCards");
    expect(barSource).toContain("promptRefinementData");
  });

  it("verifies useCanvasSelectionBridge provides single source of truth for canvas-chat bridge", () => {
    const bridgeSource = readFileSync("components/AI/useCanvasSelectionBridge.ts", "utf8");
    expect(bridgeSource).toContain("export function useCanvasSelectionBridge");
    expect(bridgeSource).toContain("allSlideImageRefs");
    expect(bridgeSource).toContain("composerImageRefs");
    expect(bridgeSource).toContain("handleSelectCanvasImage");
    expect(bridgeSource).toContain("setAttachedImageIds");
  });

  it("verifies ChatThread encapsulates message history and thought disclosure", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");
    expect(threadSource).toContain("export default function ChatThread");
    expect(threadSource).toContain("CollapsibleThought");
    expect(threadSource).toContain("ความคิดของ AI (Thought)");
    expect(threadSource).toContain("artshift-custom-scroll");
  });

  it("verifies ChatComposer encapsulates input, tags, and actions", () => {
    const composerSource = readFileSync("components/AI/ChatComposer.tsx", "utf8");
    expect(composerSource).toContain("export default function ChatComposer");
    expect(composerSource).toContain("InlineTagEditor");
    expect(composerSource).toContain("onBackspaceAtStart");
    expect(composerSource).toContain("onSend");
  });

  it("verifies ChatActionCards encapsulates proposal, plan, tray, and refinement cards", () => {
    const cardsSource = readFileSync("components/AI/ChatActionCards.tsx", "utf8");
    expect(cardsSource).toContain("export function ContentPolicyErrorCard");
    expect(cardsSource).toContain("export function ApprovalPlanProposalCard");
    expect(cardsSource).toContain("export function SequentialPlanCard");
    expect(cardsSource).toContain("export function StagedVariationsCard");
    expect(cardsSource).toContain("PromptRefinementCard");
  });

  it("verifies PromptRefinementCard matches user wireframe design specifications", () => {
    const refinementSource = readFileSync("components/AI/PromptRefinementCard.tsx", "utf8");

    // Header matching wireframe: Prompt ของผู้ใช้ ...
    expect(refinementSource).toContain("Prompt ของผู้ใช้ ...");

    // Carousel buttons < and >
    expect(refinementSource).toContain("‹");
    expect(refinementSource).toContain("›");

    // Red X button for default/cleared option (#b91c1c or #fee2e2)
    expect(refinementSource).toContain("#b91c1c");
    expect(refinementSource).toContain("✕");

    // Selected option pill styling with bold blue (#0284c7)
    expect(refinementSource).toContain("#0284c7");

    // Action buttons matching wireframe workflow
    expect(refinementSource).toContain("สร้างรูปภาพตามตัวเลือกนี้ 🪄");
    expect(refinementSource).toContain("คัดลอกลงช่องพิมพ์ ✏️");
  });

  it("validates dynamic prompt refinement live assembly for user cats prompt", () => {
    expect(isBroadImagePrompt("สร้างรูปแมว")).toBe(true);
    const refinement = createPromptRefinement("สร้างรูปแมว");
    expect(refinement.baseSubject).toBe("ภาพแมว");
    expect(refinement.subjectType).toBe("cat");

    const assembled = buildRefinedPromptString(refinement, {
      color: "orange",
      breed: "scottish",
      camera: "closeup",
    });

    expect(assembled).toContain("สร้างรูปแมว");
    expect(assembled).toContain("สีส้มสดใส");
    expect(assembled).toContain("สายพันธุ์สกอตติชโฟลด์");
    expect(assembled).toContain("Close-up");
  });
});
