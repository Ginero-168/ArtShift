import { prepareRemoteOrchestratorTurn } from "@/lib/ai/orchestration/creativeDirectorClient";
import { getActiveBrandKit } from "@/lib/brand/brandKit";
import { type EngineState, useEngine } from "@/lib/engine/store";
import type { ArtworkExecutionContext, PlanProposal } from "./contracts";

export type ClientChatMessage = { role: "user" | "assistant"; content: string };

export type PreparedDesignResult =
  | { type: "text"; text: string }
  | { type: "question"; id: string; text: string; options?: string[] }
  | { type: "proposal"; proposal: PlanProposal };

export function buildDesignAgentContext(
  state: EngineState = useEngine.getState(),
): ArtworkExecutionContext {
  const slide =
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId) ??
    state.doc.slides[0];
  const elements = (slide?.elements ?? []).filter((element) => !element.isDeleted);
  const selectedObjectIds = Array.from(state.selectedIds).filter((id) =>
    elements.some((element) => element.id === id),
  );
  const brand = getActiveBrandKit();

  return {
    docId: state.doc.id,
    baseRevision: state.doc.updatedAt,
    artworkId: slide?.id ?? "",
    artworkWidth: slide?.width ?? state.doc.width,
    artworkHeight: slide?.height ?? state.doc.height,
    hasSelection: selectedObjectIds.length > 0,
    selectedObjectIds,
    snapshot: {
      artwork: slide
        ? {
            id: slide.id,
            name: slide.name,
            width: slide.width,
            height: slide.height,
            background: slide.background,
            variantOf: slide.variantOf,
            variantLabel: slide.variantLabel,
          }
        : null,
      selection: elements
        .filter((element) => selectedObjectIds.includes(element.id))
        .map((element) => summarizeElement(element)),
      layers: (slide?.layers ?? []).map((layer) => ({
        id: layer.id,
        name: layer.name,
        mode: layer.mode,
        objectIds: layer.objectIds,
        visible: layer.visible,
        locked: layer.locked,
      })),
      objects: elements.slice(0, 300).map((element) => summarizeElement(element)),
      brandKit: {
        id: brand.id,
        name: brand.name,
        colors: brand.colors,
        typography: brand.typography,
        rules: brand.rules,
      },
    },
  };
}

/** @deprecated Use prepareRemoteOrchestratorTurn directly. */
export async function prepareRemoteDesignTurn(
  messages: ClientChatMessage[],
  context: ArtworkExecutionContext,
  options: { signal?: AbortSignal; cloudConsent?: boolean } = {},
): Promise<PreparedDesignResult> {
  const prompt = latestUserText(messages);
  if (!prompt) {
    return { type: "question", id: "missing-prompt", text: "ต้องการให้ช่วยปรับอะไรใน Artwork นี้ครับ?" };
  }
  const direction = await prepareRemoteOrchestratorTurn(
    {
      prompt,
      conversationHistory: messages.slice(-12),
      designContext: context,
      canvasSummary: {
        objectCount: countSnapshotObjects(context.snapshot),
        selectedCount: context.selectedObjectIds.length,
        width: context.artworkWidth,
        height: context.artworkHeight,
      },
      referenceAnalyses: [],
    },
    options,
  );
  if (direction.kind === "design-plan") {
    const proposal = direction.proposal;
    if (proposal?.protocolVersion !== 1 || !Array.isArray(proposal.commands)) {
      throw new Error("Design agent returned an invalid plan.");
    }
    return { type: "proposal", proposal };
  }
  if (direction.kind === "clarification") {
    return {
      type: "question",
      id: `question-${crypto.randomUUID()}`,
      text: direction.question,
      options: direction.options,
    };
  }
  if (direction.kind === "answer") return { type: "text", text: direction.text };
  return {
    type: "text",
    text: "ArtShift Orchestrator เลือกงานสร้างภาพ กรุณาดำเนินงานต่อผ่าน AI Assistance ครับ",
  };
}

function latestUserText(messages: readonly ClientChatMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest?.content.trim().slice(0, 20_000) ?? "";
}

function countSnapshotObjects(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const objects = (snapshot as Record<string, unknown>).objects;
  return Array.isArray(objects) ? objects.length : 0;
}

function summarizeElement(element: EngineState["doc"]["slides"][number]["elements"][number]) {
  return {
    id: element.id,
    type: element.type,
    name: element.name,
    x: Math.round(element.x),
    y: Math.round(element.y),
    width: Math.round(element.width),
    height: Math.round(element.height),
    angle: Number(element.angle.toFixed(4)),
    version: element.version,
    locked: element.locked,
    hidden: element.hidden,
    ...(element.type === "text"
      ? {
          text: element.text,
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          textAlign: element.textAlign,
          textPreset: element.textPreset,
          color: element.strokeColor,
        }
      : {}),
    ...(element.type === "image" || element.type === "bookMockup"
      ? { fileId: element.fileId, sourceName: element.sourceName }
      : {}),
    ...(element.type !== "text" && element.type !== "image" && element.type !== "bookMockup"
      ? { fill: element.backgroundColor, stroke: element.strokeColor }
      : {}),
  };
}
