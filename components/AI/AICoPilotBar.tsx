"use client";

import { useEffect, useRef, useState } from "react";
import ComposerImageTags from "@/components/AI/ComposerImageTags";
import {
  type CoPilotMessage,
  executeCoPilotInstruction,
  isToolCoPilotPrompt,
  type SubAgentActionLog,
} from "@/lib/ai/coPilot";
import { isImageGenerationPrompt } from "@/lib/ai/imageGeneration";
import {
  prepareRemoteCreativeDirection,
  reviewRemoteCreativeOutput,
} from "@/lib/ai/orchestration/creativeDirectorClient";
import { runContextAwareImageRun } from "@/lib/ai/orchestration/imageBatchRunner";
import {
  buildComposerImageSelection,
  snapshotComposerImageRefs,
} from "@/lib/ai/orchestration/imageReferences";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";
import {
  analyzeImageReferences,
  type ImageReferenceAnalysis,
} from "@/lib/ai/orchestration/referenceAnalysis";
import {
  type ContextAwareTurnResult,
  createDirectedImageRun,
  createDirectedImageTask,
  isCanvasInventoryPrompt,
  type PendingClarification,
  prepareContextAwareTurn,
  runSequentialExecutionPlan,
  type SequentialExecutionPlan,
} from "@/lib/ai/orchestration/turnOrchestrator";
import { subscribeAIProgress } from "@/lib/ai/progressReporter";
import { routeUnifiedPrompt, UNIFIED_AI_SYSTEM } from "@/lib/ai/unifiedSystem";
import { planVisualRequest } from "@/lib/ai/visualOrchestrator";
import { buildDesignAgentContext, type ClientChatMessage } from "@/lib/designAgent/client";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import { buildLocalEditPlan } from "@/lib/designAgent/localPlan";
import { summarizePlanForReview } from "@/lib/designAgent/planReview";
import { applyAiPlan } from "@/lib/engine/applyAiPlan";
import { createImage } from "@/lib/engine/factory";
import { preloadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { calculateGhostBounds } from "@/lib/renderer/ghostOverlay";

export type StagedVariationCard = {
  id: string;
  fileId: string;
  url?: string;
  width: number;
  height: number;
  label?: string;
  status: "staged" | "accepted" | "rejected";
  targetSlideId?: string;
};

function ThoughtBrainIcon({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      className={className}
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}

function ImageSparkleIcon({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      className={className}
    >
      <rect width="18" height="16" x="3" y="5" rx="3" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="m21 16-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 20" />
      <path d="M2 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" />
    </svg>
  );
}

function ThumbsUpIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3l4-7.12a2 2 0 0 1 3.5 1z" />
    </svg>
  );
}

function ThumbsDownIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3l-4 7.12a2 2 0 0 1-3.5-1z" />
    </svg>
  );
}

function ChevronDownIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        transition: "transform 0.2s ease",
        ...style,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SendIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StopIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function TrashIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CheckIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ImageIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function BoltIcon({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function SpinnerIcon({
  style = {},
  className = "",
}: {
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        animation: "spin 1s linear infinite",
        ...style,
      }}
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CollapsibleThought({
  thought,
  isLive = false,
  defaultOpen = false,
}: {
  thought: string;
  isLive?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginBottom: 6,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          outline: "none",
          padding: "3px 0",
          cursor: "pointer",
          textAlign: "left",
          color: "#334155",
          transition: "color 0.15s ease",
          width: "fit-content",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#4f46e5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#334155";
        }}
      >
        <ThoughtBrainIcon style={{ color: "#6366f1", width: 15, height: 15 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {isLive ? "กำลังคิดอยู่..." : "ความคิดของ AI (Thought)"}
        </span>
        {isLive && (
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#6366f1",
              animation: "artshiftPulse 1.2s ease-in-out infinite",
            }}
          />
        )}
        <ChevronDownIcon
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            width: 12,
            height: 12,
            color: "#94a3b8",
            transition: "transform 0.2s ease, color 0.15s ease",
            marginLeft: 2,
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: 4,
            marginLeft: 2,
            padding: "7px 12px 7px 12px",
            borderLeft: "2px solid #818cf8",
            color: "#475569",
            fontSize: 12,
            lineHeight: 1.6,
            background: "rgba(248, 250, 252, 0.7)",
            borderRadius: "0 8px 8px 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {thought}
        </div>
      )}
    </div>
  );
}

function extractSubject(prompt: string, summary?: string): string {
  // If prompt contains clarification history, extract only the user's latest reply
  let effectivePrompt = prompt;
  if (effectivePrompt.includes("User reply:")) {
    effectivePrompt = effectivePrompt.slice(effectivePrompt.lastIndexOf("User reply:") + 11).trim();
  } else if (effectivePrompt.includes("\n\n")) {
    const segments = effectivePrompt.split("\n\n").map((s) => s.trim()).filter(Boolean);
    effectivePrompt = segments[segments.length - 1] || effectivePrompt;
  }

  if (summary && summary.trim().length > 0 && !summary.includes("Director question:")) {
    let cleanFromSummary = summary.trim();
    if (cleanFromSummary.includes("User reply:")) {
      cleanFromSummary = cleanFromSummary.slice(cleanFromSummary.lastIndexOf("User reply:") + 11).trim();
    }
    cleanFromSummary = cleanFromSummary
      .replace(/^(?:ช่วย|กรุณา)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา)?\s*(?:รูป|ภาพ|รูปภาพ)?\s*/iu, "")
      .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
      .replace(/^(?:รูปภาพ|ภาพ|รูป)\s*/iu, "")
      .replace(/\s*(?:ตามที่ขอ|เรียบร้อยแล้ว|สมจริง|สวยๆ|สไตล์.*|ในฉาก.*)\s*$/iu, "")
      .trim();
    if (cleanFromSummary.length > 0 && cleanFromSummary.length < 60 && !cleanFromSummary.includes("\n")) {
      return cleanFromSummary;
    }
  }

  let cleaned = effectivePrompt
    .replace(/^(?:ช่วย|กรุณา|อยากได้|อยากให้|ขอ)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา)?\s*(?:รูป|ภาพ|รูปภาพ)?/iu, "")
    .trim();
  cleaned = cleaned.replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "").trim();
  cleaned = cleaned.replace(/\s*(?:ให้หน่อย|คิดให้หน่อย|สวยๆ|เจ๋งๆ|น่ารัก|สมจริง|ด้วยนะ|ด้วยครับ|ด้วยค่ะ|ด้วย)\s*$/iu, "").trim();
  if (cleaned.includes("\n")) {
    cleaned = cleaned.split("\n")[0].trim();
  }
  return cleaned || "ภาพ";
}

function formatThoughtText(rawPrompt: string, directionSummary?: string, count = 1): string {
  const isConceptPrompt =
    rawPrompt.includes("คิดให้หน่อย") ||
    rawPrompt.includes("concept") ||
    rawPrompt.includes("คอนเซปต์") ||
    rawPrompt.includes("เจ๋งๆ") ||
    rawPrompt.includes("ไอเดีย");

  if (isConceptPrompt && directionSummary) {
    return `ได้เลยค่ะ คิด concept เป็น ${directionSummary} สร้างให้เลย`;
  }
  if (directionSummary && directionSummary.length > 5 && !directionSummary.startsWith("สร้างภาพ")) {
    return `ได้เลยค่ะ คิด concept เป็น ${directionSummary} สร้างให้เลย`;
  }
  const subject = extractSubject(rawPrompt, directionSummary);
  return `สร้างรูป${subject} ${count} รูปให้เลยค่ะ`;
}

function formatImageCompletionReply(
  subject: string,
  count: number,
  outputBriefs?: readonly string[],
): string {
  const cleanSubject = subject.trim() || "ภาพ";
  const lines: string[] = [`สร้างรูป${cleanSubject}เสร็จแล้ว ${count} รูปค่ะ`, ""];
  if (outputBriefs && outputBriefs.length > 0) {
    outputBriefs.slice(0, count).forEach((brief, idx) => {
      const cleanBrief = brief
        .replace(/^รูปที่\s*\d+:\s*/iu, "")
        .replace(/^(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*/iu, "")
        .trim();
      lines.push(`• รูปที่ ${idx + 1}: ${cleanBrief || `${cleanSubject} แบบที่ ${idx + 1}`}`);
    });
  } else {
    for (let i = 1; i <= count; i++) {
      lines.push(`• รูปที่ ${i}: ${cleanSubject} แบบที่ ${i}`);
    }
  }
  lines.push("");
  lines.push("ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ");
  return lines.join("\n");
}

export default function AICoPilotBar() {
  const _currentSlideId = useEngine((s) => s.currentSlideId);
  const slide = useEngine((s) =>
    s.doc.slides.find((candidate) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s) => s.selectedIds);
  const selectedImageSelection = buildComposerImageSelection(slide?.elements ?? [], selectedIds);
  const selectedImageRefs = selectedImageSelection.refs;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [messages, setMessages] = useState<CoPilotMessage[]>([
    {
      id: "initial-msg",
      role: "assistant",
      content:
        "สวัสดีครับ! ผมคือ AI Assistance ของคุณ จะอ่านบริบทและช่วยวางแผนก่อนสร้างภาพ เพื่อให้ได้ผลลัพธ์ที่ตรงความต้องการมากขึ้นครับ",
      timestamp: Date.now(),
    },
  ]);

  const [currentActions, setCurrentActions] = useState<SubAgentActionLog[]>([]);
  const [pendingPlan, setPendingPlan] = useState<PlanProposal | null>(null);
  const [pendingSequentialPlan, setPendingSequentialPlan] =
    useState<SequentialExecutionPlan | null>(null);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [stagedVariations, setStagedVariations] = useState<StagedVariationCard[]>([]);
  const [pendingClarification, setPendingClarification] = useState<PendingClarification | null>(
    null,
  );
  const [liveAssistantState, setLiveAssistantState] = useState<{
    stage: "outputting" | "generating";
    thought?: string;
    toolLabel?: string;
    requestedCount?: number;
  } | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});

  const handleSelectCanvasImage = (fileId?: string) => {
    if (!fileId) return;
    const currentSlide = useEngine.getState().currentSlide();
    if (!currentSlide) return;
    const el = currentSlide.elements.find(
      (item) =>
        !item.isDeleted && item.type === "image" && "fileId" in item && item.fileId === fileId,
    );
    if (el) {
      useEngine.getState().selectOnly([el.id]);
    }
  };

  const handleToggleFeedback = (messageId: string, type: "up" | "down") => {
    setFeedbackState((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === type ? undefined! : type,
    }));
  };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return subscribeAIProgress((event) => {
      const isResult = event.presentation === "result";
      const progressLabel = typeof event.progress === "number" ? ` (${event.progress}%)` : "";
      setMessages((previous) => {
        const messageId = isResult
          ? `result-${event.taskId}-${event.timestamp}`
          : `progress-${event.taskId}`;
        const nextMessage: CoPilotMessage = {
          id: messageId,
          role: isResult ? "assistant" : "system",
          kind: isResult ? "message" : "progress",
          content: isResult
            ? event.message
            : `${event.operation} · ${event.message}${progressLabel}`,
          timestamp: event.timestamp,
        };
        const existingIndex = previous.findIndex((message) => message.id === messageId);
        if (existingIndex < 0) return [...previous, nextMessage];
        const existing = previous[existingIndex];
        if (
          existing.content === nextMessage.content &&
          existing.role === nextMessage.role &&
          existing.kind === nextMessage.kind
        ) {
          return previous;
        }
        const next = [...previous];
        next[existingIndex] = nextMessage;
        return next;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const upsertCurrentAction = (action: SubAgentActionLog) => {
    setCurrentActions((prev) => {
      const idx = prev.findIndex((candidate) => candidate.id === action.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = action;
        return next;
      }
      return [...prev, action];
    });
  };

  // Auto-scroll chat tray to bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: Chat content changes should trigger tray scrolling.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentActions, streamingText, stagedVariations, pendingSequentialPlan]);

  const handleVariationHover = (card: StagedVariationCard) => {
    const currentSlide = useEngine.getState().currentSlide();
    if (!currentSlide) return;
    const bounds = calculateGhostBounds(
      currentSlide.width,
      currentSlide.height,
      card.width || 1024,
      card.height || 1024,
      "center",
    );
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = card.url || `/api/ai/image/cache?fileId=${card.fileId}`;
    const setOverlay = () => {
      useEngine.getState().setGhostOverlay({
        variationId: card.id,
        image: img,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        opacity: 0.85,
        label: card.label || "Candidate Variation",
      });
    };
    if (img.complete) {
      setOverlay();
    } else {
      img.onload = setOverlay;
    }
  };

  const handleVariationLeave = () => {
    useEngine.getState().clearGhostOverlay();
  };

  const commitVariationToCanvas = async (card: StagedVariationCard) => {
    // ORCH-03/04: Prevent duplicate apply of already committed card
    if (card.status === "accepted") return;
    useEngine.getState().clearGhostOverlay();
    const state = useEngine.getState();
    const targetSlide = card.targetSlideId
      ? (state.doc.slides.find((s) => s.id === card.targetSlideId) ?? state.currentSlide())
      : state.currentSlide();
    if (!targetSlide) return;
    const bounds = calculateGhostBounds(
      targetSlide.width,
      targetSlide.height,
      card.width || 1024,
      card.height || 1024,
      "center",
    );
    let fileId = card.fileId;
    let naturalWidth = card.width || 1024;
    let naturalHeight = card.height || 1024;
    if (card.url && (!fileId || fileId.startsWith("var-"))) {
      try {
        const cached = await preloadDataURL(card.url);
        fileId = cached.fileId;
        naturalWidth = cached.width;
        naturalHeight = cached.height;
      } catch {
        // fallback
      }
    }
    const element = createImage({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fileId,
      naturalWidth,
      naturalHeight,
    });
    state.addElement(element, `Place candidate variation ${card.label || card.id}`);
    setStagedVariations((prev) =>
      prev.map((v) => (v.id === card.id ? { ...v, status: "accepted" as const } : v)),
    );
  };

  const dismissVariation = (cardId: string) => {
    useEngine.getState().clearGhostOverlay();
    setStagedVariations((prev) => prev.filter((v) => v.id !== cardId));
  };

  const executeSequentialPlan = async () => {
    if (!pendingSequentialPlan || isExecutingPlan) return;
    setIsExecutingPlan(true);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finishedPlan = await runSequentialExecutionPlan(pendingSequentialPlan, {
        signal: controller.signal,
        cloudConsent: true,
        onStepProgress: (updatedPlan, step) => {
          setPendingSequentialPlan({ ...updatedPlan });
          const action: SubAgentActionLog = {
            id: step.id,
            agent: "orchestrator",
            title: `Step: ${step.name}`,
            description: `${step.specialist} · ${step.status}`,
            status:
              step.status === "completed"
                ? "success"
                : step.status === "failed"
                  ? "error"
                  : "running",
            timestamp: Date.now(),
            attempt: step.attempt,
          };
          upsertCurrentAction(action);
        },
      });

      setPendingSequentialPlan(finishedPlan);

      if (finishedPlan.overallStatus === "completed") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `รันแผนงานแบบต่อเนื่อง ${finishedPlan.steps.length} ขั้นตอนเสร็จสมบูรณ์เรียบร้อยครับ!`,
            timestamp: Date.now(),
            suggestions: ["จัด Layout เพิ่มเติม", "บันทึกและส่งออก"],
          },
        ]);
      } else if (finishedPlan.overallStatus === "paused") {
        const pausedStep = finishedPlan.steps[finishedPlan.currentStepIndex];
        const failed = pausedStep?.status === "failed";
        const pauseReason = failed
          ? `ขั้น ${pausedStep.name} หยุดเพราะ ${(pausedStep.error ?? "ไม่ทราบสาเหตุ").trim()}`
          : `ขั้น ${pausedStep?.name ?? "ล่าสุด"} ยังไม่ผ่าน Quality Gate`;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `${pauseReason} ครับ แก้ brief หรือกด Resume เพื่อให้ Orchestrator ดำเนินการต่อได้`,
            timestamp: Date.now(),
            suggestions: failed
              ? ["Resume Execution", "ปรับ brief", "ทิ้งแผนนี้"]
              : ["Resume Execution", "ปรับ brief"],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `เกิดข้อผิดพลาดขณะรันแผน: ${(err as Error).message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsExecutingPlan(false);
      setBusy(false);
    }
  };

  const handleSend = async (customPrompt?: string) => {
    const rawPrompt = (customPrompt ?? input).trim();
    if (!rawPrompt || busy) return;

    const pending = pendingClarification;
    const selectedOption =
      pending && customPrompt ? findClarificationOption(pending, customPrompt) : undefined;
    const promptToSend = pending
      ? composeClarifiedImagePrompt(
          pending.originalPrompt,
          selectedOption?.label ?? rawPrompt,
          pending.question,
        )
      : rawPrompt;
    if (!pending && selectedImageSelection.omittedCount > 0) {
      const omittedCount = selectedImageSelection.omittedCount;
      setInput("");
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: rawPrompt,
          timestamp: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `ตอนนี้เลือกภาพสำหรับ AI มากเกินไปครับ (${selectedImageSelection.totalCount} ภาพ) กรุณาลด selection เหลือไม่เกิน 4 ภาพก่อนส่งงาน (+${omittedCount})`,
          timestamp: Date.now(),
          suggestions: ["ลด selection เหลือไม่เกิน 4 ภาพ", "ถามเกี่ยวกับ Canvas แบบ local"],
        },
      ]);
      return;
    }
    const refsForTurn = snapshotComposerImageRefs(
      pending ? pending.selectedImages : selectedImageRefs,
    );

    setInput("");
    setBusy(true);
    setStreamingText("");
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: CoPilotMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: selectedOption?.label ?? rawPrompt,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setCurrentActions([]);
    setLiveAssistantState({ stage: "outputting" });

    try {
      let analysesForTurn: ImageReferenceAnalysis[] = pending
        ? pending.analyses.map((analysis) => ({ ...analysis, ref: { ...analysis.ref } }))
        : [];
      let contextDecision: ContextAwareTurnResult | null = null;
      const analysisActions: SubAgentActionLog[] = [];
      const hasImageContext = refsForTurn.length > 0;
      const isBuiltInImageAction =
        /(?:ลบพื้นหลัง|remove\s*bg|remove\s*background|vectorize|แปลงเป็น(?:\s+)?vector|แปลงเป็นเวกเตอร์)/iu.test(
          promptToSend,
        );
      const lastAssistantMsg = [...messages]
        .reverse()
        .find((m) => m.role === "assistant" && m.kind !== "progress");
      const isImageFollowUp = Boolean(
        lastAssistantMsg &&
          ((lastAssistantMsg.images && lastAssistantMsg.images.length > 0) ||
            lastAssistantMsg.toolLabel === "GPT Image 2" ||
            lastAssistantMsg.toolLabel?.toLowerCase().includes("image")) &&
          !isCanvasInventoryPrompt(promptToSend) &&
          !isBuiltInImageAction,
      );

      if (isCanvasInventoryPrompt(promptToSend) && slide) {
        contextDecision = prepareContextAwareTurn({
          prompt: promptToSend,
          refs: [],
          analyses: [],
          canvas: { slide, selectedIds },
        });
      } else if (
        pending ||
        isImageGenerationPrompt(promptToSend) ||
        isImageFollowUp ||
        (hasImageContext && !isBuiltInImageAction)
      ) {
        if (hasImageContext && analysesForTurn.length === 0) {
          const analysisAction: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: "orchestrator",
            title: "Image Analysis",
            description: "กำลังวิเคราะห์ภาพที่เลือกก่อนวางแผนงาน…",
            status: "running",
            timestamp: Date.now(),
          };
          analysisActions.push(analysisAction);
          upsertCurrentAction(analysisAction);
          try {
            analysesForTurn = await analyzeImageReferences(
              refsForTurn,
              controller.signal,
              (completed, total, stage) => {
                analysisAction.description = `${stage} · ${Math.round((completed / Math.max(1, total)) * 100)}%`;
                upsertCurrentAction({ ...analysisAction });
              },
            );
            analysisAction.status = "success";
            analysisAction.description = `วิเคราะห์ภาพเสร็จแล้ว ${analysesForTurn.length} รายการ`;
            upsertCurrentAction({ ...analysisAction });
          } catch (error) {
            analysisAction.status = "error";
            analysisAction.description = `วิเคราะห์ภาพไม่สำเร็จ: ${(error as Error).message}`;
            upsertCurrentAction({ ...analysisAction });
            setMessages((previous) => [
              ...previous,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content:
                  "ยังไม่ได้สร้าง Task ครับ เพราะวิเคราะห์ภาพที่เลือกไม่สำเร็จ ลองโหลดภาพใหม่แล้วส่งอีกครั้งได้เลย",
                timestamp: Date.now(),
                actions: analysisActions,
              },
            ]);
            return;
          }
        }
        contextDecision = prepareContextAwareTurn({
          prompt: promptToSend,
          refs: refsForTurn,
          analyses: analysesForTurn,
          selectedIds,
          canvas: slide ? { slide, selectedIds } : undefined,
          clarification: pending
            ? {
                originalPrompt: pending.originalPrompt,
                question: pending.question,
                optionIds: pending.options.map((option) => option.id),
              }
            : undefined,
          clarificationRound: pending?.round ?? 0,
        });
      }

      if (contextDecision) {
        let reply = "";
        let actions = [...analysisActions];
        let suggestions: string[] = [];
        if (contextDecision.kind === "answer") {
          reply = contextDecision.reply;
          suggestions = ["ถามเกี่ยวกับ Object บน Canvas", "วิเคราะห์ภาพนี้ละเอียดขึ้น"];
        } else {
          const taskAction: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: "orchestrator",
            title: "Creative Director",
            description: "กำลังส่ง brief ให้ Creative Director วางแผน…",
            status: "running",
            timestamp: Date.now(),
            stage: "analyzing",
            attempt: 0,
          };
          actions = [...actions, taskAction];
          upsertCurrentAction({ ...taskAction });
          // Creative Director disclosure copy:
          // งานนี้จะส่งคำสั่งไปยัง gpt-oss-120b Creative Director เพื่อวางแผน อาจค้น Reference ผ่าน Unsplash/Pexels เมื่อจำเป็น แล้วเรียก Image Model เพื่อสร้างและตรวจผลลัพธ์
          const consent = true;
          if (!consent) {
            taskAction.status = "error";
            taskAction.stage = "cancelled";
            taskAction.description = "ยังไม่ได้รับอนุญาตให้ส่งงานไปยัง Creative Director หรือ Image Model";
            reply = "ยกเลิกการวางแผนแล้วครับ ยังไม่ได้สร้าง Task หรือส่ง prompt, ภาพ ไปยัง AI provider";
          } else {
            try {
              const direction = await prepareRemoteCreativeDirection(
                {
                  prompt: promptToSend,
                  conversationHistory: messages
                    .flatMap((message): ClientChatMessage[] =>
                      (message.role === "user" || message.role === "assistant") &&
                      message.kind !== "progress"
                        ? [{ role: message.role, content: message.content }]
                        : [],
                    )
                    .slice(-12),
                  designContext: buildDesignAgentContext(),
                  canvasSummary: {
                    objectCount: elementCount,
                    selectedCount: selectedIds.size,
                    width: slide?.width ?? 1920,
                    height: slide?.height ?? 1080,
                  },
                  referenceAnalyses: analysesForTurn,
                },
                { signal: controller.signal, cloudConsent: true },
              );

              if (direction.kind === "answer") {
                setPendingClarification(null);
                taskAction.status = "success";
                taskAction.stage = "succeeded";
                taskAction.description = "Creative Director ตอบโดยไม่เรียก Image Model";
                const trimmed = direction.text.trim();
                let cleanAnswer = direction.text;
                if (trimmed.startsWith("{") && (trimmed.includes('"kind"') || trimmed.includes('"calls"'))) {
                  try {
                    const parsed = JSON.parse(
                      trimmed.replace(/\\'/g, "'").replace(/,\s*([}\]])/g, "$1"),
                    );
                    if (parsed && typeof parsed.text === "string" && parsed.text) {
                      cleanAnswer = parsed.text;
                    }
                  } catch {}
                }
                reply = cleanAnswer;
                suggestions = ["ระบุงานออกแบบที่ต้องการ", "เลือกภาพบน Canvas แล้วขอให้วิเคราะห์"];
              } else if (direction.kind === "clarification") {
                taskAction.status = "success";
                taskAction.stage = "clarifying";
                taskAction.description = "Creative Director ต้องการรายละเอียดเพิ่มก่อนเลือก Specialist";
                reply = direction.question;
                suggestions = direction.options;
                setPendingClarification({
                  id: crypto.randomUUID(),
                  originalPrompt: promptToSend,
                  selectedImages: refsForTurn,
                  analyses: analysesForTurn,
                  question: direction.question,
                  options: direction.options.map((label, index) => ({ id: String(index), label })),
                  round: (pending?.round ?? 0) + 1,
                });
              } else if (direction.kind === "design-plan") {
                setPendingClarification(null);
                setPendingPlan(direction.proposal);
                taskAction.status = "success";
                taskAction.stage = "planned";
                taskAction.description = `เตรียมแผนแก้ Canvas ${direction.proposal.commands.length} รายการ รอการอนุมัติ`;
                reply =
                  "ArtShift Orchestrator เตรียมแผนแก้ไข Canvas แล้วครับ ตรวจสอบและกด Apply plan เพื่อดำเนินงาน";
                suggestions = ["ตรวจสอบแผนแล้วกด Apply plan", "แก้ brief ก่อนเริ่มงาน"];
              } else if (direction.kind === "sequential-plan") {
                setPendingClarification(null);
                setPendingSequentialPlan(direction.plan);
                taskAction.status = "success";
                taskAction.stage = "planned";
                taskAction.description = `Creative Director เสนอแผนงาน ${direction.plan.steps.length} ขั้นตอน`;
                reply = `ArtShift Creative Director เสนอแผนงานต่อเนื่อง ${direction.plan.steps.length} ขั้นตอน เพื่อความแม่นยำ กรุณาตรวจสอบและกด Approve & Execute เพื่อเริ่มงานครับ`;
                suggestions = ["อนุมัติและเริ่มรันแผน", "ยกเลิกแผนนี้"];
              } else if (direction.search.required) {
                taskAction.status = "success";
                taskAction.stage = "analyzing";
                taskAction.description = "Creative Director ระบุว่าต้องค้น Context ภายนอกก่อนสร้างงาน";
                reply = `ยังไม่เรียก Image Model ครับ Creative Director ต้องค้นข้อมูลเพิ่มก่อน: ${direction.search.queries.join(", ")}`;
                suggestions = ["เพิ่ม Reference เอง", "ปรับ brief โดยไม่ใช้ข้อมูลภายนอก"];
              } else {
                const imageRun = createDirectedImageRun(contextDecision.input, direction);
                setPendingClarification(null);
                const count = imageRun.requestedOutputCount;
                const thoughtText = formatThoughtText(rawPrompt, direction.summary, count);
                setLiveAssistantState({
                  stage: "generating",
                  thought: thoughtText,
                  toolLabel: `Generating images using ${direction.modelAlias === "image-gpt-2" ? "GPT Image 2" : direction.modelAlias}`,
                  requestedCount: count,
                });

                taskAction.taskId = imageRun.id;
                const countLabel =
                  imageRun.requestedOutputCount > 1
                    ? ` (${imageRun.requestedOutputCount} ภาพ)`
                    : "";
                taskAction.agent =
                  direction.specialist === "image_editor" ? "image_edit" : "image_gen";
                taskAction.title = `Creative Director → ${direction.specialist}${countLabel}`;
                taskAction.description = `เลือก ${direction.modelAlias} · วางแผนสร้าง ${imageRun.requestedOutputCount} ภาพ · Knowledge: ${direction.knowledgeSkillIds.join(", ") || "none"}`;
                taskAction.stage = "planned";
                upsertCurrentAction({ ...taskAction });

                const runResult = await runContextAwareImageRun(imageRun, refsForTurn, {
                  signal: controller.signal,
                  cloudConsent: true,
                  reviewOutput: ({ prompt, reviewCriteria, outputAnalysis, signal }) =>
                    reviewRemoteCreativeOutput(
                      { prompt, reviewCriteria, outputAnalysis },
                      { signal, cloudConsent: true },
                    ),
                  onUpdate: (update) => {
                    taskAction.description = `${update.message} · สำเร็จ ${update.completedCount}/${update.requestedOutputCount}`;
                    taskAction.stage = update.stage;
                    taskAction.status =
                      update.stage === "failed" ||
                      update.stage === "cancelled" ||
                      update.stage === "outcome-unknown"
                        ? "error"
                        : update.stage === "succeeded"
                          ? "success"
                          : "running";
                    upsertCurrentAction({ ...taskAction });
                  },
                });

                if (runResult.status === "cancelled") {
                  taskAction.status = "error";
                  taskAction.stage = "cancelled";
                  taskAction.description = "ยกเลิกงานสร้างภาพตามคำขอแล้ว ไม่มีการเปลี่ยนแปลงบน Canvas";
                  reply = "ยกเลิกงานสร้างภาพตามคำขอแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas";
                  suggestions = ["ระบุ brief ใหม่", "ตรวจสอบภาพที่เลือก"];
                  setLiveAssistantState(null);
                } else if (runResult.status === "partial" && runResult.completedCount === 0) {
                  const firstError =
                    runResult.items.find((i) => i.error)?.error || "การสร้างภาพไม่สำเร็จ";
                  taskAction.status = "error";
                  taskAction.stage = "failed";
                  taskAction.description = `Task ไม่สำเร็จ: ${firstError}`;
                  reply = `การสร้างภาพไม่สำเร็จครับ: ${firstError}`;
                  suggestions = ["ปรับ brief แล้วลองใหม่", "ตรวจสอบภาพที่เลือก"];
                  setLiveAssistantState(null);
                } else {
                  taskAction.status = "success";
                  taskAction.stage = "succeeded";
                  const summaryMsg =
                    imageRun.requestedOutputCount > 1
                      ? `สำเร็จ ${runResult.completedCount}/${imageRun.requestedOutputCount} ภาพ`
                      : "สำเร็จ";
                  taskAction.description = `Creative Director ตรวจ brief และจัดวางภาพบน Canvas (${summaryMsg})`;

                  const generatedImages = runResult.items
                    .filter((i) => i.status === "succeeded" && Boolean(i.result?.dataUrl))
                    .map((i, idx) => ({
                      url: i.result?.dataUrl || "",
                      fileId: i.result?.fileId || `img-${idx + 1}`,
                      label: direction.outputBriefs?.[idx] || `รูปที่ ${idx + 1}`,
                    }));

                  const subject = extractSubject(promptToSend, direction.summary);
                  reply = formatImageCompletionReply(
                    subject,
                    runResult.completedCount,
                    direction.outputBriefs,
                  );

                  setMessages((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: reply,
                      thought: thoughtText,
                      toolLabel: "GPT Image 2",
                      images: generatedImages,
                      timestamp: Date.now(),
                      actions,
                    },
                  ]);
                  setLiveAssistantState(null);
                  setBusy(false);
                  return;
                }
              }
            } catch (error) {
              const wasCancelled =
                (error as Error).name === "AbortError" || controller.signal.aborted;
              const outcomeUnknown = (error as Error).name === "OutcomeUnknownError";
              taskAction.status = "error";
              taskAction.stage = outcomeUnknown
                ? "outcome-unknown"
                : wasCancelled
                  ? "cancelled"
                  : "failed";
              taskAction.description = outcomeUnknown
                ? "ผลลัพธ์ provider ยังยืนยันไม่ได้ จึงไม่สร้างงานซ้ำอัตโนมัติ"
                : wasCancelled
                  ? "ยกเลิก Task แล้ว ไม่มีการเปลี่ยนแปลงบน Canvas"
                  : `Task ไม่สำเร็จ: ${(error as Error).message}`;
              reply = outcomeUnknown
                ? "ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้ครับ ผมจะไม่สร้างงานซ้ำอัตโนมัติจนกว่าจะตรวจสอบงานเดิมได้"
                : wasCancelled
                  ? "ยกเลิกงานที่กำลังประมวลผลแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas"
                  : `Task ไม่สำเร็จครับ: ${(error as Error).message}`;
              suggestions = outcomeUnknown
                ? ["ตรวจสอบสถานะ provider ก่อนลองใหม่", "ลองใหม่หลังยืนยันว่าไม่มีงานเดิมค้างอยู่"]
                : wasCancelled
                  ? ["ส่ง brief เดิมอีกครั้ง", "ตรวจสอบภาพที่เลือก"]
                  : ["ปรับ brief แล้วลองใหม่", "ตรวจสอบภาพที่เลือก", "ยกเลิก Task นี้"];
            }
          }
          upsertCurrentAction({ ...taskAction });
        }
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: reply,
            timestamp: Date.now(),
            actions,
            suggestions,
          },
        ]);
        return;
      }

      const isImageGeneration = isImageGenerationPrompt(promptToSend);
      const localPlan = isImageGeneration ? null : buildLocalEditPlan(promptToSend);
      const visualPlan = isImageGeneration
        ? planVisualRequest(promptToSend, {
            hasSelection: selectedIds.size > 0,
            selectedObjectCount: selectedIds.size,
            elementCount,
            hasImageAsset: (slide?.elements ?? []).some(
              (element) => !element.isDeleted && element.type === "image",
            ),
          })
        : undefined;
      const route = routeUnifiedPrompt({
        hasLocalPlan: Boolean(localPlan),
        hasToolCommand: isToolCoPilotPrompt(promptToSend),
        isImageGeneration,
        visualPlan,
      });
      let reply = "";
      let actions: SubAgentActionLog[] = [];
      let suggestions: string[] = [];
      let remoteGeneratedImages: Array<{ url: string; fileId: string; label: string }> | undefined;

      if (localPlan) {
        const localAction: SubAgentActionLog = {
          id: crypto.randomUUID(),
          agent: "orchestrator",
          title: "Deterministic edit",
          description: "กำลังตรวจสอบคำสั่งกับ Object ที่เลือก...",
          status: "running",
          timestamp: Date.now(),
        };
        upsertCurrentAction(localAction);
        const localResult = applyAiPlan(localPlan, { approved: true });
        if (localResult.ok) {
          localAction.status = "success";
          localAction.description = `ปรับแก้แบบ local สำเร็จ ${localResult.receipts.length} รายการ`;
          reply = `ปรับแก้ Object ที่เลือกแบบ local เรียบร้อยแล้วครับ (${localResult.receipts.length} รายการ) ไม่มีการส่งข้อมูลออกนอกเครื่อง`;
          suggestions = ["Undo การแก้ไขครั้งนี้", "เปลี่ยนสี Object", "ให้ AI ช่วยต่อยอด"];
        } else {
          localAction.status = "error";
          localAction.description = localResult.error;
          reply = `ยังไม่ได้แก้ Artwork ครับ: ${localResult.error}`;
          suggestions = ["ตรวจสอบ Object ที่เลือก", "เปิด AI Provider ใน Profile"];
        }
        upsertCurrentAction(localAction);
        actions = [localAction];
      } else if (route === "tool-command") {
        const result = await executeCoPilotInstruction(promptToSend, upsertCurrentAction, {
          signal: controller.signal,
          visualPlan,
        });
        reply = result.reply;
        actions = result.actions;
        suggestions = result.suggestions;
      } else {
        const remoteActions: SubAgentActionLog[] = [];
        const addRemoteAction = (
          title: string,
          description: string,
          status: SubAgentActionLog["status"] = "running",
        ) => {
          const action: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: "remote_chat",
            title,
            description,
            status,
            timestamp: Date.now(),
          };
          remoteActions.push(action);
          upsertCurrentAction(action);
        };

        addRemoteAction("ArtShift Orchestrator", "กำลังเข้าใจคำสั่งและวางแผนจนจบงาน...");
        const history: ClientChatMessage[] = [
          ...messages
            .flatMap((message): ClientChatMessage[] =>
              (message.role === "user" || message.role === "assistant") &&
              message.kind !== "progress"
                ? [{ role: message.role, content: message.content }]
                : [],
            )
            .slice(-10),
          { role: "user", content: promptToSend },
        ];
        const remoteConsent = true;
        if (!remoteConsent) {
          remoteActions[0] = {
            ...remoteActions[0],
            status: "error",
            description: "ยังไม่ได้รับอนุญาตให้ส่ง prompt และบริบทไปยัง AI provider",
          };
          reply = "ยกเลิกคำขอแล้วครับ ยังไม่มีการส่ง prompt หรือบริบท Artwork ออกนอกเครื่อง";
          suggestions = ["ถามเกี่ยวกับ Canvas แบบ local", "ระบุคำสั่งที่แก้ได้แบบ local"];
        } else {
          const designContext = buildDesignAgentContext();
          const result = await prepareRemoteCreativeDirection(
            {
              prompt: promptToSend,
              conversationHistory: history,
              designContext,
              canvasSummary: {
                objectCount: elementCount,
                selectedCount: selectedIds.size,
                width: slide?.width ?? 1920,
                height: slide?.height ?? 1080,
              },
              referenceAnalyses: analysesForTurn,
            },
            { signal: controller.signal, cloudConsent: true },
          );

          if (result.kind === "design-plan") {
            if (result.proposal.requiresApproval) {
              setPendingPlan(result.proposal);
              remoteActions[0] = {
                ...remoteActions[0],
                status: "success",
                description: `เตรียมแผน ${result.proposal.commands.length} รายการ รอการอนุมัติ`,
              };
              reply = "ผมเตรียมแผนแก้ไข Artwork ให้แล้วครับ ตรวจสอบสรุปด้านล่างและกด Apply plan เมื่อพร้อม";
              suggestions = ["ตรวจสอบแผนแล้วกด Apply plan", "แก้ brief ก่อนเริ่มงาน", "ทิ้งแผนนี้"];
            } else {
              const applied = applyAiPlan(result.proposal, { approved: true });
              if (applied.ok) {
                remoteActions[0] = {
                  ...remoteActions[0],
                  status: "success",
                  description: `ดำเนินการแบบ atomic สำเร็จ ${applied.receipts.length} รายการ`,
                };
                reply = `ดำเนินการตามแผนเรียบร้อยแล้วครับ (${applied.receipts.length} รายการ) และสร้าง Undo boundary เดียวให้แล้ว`;
                suggestions = ["↶ Undo แผนล่าสุด", "📐 ตรวจสอบ Layout", "✍️ ปรับรายละเอียดต่อ"];
              } else {
                remoteActions[0] = {
                  ...remoteActions[0],
                  status: "error",
                  description: applied.error,
                };
                reply = `ยังไม่ได้แก้ Artwork ครับ: ${applied.error}`;
                suggestions = ["รีเฟรชบริบทแล้วลองใหม่", "ตรวจสอบ Object ที่เลือก"];
              }
            }
          } else if (result.kind === "clarification") {
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: "ต้องการรายละเอียดเพิ่มก่อนเริ่มงาน",
            };
            reply = result.question;
            suggestions = result.options;
            setPendingClarification({
              id: crypto.randomUUID(),
              originalPrompt: promptToSend,
              selectedImages: refsForTurn,
              analyses: analysesForTurn,
              question: result.question,
              options: result.options.map((label, index) => ({ id: String(index), label })),
              round: (pending?.round ?? 0) + 1,
            });
          } else if (result.kind === "answer") {
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: "ArtShift Orchestrator ตอบโดยไม่ต้องเรียก executor",
            };
            const trimmed = result.text.trim();
            let cleanAnswer = result.text;
            if (trimmed.startsWith("{") && (trimmed.includes('"kind"') || trimmed.includes('"calls"'))) {
              try {
                const parsed = JSON.parse(
                  trimmed.replace(/\\'/g, "'").replace(/,\s*([}\]])/g, "$1"),
                );
                if (parsed && typeof parsed.text === "string" && parsed.text) {
                  cleanAnswer = parsed.text;
                }
              } catch {}
            }
            reply = cleanAnswer;
            suggestions = [
              "📐 ขอให้จัด Layout ต่อ",
              "✍️ ขอให้สร้าง direction ใหม่",
              "🧩 ใช้เครื่องมือแก้ไขเฉพาะทาง",
            ];
          } else if (result.kind === "sequential-plan") {
            setPendingSequentialPlan(result.plan);
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: `เตรียมแผนงานต่อเนื่อง ${result.plan.steps.length} ขั้นตอน รอการอนุมัติ`,
            };
            reply = `ArtShift Creative Director เสนอแผนงานต่อเนื่อง ${result.plan.steps.length} ขั้นตอน เพื่อความแม่นยำ กรุณาตรวจสอบและกด Approve & Execute เพื่อเริ่มงานครับ`;
            suggestions = ["อนุมัติและเริ่มรันแผน", "ทิ้งแผนนี้"];
          } else {
            const directedTask = createDirectedImageTask(
              {
                prompt: promptToSend,
                refs: refsForTurn,
                analyses: analysesForTurn,
                canvas: slide ? { slide, selectedIds } : undefined,
              },
              result,
            );
            remoteActions[0] = {
              ...remoteActions[0],
              title: `ArtShift Orchestrator → ${directedTask.subAgent}`,
              description: `กำลังดำเนินงานด้วย ${result.modelAlias}`,
            };
            upsertCurrentAction(remoteActions[0]);
            const generated = await runContextAwareImageTask(directedTask, refsForTurn, {
              signal: controller.signal,
              cloudConsent: true,
              reviewOutput: ({ prompt, reviewCriteria, outputAnalysis, signal }) =>
                reviewRemoteCreativeOutput(
                  { prompt, reviewCriteria, outputAnalysis },
                  { signal, cloudConsent: true },
                ),
              onUpdate: (update) => {
                remoteActions[0] = {
                  ...remoteActions[0],
                  status:
                    update.stage === "failed" || update.stage === "outcome-unknown"
                      ? "error"
                      : update.stage === "succeeded"
                        ? "success"
                        : "running",
                  description: update.message,
                  stage: update.stage,
                  attempt: update.attempt,
                  quality: update.quality,
                };
                upsertCurrentAction(remoteActions[0]);
              },
            });
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: `ตรวจและวางผลลัพธ์บน Canvas แล้ว (${generated.width} × ${generated.height}px)`,
            };
            const subject = extractSubject(promptToSend, result.summary);
            const briefs =
              result.outputBriefs && result.outputBriefs.length > 0
                ? result.outputBriefs
                : [result.summary];
            reply = formatImageCompletionReply(subject, 1, briefs);
            remoteGeneratedImages = [
              {
                url: generated.dataUrl || "",
                fileId: generated.fileId,
                label: briefs[0] || result.summary,
              },
            ];
            suggestions = ["ปรับรายละเอียดต่อ", "ตรวจสอบ Layout", "↶ Undo ผลลัพธ์ล่าสุด"];
          }
        }
        upsertCurrentAction(remoteActions[0]);
        actions = remoteActions;
      }

      const assistantMsg: CoPilotMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        toolLabel: remoteGeneratedImages ? "GPT Image 2" : undefined,
        images: remoteGeneratedImages,
        timestamp: Date.now(),
        actions,
        suggestions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const wasCancelled = (err as Error).name === "AbortError" || controller.signal.aborted;
      const errorMsg: CoPilotMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: wasCancelled
          ? "ยกเลิกงานที่กำลังประมวลผลแล้วครับ ไม่มีการส่งงานต่อเพิ่มเติม"
          : `ขออภัยครับ เกิดข้อผิดพลาด: ${(err as Error).message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setLiveAssistantState(null);
      setCurrentActions([]);
      setStreamingText("");
    }
  };

  const applyPendingPlan = () => {
    if (!pendingPlan || busy) return;
    const plan = pendingPlan;
    setPendingPlan(null);
    const result = applyAiPlan(plan, { approved: true });
    const action: SubAgentActionLog = {
      id: crypto.randomUUID(),
      agent: "orchestrator",
      title: "Apply reviewed plan",
      description: result.ok
        ? `ดำเนินการแบบ atomic สำเร็จ ${result.receipts.length} รายการ`
        : result.error,
      status: result.ok ? "success" : "error",
      timestamp: Date.now(),
    };
    setMessages((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.ok
          ? `Apply แผนเรียบร้อยแล้วครับ (${result.receipts.length} รายการ) และสร้าง Undo boundary เดียวให้แล้ว`
          : `ยังไม่ได้แก้ Artwork ครับ: ${result.error}`,
        timestamp: Date.now(),
        actions: [action],
        suggestions: result.ok ? ["Undo แผนล่าสุด", "ตรวจสอบ Layout"] : ["รีเฟรชบริบทแล้วลองใหม่"],
      },
    ]);
  };

  const elementCount = (slide?.elements ?? []).filter((e) => !e.isDeleted).length;
  const hasSelection = selectedIds.size > 0;
  const pendingReview = pendingPlan ? summarizePlanForReview(pendingPlan) : null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
        overflow: "hidden",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <style>{`
        @keyframes artshiftShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes artshiftPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .artshift-custom-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .artshift-custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .artshift-custom-scroll::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 4px;
        }
        .artshift-custom-scroll::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>

      {/* 1. Chat history */}
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Thread Header */}
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            minHeight: 38,
          }}
        >
          <div
            title={UNIFIED_AI_SYSTEM.description}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <ThoughtBrainIcon style={{ color: "#6366f1", width: 15, height: 15 }} />
            <strong style={{ fontSize: 12.5, color: "#334155", fontWeight: 600, letterSpacing: "-0.01em" }}>
              {UNIFIED_AI_SYSTEM.label}
            </strong>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => setMessages([])}
              title="Clear chat history"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: "none",
                fontSize: 11,
                color: "#94a3b8",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: 4,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#475569";
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <TrashIcon style={{ width: 11, height: 11, opacity: 0.8 }} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div
          ref={scrollRef}
          className="artshift-custom-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "#ffffff",
          }}
        >
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "88%",
                    padding: "7px 12px",
                    borderRadius: "14px 14px 3px 14px",
                    background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                    color: "#ffffff",
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                    boxShadow: "0 1px 3px rgba(79, 70, 229, 0.12)",
                  }}
                >
                  {msg.content}
                </div>
              );
            }

            if (msg.kind === "progress") {
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: "flex-start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#475569",
                    fontSize: 11,
                    lineHeight: 1.4,
                    padding: "2px 0",
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      backgroundColor: "#94a3b8",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span>{msg.content}</span>
                </div>
              );
            }

            const hasStructuredThought =
              Boolean(msg.thought) ||
              Boolean(msg.toolLabel) ||
              (msg.images && msg.images.length > 0);

            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: "flex-start",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {/* Structured Collapsible Thought */}
                {msg.thought && <CollapsibleThought thought={msg.thought} defaultOpen={false} />}

                {/* Tool label */}
                {msg.toolLabel && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "#64748b",
                      fontSize: 12,
                      fontWeight: 500,
                      marginTop: msg.thought ? 0 : 2,
                    }}
                  >
                    <ImageSparkleIcon style={{ color: "#4f46e5", width: 14, height: 14 }} />
                    <span>{msg.toolLabel}</span>
                  </div>
                )}

                {/* Image thumbnails */}
                {msg.images && msg.images.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 6,
                      marginBottom: 4,
                      width: "100%",
                    }}
                  >
                    {msg.images.map((img, idx) => (
                      <div
                        key={img.fileId || idx}
                        onClick={() => handleSelectCanvasImage(img.fileId)}
                        title="คลิกเพื่อเลือกภาพบน Canvas"
                        style={{
                          flex: 1,
                          maxWidth: msg.images!.length === 1 ? 380 : 190,
                          aspectRatio: "1 / 1",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#f8fafc",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06)",
                          border: "1px solid #e2e8f0",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.02)";
                          e.currentTarget.style.borderColor = "#4f46e5";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(79, 70, 229, 0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.borderColor = "#e2e8f0";
                          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.06)";
                        }}
                      >
                        {/* biome-ignore lint/performance/noImgElement: Co-pilot generated image card */}
                        <img
                          src={img.url}
                          alt={img.label || `Image ${idx + 1}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Text Content */}
                {msg.content && (
                  <div
                    style={{
                      marginTop: msg.images && msg.images.length > 0 ? 4 : 2,
                      color: "#334155",
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content}
                  </div>
                )}

                {/* Sub-agent Action logs (if any and not already structured) */}
                {!hasStructuredThought && msg.actions && msg.actions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {msg.actions.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          fontSize: 10.5,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background:
                            act.status === "success"
                              ? "#ecfdf5"
                              : act.status === "error"
                                ? "#fef2f2"
                                : "#eef2ff",
                          color:
                            act.status === "success"
                              ? "#065f46"
                              : act.status === "error"
                                ? "#991b1b"
                                : "#3730a3",
                          border: `1px solid ${
                            act.status === "success"
                              ? "#a7f3d0"
                              : act.status === "error"
                                ? "#fecaca"
                                : "#c7d2fe"
                          }`,
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {act.status === "success" ? (
                          <CheckIcon style={{ color: "#059669" }} />
                        ) : act.status === "error" ? (
                          <CloseIcon style={{ color: "#dc2626" }} />
                        ) : (
                          <SpinnerIcon style={{ color: "#4f46e5" }} />
                        )}
                        <strong>{act.title}</strong>
                        <span>— {act.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feedback Icons (Thumbs Up / Down) */}
                {msg.role === "assistant" && msg.id !== "initial-msg" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => handleToggleFeedback(msg.id, "up")}
                      title="มีประโยชน์"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 3,
                        cursor: "pointer",
                        color: feedbackState[msg.id] === "up" ? "#4f46e5" : "#94a3b8",
                        transition: "color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#4f46e5";
                      }}
                      onMouseLeave={(e) => {
                        if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#94a3b8";
                      }}
                    >
                      <ThumbsUpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleFeedback(msg.id, "down")}
                      title="ปรับปรุง"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 3,
                        cursor: "pointer",
                        color: feedbackState[msg.id] === "down" ? "#ef4444" : "#94a3b8",
                        transition: "color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (feedbackState[msg.id] !== "down")
                          e.currentTarget.style.color = "#ef4444";
                      }}
                      onMouseLeave={(e) => {
                        if (feedbackState[msg.id] !== "down")
                          e.currentTarget.style.color = "#94a3b8";
                      }}
                    >
                      <ThumbsDownIcon />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pending Review Plan */}
          {pendingReview ? (
            <div
              role="region"
              aria-label="Pending AI plan review"
              style={{
                alignSelf: "stretch",
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: 11,
              }}
            >
              <strong style={{ display: "block", fontSize: 11.5, color: "#78350f" }}>
                Reviewable plan
              </strong>
              <span style={{ display: "block", marginTop: 3, lineHeight: 1.4, color: "#92400e" }}>
                {pendingReview.summary.slice(0, 240)} · {pendingReview.commandCount} รายการ
              </span>
              <div style={{ marginTop: 7, lineHeight: 1.45 }}>
                <div>
                  <strong>กระทบ:</strong> {pendingReview.targets.join(", ")}
                </div>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {pendingReview.changes.map((change, index) => (
                    <li key={`${change}-${index}`}>{change}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 4, fontWeight: 600, color: "#b45309" }}>
                  ต้องกด Apply plan เพื่อยืนยันก่อนแก้ไข Artwork
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={applyPendingPlan}
                  disabled={busy}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    padding: "5px 10px",
                    background: busy ? "#94a3b8" : "#d97706",
                    color: "#ffffff",
                    cursor: busy ? "default" : "pointer",
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  Apply plan
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPlan(null)}
                  disabled={busy}
                  style={{
                    border: "1px solid #d97706",
                    borderRadius: 6,
                    padding: "5px 10px",
                    background: "transparent",
                    color: "#b45309",
                    cursor: busy ? "default" : "pointer",
                    fontSize: 10.5,
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          {/* Sequential Execution Plan proposal */}
          {pendingSequentialPlan && (
            <div
              role="region"
              aria-label="Sequential Execution Plan"
              style={{
                alignSelf: "stretch",
                padding: "10px 12px",
                borderRadius: 8,
                background: "#faf5ff",
                border: "1px solid #e9d5ff",
                color: "#581c87",
                fontSize: 11,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <BoltIcon style={{ color: "#7c3aed" }} />
                  <strong style={{ fontSize: 11.5, color: "#581c87" }}>
                    Multi-Specialist Plan ({pendingSequentialPlan.steps.length} steps)
                  </strong>
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    padding: "2px 7px",
                    borderRadius: 10,
                    background: "#f3e8ff",
                    color: "#7c3aed",
                    fontWeight: 700,
                  }}
                >
                  {pendingSequentialPlan.overallStatus}
                </span>
              </div>
              <span style={{ display: "block", marginTop: 4, color: "#6b21a8", lineHeight: 1.4 }}>
                {pendingSequentialPlan.summary}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {pendingSequentialPlan.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 8px",
                      background: "#ffffff",
                      borderRadius: 6,
                      border: "1px solid #f3e8ff",
                      fontSize: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "#7c3aed" }}>#{idx + 1}</span>
                      <strong style={{ color: "#1e1b4b" }}>{step.name}</strong>
                      <span
                        style={{
                          fontSize: 9,
                          background: "#f3e8ff",
                          color: "#6b21a8",
                          padding: "1px 5px",
                          borderRadius: 4,
                        }}
                      >
                        {step.specialist}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color:
                          step.status === "completed"
                            ? "#059669"
                            : step.status === "running"
                              ? "#2563eb"
                              : step.status === "paused_on_gate"
                                ? "#d97706"
                                : step.status === "failed"
                                  ? "#dc2626"
                                  : "#64748b",
                      }}
                    >
                      {step.status === "completed" ? (
                        <>
                          <CheckIcon style={{ width: 11, height: 11, color: "#059669" }} />
                          <span>Done</span>
                        </>
                      ) : step.status === "running" ? (
                        <>
                          <SpinnerIcon style={{ width: 11, height: 11, color: "#2563eb" }} />
                          <span>Running</span>
                        </>
                      ) : step.status === "paused_on_gate" ? (
                        <span>Quality Gate</span>
                      ) : step.status === "failed" ? (
                        <>
                          <CloseIcon style={{ width: 11, height: 11, color: "#dc2626" }} />
                          <span>Failed</span>
                        </>
                      ) : (
                        "Pending"
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={executeSequentialPlan}
                  disabled={busy || isExecutingPlan}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    padding: "6px 12px",
                    background: isExecutingPlan ? "#9333ea" : "#7c3aed",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 10.5,
                    cursor: busy || isExecutingPlan ? "default" : "pointer",
                  }}
                >
                  {isExecutingPlan
                    ? "กำลังรันแผน..."
                    : pendingSequentialPlan.overallStatus === "paused"
                      ? "Resume Execution"
                      : "Approve & Execute Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSequentialPlan(null)}
                  disabled={isExecutingPlan}
                  style={{
                    border: "1px solid #ddd6fe",
                    borderRadius: 6,
                    padding: "6px 10px",
                    background: "transparent",
                    color: "#7c3aed",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Staging Tray & Hover Ghost Preview */}
          {stagedVariations.length > 0 && (
            <div
              role="region"
              aria-label="Candidate Variations Staging Tray"
              style={{
                alignSelf: "stretch",
                padding: "8px 10px",
                borderRadius: 8,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                fontSize: 10.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ImageSparkleIcon style={{ color: "#16a34a", width: 14, height: 14 }} />
                  <strong style={{ fontSize: 11, color: "#15803d" }}>
                    Staging Tray ({stagedVariations.length} Candidate Variations)
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useEngine.getState().clearGhostOverlay();
                    setStagedVariations([]);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 9.5,
                    color: "#16a34a",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear Tray
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 4,
                }}
              >
                {stagedVariations.map((v) => (
                  <div
                    key={v.id}
                    onMouseEnter={() => handleVariationHover(v)}
                    onMouseLeave={handleVariationLeave}
                    style={{
                      position: "relative",
                      flex: "0 0 110px",
                      border: v.status === "accepted" ? "2px solid #10b981" : "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 5,
                      background: "#ffffff",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 64,
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {v.url ? (
                        // biome-ignore lint/a11y/useAltText: Staged variation candidate preview
                        // biome-ignore lint/performance/noImgElement: Direct candidate variation preview in staging tray
                        <img
                          src={v.url}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <ImageIcon style={{ width: 22, height: 22, color: "#94a3b8" }} />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: "#334155",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.label}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          commitVariationToCanvas(v);
                        }}
                        style={{
                          flex: 1,
                          padding: "3px 4px",
                          borderRadius: 4,
                          border: "none",
                          background: v.status === "accepted" ? "#10b981" : "#4f46e5",
                          color: "#ffffff",
                          fontSize: 9.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        {v.status === "accepted" ? (
                          <>
                            <CheckIcon style={{ width: 10, height: 10 }} />
                            <span>Done</span>
                          </>
                        ) : (
                          "Place"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissVariation(v.id);
                        }}
                        style={{
                          padding: "3px 5px",
                          borderRadius: 4,
                          border: "1px solid #e2e8f0",
                          background: "#ffffff",
                          color: "#64748b",
                          fontSize: 9,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CloseIcon style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {busy && streamingText && (
            <div
              style={{
                alignSelf: "flex-start",
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: "12px 12px 12px 2px",
                background: "#f1f5f9",
                color: "#1e293b",
                fontSize: 12.5,
                lineHeight: 1.45,
                border: "1px solid #e2e8f0",
              }}
            >
              {streamingText}
            </div>
          )}

          {/* Live In-Progress State: Matches Prototype Screenshots with Collapsible Thought */}
          {busy && liveAssistantState && (
            <div
              style={{
                alignSelf: "flex-start",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {/* Collapsible Thought block */}
              <CollapsibleThought
                thought={
                  liveAssistantState.thought ||
                  (liveAssistantState.stage === "outputting"
                    ? "กำลังจัดเตรียมผลลัพธ์..."
                    : "กำลังวิเคราะห์บริบทและเตรียมการสร้างภาพ...")
                }
                isLive={true}
                defaultOpen={false}
              />

              {/* Tool Step (if generating) */}
              {liveAssistantState.stage === "generating" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "#475569",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <ImageSparkleIcon style={{ color: "#4f46e5", width: 14, height: 14 }} />
                    <span style={{ animation: "artshiftPulse 2s ease-in-out infinite" }}>
                      {liveAssistantState.toolLabel || "Generating images using GPT Image 2"}
                    </span>
                  </div>

                  {/* Shimmer Skeleton Cards */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 4,
                      width: "100%",
                    }}
                  >
                    {Array.from({
                      length: Math.max(1, Math.min(3, liveAssistantState.requestedCount || 1)),
                    }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          maxWidth: (liveAssistantState.requestedCount || 1) === 1 ? 380 : 190,
                          aspectRatio: "1 / 1",
                          borderRadius: 12,
                          background:
                            "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                          backgroundSize: "200% 100%",
                          animation: "artshiftShimmer 1.8s infinite ease-in-out",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Live running actions indicator (if any other actions without liveAssistantState) */}
          {busy && !liveAssistantState && currentActions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {currentActions.map((act) => (
                <div
                  key={act.id}
                  style={{
                    minWidth: 0,
                    fontSize: 10.5,
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: "#eff6ff",
                    color: "#1e40af",
                    border: "1px solid #bfdbfe",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    overflowWrap: "anywhere",
                  }}
                >
                  <SpinnerIcon style={{ color: "#2563eb" }} />
                  <strong>{act.title}</strong>
                  <span>{act.description}</span>
                </div>
              ))}
              <button
                type="button"
                data-testid="cancel-ai-task"
                aria-label="ยกเลิก Task"
                onClick={() => abortRef.current?.abort()}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 6px",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                <CloseIcon style={{ width: 10, height: 10 }} />
                <span>ยกเลิก Task</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Assistant composer */}
      <div
        style={{
          width: "100%",
          flex: "0 0 auto",
          background: "#ffffff",
          borderTop: "1px solid #e2e8f0",
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, width: "100%" }}>
          {/* Input Field */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 52,
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "8px 12px",
              boxSizing: "border-box",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocusCapture={(e) => {
              e.currentTarget.style.borderColor = "#4f46e5";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(79, 70, 229, 0.1)";
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <ComposerImageTags
              refs={snapshotComposerImageRefs(selectedImageRefs)}
              omittedCount={selectedImageSelection.omittedCount}
              onRemove={(ref) => useEngine.getState().toggleSelect(ref.objectId)}
            />
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={hasSelection ? "แก้ไขภาพหรือวัตถุที่เลือก..." : "บอกสิ่งที่ต้องการออกแบบ..."}
              aria-label="AI Assistance prompt"
              style={{
                flex: 1,
                width: "100%",
                minHeight: 36,
                resize: "none",
                border: 0,
                outline: "none",
                fontSize: 13,
                lineHeight: 1.45,
                color: "#0f172a",
                background: "transparent",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Send / stop action */}
          <button
            type="button"
            disabled={!busy && !input.trim()}
            onClick={() => (busy ? abortRef.current?.abort() : handleSend())}
            style={{
              flex: "0 0 36px",
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: busy ? "#ef4444" : input.trim() ? "#4f46e5" : "#f1f5f9",
              color: busy || input.trim() ? "#ffffff" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy || !input.trim() ? (busy ? "pointer" : "default") : "pointer",
              transition: "all 0.15s ease",
            }}
            title={busy ? "Cancel current task" : "Send to AI Assistance"}
          >
            {busy ? (
              <StopIcon style={{ width: 12, height: 12, fill: "#ffffff" }} />
            ) : (
              <SendIcon
                style={{
                  width: 14,
                  height: 14,
                  stroke: input.trim() ? "#ffffff" : "#94a3b8",
                }}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function findClarificationOption(
  pending: PendingClarification,
  value: string,
): PendingClarification["options"][number] | undefined {
  return pending.options.find((option) => option.label === value);
}
