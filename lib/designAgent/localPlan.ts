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

  const positionDelta = extractPositionDelta(value);
  if (positionDelta) {
    return makePlan(state, slide.id, selected, (element) => ({
      x: Math.max(0, Math.round(element.x + positionDelta.dx)),
      y: Math.max(0, Math.round(element.y + positionDelta.dy)),
    }));
  }

  const size = extractSize(value);
  if (size) {
    return makePlan(state, slide.id, selected, () => ({
      width: size.width,
      height: size.height,
    }));
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

function extractPositionDelta(prompt: string): { dx: number; dy: number } | null {
  if (!/(?:ขยับ|เลื่อน|move|shift)/i.test(prompt)) return null;

  let dx = 0;
  let dy = 0;
  const horizontal = prompt.match(
    /(?:ไปทาง|ไปด้าน)?\s*(ซ้าย|ขวา|left|right)\s*(\d+(?:\.\d+)?)\s*(?:px|พิกเซล|pixels?)?/i,
  );
  const vertical = prompt.match(
    /(?:ไปทาง|ไปด้าน)?\s*(ขึ้น|ลง|บน|ล่าง|up|down)\s*(\d+(?:\.\d+)?)\s*(?:px|พิกเซล|pixels?)?/i,
  );
  if (horizontal)
    dx = /ซ้าย|left/i.test(horizontal[1]) ? -Number(horizontal[2]) : Number(horizontal[2]);
  if (vertical) dy = /ขึ้น|บน|up/i.test(vertical[1]) ? -Number(vertical[2]) : Number(vertical[2]);
  return dx === 0 && dy === 0 ? null : { dx, dy };
}

function extractSize(prompt: string): { width: number; height: number } | null {
  if (!/(?:ปรับขนาด|resize|ขยาย|ย่อ|ขนาด)/i.test(prompt)) return null;
  const pair = prompt.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (pair) {
    return {
      width: Math.max(1, Math.round(Number(pair[1]))),
      height: Math.max(1, Math.round(Number(pair[2]))),
    };
  }

  const width = prompt.match(/(?:width|กว้าง)\s*(?:เป็น|to|=)?\s*(\d+(?:\.\d+)?)/i);
  const height = prompt.match(/(?:height|สูง)\s*(?:เป็น|to|=)?\s*(\d+(?:\.\d+)?)/i);
  if (!width || !height) return null;
  return {
    width: Math.max(1, Math.round(Number(width[1]))),
    height: Math.max(1, Math.round(Number(height[1]))),
  };
}

export function selectedText(state: EngineState = useEngine.getState()): TextElement[] {
  const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
  return (slide?.elements ?? []).filter(
    (element): element is TextElement =>
      state.selectedIds.has(element.id) && element.type === "text",
  );
}
