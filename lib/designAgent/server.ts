import {
  CREATIVE_DIRECTOR_SYSTEM,
  prepareCreativeDirection,
} from "@/lib/ai/orchestration/creativeDirector";
import type { AiChatMessage } from "@/lib/ai-runtime/contracts";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import type { ArtworkExecutionContext, PlanProposal } from "./contracts";

/** @deprecated Use the ArtShift Orchestrator route. Kept as a compatibility adapter. */
export type DesignAgentContext = ArtworkExecutionContext;
/** @deprecated The ArtShift Orchestrator owns the only remote system prompt. */
export const DESIGN_AGENT_SYSTEM = CREATIVE_DIRECTOR_SYSTEM;

export type PrepareDesignTurnOptions = {
  replicateToken?: string;
  accountId?: string;
  cloudConsent?: boolean;
};

export type PreparedDesignTurn =
  | { type: "text"; text: string }
  | { type: "question"; id: string; text: string; options?: string[] }
  | { type: "proposal"; proposal: PlanProposal };

export async function prepareDesignTurn(
  messages: AiChatMessage[],
  context: DesignAgentContext,
  options: PrepareDesignTurnOptions = {},
): Promise<PreparedDesignTurn> {
  const prompt = latestUserText(messages);
  if (!prompt) {
    return {
      type: "question",
      id: "missing-prompt",
      text: "ต้องการให้ช่วยปรับอะไรใน Artwork นี้ครับ?",
    };
  }
  if (!options.replicateToken) {
    return {
      type: "text",
      text: "งานนี้ต้องใช้ Replicate AI กรุณาเพิ่ม Key ที่ AI Provider Settings ก่อนครับ",
    };
  }
  if (options.cloudConsent !== true) {
    return { type: "text", text: "ยังไม่ได้รับอนุญาตให้ส่งงานไปยัง AI provider ครับ" };
  }

  const ai = getServerAiRuntime({
    replicateToken: options.replicateToken,
    accountId: options.accountId,
  });
  const direction = await prepareCreativeDirection(
    {
      prompt,
      conversationHistory: normalizeHistory(messages),
      designContext: context,
      canvasSummary: {
        objectCount: countSnapshotObjects(context.snapshot),
        selectedCount: context.selectedObjectIds.length,
        width: context.artworkWidth,
        height: context.artworkHeight,
      },
      referenceAnalyses: [],
      availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
      cloudConsent: true,
      accountId: options.accountId,
    },
    { execute: ai.execute.bind(ai) },
  );

  if (direction.kind === "design-plan") {
    return { type: "proposal", proposal: direction.proposal };
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

function latestUserText(messages: readonly AiChatMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  if (!latest) return "";
  if (typeof latest.content === "string") return latest.content.trim().slice(0, 20_000);
  return latest.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim()
    .slice(0, 20_000);
}

function normalizeHistory(messages: readonly AiChatMessage[]) {
  return messages
    .flatMap((message) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");
      return content.trim() ? [{ role: message.role, content: content.slice(0, 12_000) }] : [];
    })
    .slice(-12);
}

function countSnapshotObjects(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const objects = (snapshot as Record<string, unknown>).objects;
  return Array.isArray(objects) ? objects.length : 0;
}
