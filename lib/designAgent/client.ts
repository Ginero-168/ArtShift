import { getActiveBrandKit } from "@/lib/brand/brandKit";
import { type EngineState, useEngine } from "@/lib/engine/store";
import type { PlanProposal } from "./contracts";
import type { DesignAgentContext } from "./server";

export type ClientChatMessage = { role: "user" | "assistant"; content: string };

export type PreparedDesignResult =
  | { type: "text"; text: string }
  | { type: "question"; id: string; text: string; options?: string[] }
  | { type: "proposal"; proposal: PlanProposal };

export function buildDesignAgentContext(
  state: EngineState = useEngine.getState(),
): DesignAgentContext {
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

export async function prepareRemoteDesignTurn(
  messages: ClientChatMessage[],
  context: DesignAgentContext,
  options: { signal?: AbortSignal; cloudConsent?: boolean } = {},
): Promise<PreparedDesignResult> {
  const response = await fetch("/api/design-agent", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ messages, context, cloudConsent: options.cloudConsent === true }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    result?: PreparedDesignResult;
    error?: string;
  } | null;
  if (!response.ok || !payload?.result) {
    throw new Error(payload?.error || `Design agent request failed: ${response.status}`);
  }
  if (payload.result.type === "proposal") {
    const proposal = payload.result.proposal;
    if (proposal?.protocolVersion !== 1 || !Array.isArray(proposal.commands)) {
      throw new Error("Design agent returned an invalid plan.");
    }
  }
  return payload.result;
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
