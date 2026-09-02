import type { AiPlan } from "@/lib/engine/applyAiPlan";
import { type EngineState, useEngine } from "@/lib/engine/store";
import type { EngineElement, TextElement } from "@/lib/engine/types";

export function buildLocalEditPlan(
  prompt: string,
  state: EngineState = useEngine.getState(),
): AiPlan | null {
  const value = prompt.trim();
  const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
  if (!slide || state.selectedIds.size === 0) return null;

  const selected = slide.elements.filter(
    (element) => state.selectedIds.has(element.id) && !element.isDeleted,
  );
  if (!selected.length) return null;

  const replacement = extractTextReplacement(value);
  if (replacement !== null && selected.every((element) => element.type === "text")) {
    return makePlan(state, slide.id, selected, (_element) => ({ text: replacement }));
  }

  const color = extractHexColor(value);
  if (color && /(?:สี|color|colour|background|พื้นหลัง)/i.test(value)) {
    return makePlan(state, slide.id, selected, (element) =>
      element.type === "text" ? { strokeColor: color } : { backgroundColor: color },
    );
  }

  return null;
}

function makePlan(
  state: EngineState,
  artworkId: string,
  elements: EngineElement[],
  patchFor: (element: EngineElement) => Record<string, unknown>,
): AiPlan {
  const commands = elements.map((element, index) => {
    const layer = state.doc.slides
      .find((slide) => slide.id === artworkId)
      ?.layers.find((candidate) => candidate.objectIds.includes(element.id));
    return {
      id: `local-command-${index + 1}`,
      kind: "update" as const,
      target: {
        docId: state.doc.id,
        artworkId,
        layerId: layer?.id,
        objectId: element.id,
        elementVersion: element.version,
        baseRevision: state.doc.updatedAt,
      },
      patch: patchFor(element),
    };
  });

  return {
    protocolVersion: 1,
    planId: `local-plan-${crypto.randomUUID()}`,
    executionToken: `local-execution-${crypto.randomUUID()}`,
    baseRevision: state.doc.updatedAt,
    summary: "Apply a precise local edit to the selected Objects.",
    commands,
    estimatedRemoteCostUsd: 0,
    requiresApproval: false,
  };
}

function extractTextReplacement(prompt: string): string | null {
  const match = prompt.match(
    /(?:เปลี่ยน|แก้|ปรับ)\s*(?:ข้อความ(?:นี้)?|text)?\s*(?:เป็น|ให้เป็น)\s*["“”']?(.+?)["“”']?$/i,
  );
  if (match?.[1]) return match[1].trim();

  const english = prompt.match(
    /(?:change|edit|update)\s+(?:the\s+)?text\s+(?:to|into)\s+["“”']?(.+?)["“”']?$/i,
  );
  return english?.[1]?.trim() || null;
}

function extractHexColor(prompt: string): string | null {
  return prompt.match(/#[0-9a-f]{3,8}\b/i)?.[0] ?? null;
}

export function selectedText(state: EngineState = useEngine.getState()): TextElement[] {
  const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
  return (slide?.elements ?? []).filter(
    (element): element is TextElement =>
      state.selectedIds.has(element.id) && element.type === "text",
  );
}
