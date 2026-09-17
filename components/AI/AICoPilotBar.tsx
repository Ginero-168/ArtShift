"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatActionCards, { type StagedVariationCard } from "@/components/AI/ChatActionCards";
import ChatComposer, { type QualitySelection } from "@/components/AI/ChatComposer";
import ChatThread from "@/components/AI/ChatThread";
import { useCanvasSelectionBridge } from "@/components/AI/useCanvasSelectionBridge";
import {
  type CoPilotMessage, diagnoseOrchestratorError, executeCoPilotInstruction,
  isToolCoPilotPrompt, type SubAgentActionLog,
} from "@/lib/ai/coPilot";
import { isImageGenerationPrompt } from "@/lib/ai/imageGeneration";
import { prepareRemoteCreativeDirection, reviewRemoteCreativeOutput } from "@/lib/ai/orchestration/creativeDirectorClient";
import { runContextAwareImageRun } from "@/lib/ai/orchestration/imageBatchRunner";
import { deriveGeneratedImageName } from "@/lib/ai/orchestration/imageNaming";
import { buildComposerImageSelectionFromIds, snapshotComposerImageRefs } from "@/lib/ai/orchestration/imageReferences";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import { cleanTechnicalPromptText, extractInlineTagRefs } from "@/lib/ai/orchestration/inlineTagSynthesis";
import {
  composeFollowUpDirectorPrompt,
  extractPriorImageGenerationContext,
  isImageFollowUpPrompt,
  type PriorImageGenerationContext,
} from "@/lib/ai/orchestration/chatContinuity";
import {
  buildChatHistorySnapshot,
  clearChatHistorySnapshot,
  loadChatHistorySnapshot,
  readProjectIdFromPath,
  saveChatHistorySnapshot,
} from "@/lib/ai/orchestration/chatHistoryStore";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";
import {
  buildRefinementOrchestratorLocks,
  createPromptRefinement,
  isBroadImagePrompt,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";
import { inferSharedAnchors } from "@/lib/ai/orchestration/promptOptionCatalog";
import { analyzeImageReferences, type ImageReferenceAnalysis } from "@/lib/ai/orchestration/referenceAnalysis";
import {
  DEFAULT_CREATING_MODEL_LABEL,
  formatCreatingModelLabel,
} from "@/lib/ai/orchestration/creatingModelCatalog";
import {
  type ContextAwareTurnResult, createDirectedImageRun, createDirectedImageTask,
  isCanvasInventoryPrompt, type PendingClarification, prepareContextAwareTurn,
  runSequentialExecutionPlan, type SequentialExecutionPlan,
} from "@/lib/ai/orchestration/turnOrchestrator";
import { subscribeAIProgress } from "@/lib/ai/progressReporter";
import { formatImageCompletionReply, buildImageCompletionSummary } from "@/lib/ai/imageCompletionReply";
import {
  formatFriendlyAspectRatio,
  formatHumanThoughtText,
} from "@/lib/ai/imageResultPresentation";
import { routeUnifiedPrompt, UNIFIED_AI_SYSTEM } from "@/lib/ai/unifiedSystem";
import { planVisualRequest } from "@/lib/ai/visualOrchestrator";
import { buildDesignAgentContext, type ClientChatMessage } from "@/lib/designAgent/client";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import { buildLocalEditPlan } from "@/lib/designAgent/localPlan";
import { summarizePlanForReview } from "@/lib/designAgent/planReview";
import { applyAiPlan } from "@/lib/engine/applyAiPlan";
import { createFrame, createImage } from "@/lib/engine/factory";
import { preloadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { calculateGhostBounds } from "@/lib/renderer/ghostOverlay";

export type { StagedVariationCard };

function extractSubject(prompt: string, summary?: string): string {
  let effectivePrompt = prompt;
  if (effectivePrompt.includes("User reply:")) {
    effectivePrompt = effectivePrompt.slice(effectivePrompt.lastIndexOf("User reply:") + 11).trim();
  } else if (effectivePrompt.includes("\n\n")) {
    const segments = effectivePrompt.split("\n\n").map((s) => s.trim()).filter(Boolean);
    effectivePrompt = segments[segments.length - 1] || effectivePrompt;
  }
  effectivePrompt = effectivePrompt.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "").replace(/@[^\s]+/g, "").trim();

  if (summary && summary.trim().length > 0 && !summary.includes("Director question:")) {
    let cleanFromSummary = cleanTechnicalPromptText(summary);
    if (cleanFromSummary.includes("User reply:")) {
      cleanFromSummary = cleanFromSummary.slice(cleanFromSummary.lastIndexOf("User reply:") + 11).trim();
    }
    cleanFromSummary = cleanFromSummary.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "").replace(/@[^\s]+/g, "").trim()
      .replace(/^(?:ช่วย|กรุณา)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?\s*/iu, "")
      .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
      .replace(/^(?:รูปภาพ|ภาพ|รูป)\s*/iu, "")
      .replace(/\s*(?:ตามที่ขอ|เรียบร้อยแล้ว|สมจริง|สวยๆ|สไตล์.*|ในฉาก.*)\s*$/iu, "")
      .trim();
    if (cleanFromSummary.length > 0 && cleanFromSummary.length < 60 && !cleanFromSummary.includes("\n")) {
      return cleanFromSummary;
    }
  }

  let cleaned = effectivePrompt
    .replace(/^(?:ช่วย|กรุณา|อยากได้|อยากให้|ขอ)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?/iu, "")
    .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
    .replace(/\s*(?:ให้หน่อย|คิดให้หน่อย|สวยๆ|เจ๋งๆ|น่ารัก|สมจริง|ด้วยนะ|ด้วยครับ|ด้วยค่ะ|ด้วย)\s*$/iu, "")
    .trim();
  if (cleaned.includes("\n")) cleaned = cleaned.split("\n")[0].trim();
  return cleaned || "ภาพ";
}

function formatThoughtText(
  rawPrompt: string,
  directionSummary?: string,
  count = 1,
  isEdit = false,
  dims?: { width?: number; height?: number; aspectRatio?: string },
  plannedAspects?: readonly string[],
): string {
  const multiAspectNote =
    plannedAspects && plannedAspects.length > 1
      ? ` จะแยกสร้างตามสัดส่วน ${plannedAspects.join(" · ")}`
      : "";
  const base = formatHumanThoughtText({
    rawPrompt,
    directionSummary,
    count,
    isEdit,
    width: dims?.width,
    height: dims?.height,
    aspectRatio: dims?.aspectRatio,
  });
  return multiAspectNote ? `${base}${multiAspectNote}` : base;
}

const DEFAULT_ASSISTANT_GREETING: CoPilotMessage = {
  id: "initial-msg",
  role: "assistant",
  content:
    "สวัสดีครับ! ผมคือ AI Assistance ของคุณ จะอ่านบริบทและช่วยวางแผนก่อนสร้างภาพ เพื่อให้ได้ผลลัพธ์ที่ตรงความต้องการมากขึ้นครับ",
  timestamp: 0,
};

function createDefaultGreeting(): CoPilotMessage {
  return { ...DEFAULT_ASSISTANT_GREETING, timestamp: Date.now() };
}

export default function AICoPilotBar() {
  const projectId = useMemo(() => readProjectIdFromPath(), []);
  const restoredChat = useMemo(
    () => (projectId ? loadChatHistorySnapshot(projectId) : null),
    [projectId],
  );
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const slide = useEngine((s) =>
    s.doc.slides.find((candidate) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s) => s.selectedIds);

  const {
    attachedImageIds,
    setAttachedImageIds,
    allSlideImageRefs,
    composerImageRefs,
    editorRef,
    setEditorRef,
    handleSelectCanvasImage,
    handleRemoveAttachedImage,
    clearAttachedImages,
    handleInlineTagsChange,
    removeLastAttachedImage,
  } = useCanvasSelectionBridge();

  const composerImageSelection = useMemo(() => {
    return buildComposerImageSelectionFromIds(slide?.elements ?? [], attachedImageIds);
  }, [slide?.elements, attachedImageIds]);

  const [input, setInput] = useState(() => restoredChat?.input ?? "");
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [messages, setMessages] = useState<CoPilotMessage[]>(() =>
    restoredChat?.messages?.length ? restoredChat.messages : [createDefaultGreeting()],
  );

  const [currentActions, setCurrentActions] = useState<SubAgentActionLog[]>([]);
  const [pendingPlan, setPendingPlan] = useState<PlanProposal | null>(null);
  const [pendingSequentialPlan, setPendingSequentialPlan] =
    useState<SequentialExecutionPlan | null>(null);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualitySelection>(
    () => restoredChat?.selectedQuality ?? "auto",
  );
  const [stagedVariations, setStagedVariations] = useState<StagedVariationCard[]>([]);
  const [pendingClarification, setPendingClarification] = useState<PendingClarification | null>(
    () => restoredChat?.pendingClarification ?? null,
  );
  const [liveAssistantState, setLiveAssistantState] = useState<{
    stage: "outputting" | "generating" | "analyzing" | "planning";
    thought?: string;
    toolLabel?: string;
    requestedCount?: number;
    statusMessage?: string;
    prompt?: string;
    isEdit?: boolean;
    stepDetails?: string[];
    actions?: SubAgentActionLog[];
  } | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});
  const [promptRefinementData, setPromptRefinementData] = useState<PromptRefinementCardData | null>(
    null,
  );
  const pendingRefinementLocksRef = useRef<ReturnType<
    typeof buildRefinementOrchestratorLocks
  > | null>(null);

  const elementCount = (slide?.elements ?? []).filter((e) => !e.isDeleted).length;

  const handleToggleFeedback = (messageId: string, type: "up" | "down") => {
    setFeedbackState((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === type ? undefined! : type,
    }));
  };

  const handleClearHistory = () => {
    setMessages([createDefaultGreeting()]);
    setPendingClarification(null);
    setStagedVariations([]);
    setPromptRefinementData(null);
    setInput("");
    if (projectId) clearChatHistorySnapshot(projectId);
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAlternativePromptRef = useRef<string | null>(null);
  const activeHoveredVariationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const timer = window.setTimeout(() => {
      saveChatHistorySnapshot(
        buildChatHistorySnapshot({
          projectId,
          messages,
          draft: input,
          pendingClarification,
          selectedQuality,
        }),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [projectId, messages, input, pendingClarification, selectedQuality]);

  useEffect(() => {
    return subscribeAIProgress((event) => {
      const isError = event.status === "error";
      const isResult = event.presentation === "result" || isError;
      const progressLabel = typeof event.progress === "number" ? ` (${event.progress}%)` : "";
      setMessages((previous) => {
        const messageId = isResult
          ? `result-${event.taskId}-${event.timestamp}`
          : `progress-${event.taskId}`;
        const nextMessage: CoPilotMessage = {
          id: messageId,
          role: isResult ? "assistant" : "system",
          kind: isResult ? "message" : "progress",
          isError,
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
    activeHoveredVariationIdRef.current = card.id;
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
      if (activeHoveredVariationIdRef.current !== card.id) return;
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
    activeHoveredVariationIdRef.current = null;
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
    const targetRatio = (card.width || 1024) / Math.max(1, card.height || 1024);
    const needsFrame = Math.abs(targetRatio - naturalWidth / Math.max(1, naturalHeight)) > 0.04;
    const elementName = deriveGeneratedImageName(card.label);
    const element = needsFrame
      ? createFrame({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          name: `${elementName} (Frame)`,
          shape: "rect",
          imageFileId: fileId,
        })
      : createImage({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          fileId,
          naturalWidth,
          naturalHeight,
          name: elementName,
          sourceName: elementName,
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

  const handleTogglePromptHelper = async () => {
    if (promptRefinementData) {
      pendingRefinementLocksRef.current = null;
      setPromptRefinementData(null);
      return;
    }
    const currentPrompt = (editorRef.current?.getValue() ?? input).trim();
    const basePrompt = currentPrompt || "สร้างภาพ";
    const baseline = createPromptRefinement(basePrompt);
    setPromptRefinementData(baseline);
    try {
      const res = await fetch("/api/ai/prompt-helper/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: basePrompt, cloudConsent: true }),
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        card?: ReturnType<typeof createPromptRefinement>;
      } | null;
      if (json?.card) {
        setPromptRefinementData(json.card);
      }
    } catch {
      // Baseline card already shown.
    }
  };

  const handleSend = async (customPrompt?: string, _skipRefinementCheck?: boolean) => {
    const rawPrompt = (customPrompt ?? editorRef.current?.getValue() ?? input).trim();
    if (!rawPrompt || busy) return;

    if (promptRefinementData) {
      setPromptRefinementData(null);
    }

    const pending = pendingClarification;
    const selectedOption =
      pending && customPrompt ? findClarificationOption(pending, customPrompt) : undefined;
    let promptToSend = pending
      ? composeClarifiedImagePrompt(
          pending.originalPrompt,
          selectedOption?.label ?? rawPrompt,
          pending.question,
        )
      : rawPrompt;

    if (customPrompt && (customPrompt.startsWith("✨") || customPrompt.includes("Yes, go ahead"))) {
      if (lastAlternativePromptRef.current) {
        promptToSend = lastAlternativePromptRef.current;
      }
    }

    const historyForContinuity = messages
      .filter(
        (m): m is CoPilotMessage & { role: "user" | "assistant" } =>
          (m.role === "user" || m.role === "assistant") && m.kind !== "progress",
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        ...(m.generationContext ? { generationContext: m.generationContext } : {}),
      }));
    const priorGeneration: PriorImageGenerationContext | null =
      extractPriorImageGenerationContext(historyForContinuity);
    const isFollowUpTurn = !pending && isImageFollowUpPrompt(promptToSend) && Boolean(priorGeneration);
    const directorPrompt =
      isFollowUpTurn && priorGeneration
        ? composeFollowUpDirectorPrompt(promptToSend, priorGeneration)
        : promptToSend;

    const inlineTagRefs = extractInlineTagRefs(rawPrompt);
    const inlineObjectIds = inlineTagRefs.map((tag) => tag.objectId);
    const selectionIds =
      inlineTagRefs.length > 0
        ? [
            ...inlineTagRefs.map((tag) => `@[${tag.displayName}:${tag.objectId}]`),
            ...attachedImageIds.filter((id) => !inlineObjectIds.includes(id)),
          ]
        : attachedImageIds;
    const effectiveSelection = buildComposerImageSelectionFromIds(
      slide?.elements ?? [],
      selectionIds,
    );

    if (!pending && effectiveSelection.omittedCount > 0) {
      const omittedCount = effectiveSelection.omittedCount;
      setInput("");
      editorRef.current?.clear();
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
          content: `ตอนนี้เลือกภาพสำหรับ AI มากเกินไปครับ (${effectiveSelection.totalCount} ภาพ) กรุณาลด selection เหลือไม่เกิน 4 ภาพก่อนส่งงาน (+${omittedCount})`,
          timestamp: Date.now(),
          suggestions: ["ลด selection เหลือไม่เกิน 4 ภาพ", "ถามเกี่ยวกับ Canvas แบบ local"],
        },
      ]);
      return;
    }
    const refsForTurn = snapshotComposerImageRefs(
      pending ? pending.selectedImages : effectiveSelection.refs,
    );

    setInput("");
    editorRef.current?.clear();
    setAttachedImageIds([]);
    setBusy(true);
    setStreamingText("");
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: CoPilotMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: selectedOption?.label ?? rawPrompt,
      timestamp: Date.now(),
      imageRefs: refsForTurn.length > 0 ? refsForTurn : undefined,
    };

    const isEditTurn = refsForTurn.length > 0;
    setMessages((prev) => [...prev, userMsg]);
    setCurrentActions([]);
    setLiveAssistantState({
      stage: isEditTurn ? "analyzing" : "outputting",
      prompt: promptToSend,
      isEdit: isEditTurn,
      statusMessage: isEditTurn ? "กำลังวิเคราะห์ภาพต้นฉบับ..." : "กำลังประมวลผลคำสั่ง...",
    });

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
            lastAssistantMsg.toolLabel === DEFAULT_CREATING_MODEL_LABEL ||
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
            title: "Image Analyzer (วิเคราะห์ภาพต้นฉบับ)",
            description: `กำลังวิเคราะห์ภาพต้นฉบับและบริบทบน Canvas (${refsForTurn.length} ภาพ)…`,
            status: "running",
            timestamp: Date.now(),
          };
          analysisActions.push(analysisAction);
          upsertCurrentAction(analysisAction);
          setLiveAssistantState({
            stage: "analyzing",
            prompt: promptToSend,
            isEdit: true,
            statusMessage: "กำลังวิเคราะห์ภาพต้นฉบับและบริบท...",
            actions: [analysisAction],
          });
          try {
            analysesForTurn = await analyzeImageReferences(
              refsForTurn,
              controller.signal,
              (completed, total, stage) => {
                analysisAction.description = `${stage} · ${Math.round((completed / Math.max(1, total)) * 100)}%`;
                upsertCurrentAction({ ...analysisAction });
                setLiveAssistantState((prev) => ({
                  ...(prev || { stage: "analyzing", prompt: promptToSend, isEdit: true }),
                  stage: "analyzing",
                  statusMessage: `กำลังวิเคราะห์ภาพ (${Math.round((completed / Math.max(1, total)) * 100)}%)...`,
                  actions: [analysisAction],
                }));
              },
            );
            analysisAction.status = "success";
            analysisAction.description = `วิเคราะห์ภาพต้นฉบับเสร็จสมบูรณ์ (${analysesForTurn.length} รายการ)`;
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
          conversationHistory: historyForContinuity,
          priorGeneration,
          clarification: pending
            ? {
                originalPrompt: pending.originalPrompt,
                question: pending.question,
                optionIds: pending.options.map((option) => option.id),
              }
            : undefined,
          clarificationRound: pending?.round ?? 0,
          preferredQuality: selectedQuality !== "auto" ? selectedQuality : undefined,
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
          const directorAction: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: "orchestrator",
            title: "Creative Director (Gemini 3 Flash)",
            description:
              "กำลังวิเคราะห์โจทย์ ประเมิน Detail Score & Precision Score จัดสัดส่วนภาพและแนวคิด 2D Graphic…",
            status: "running",
            timestamp: Date.now(),
            stage: "analyzing",
            attempt: 0,
          };
          actions = [...actions, directorAction];
          upsertCurrentAction({ ...directorAction });
          setLiveAssistantState((prev) => ({
            ...(prev || { prompt: promptToSend, isEdit: refsForTurn.length > 0 }),
            stage: "planning",
            statusMessage: "Creative Director กำลังวางแผนงาน...",
            actions: [...actions],
          }));
          let activeRunningAction: SubAgentActionLog = directorAction;
          let resolvedModelLabel = DEFAULT_CREATING_MODEL_LABEL;
          // Creative Director disclosure copy:
          // งานนี้จะส่งคำสั่งไปยัง Gemini 3 Flash Creative Director เพื่อวางแผน อาจค้น Reference ผ่าน Unsplash/Pexels เมื่อจำเป็น แล้วเรียก Image Model เพื่อสร้างและตรวจผลลัพธ์
          const consent = true;
          if (!consent) {
            directorAction.status = "error";
            directorAction.stage = "cancelled";
            directorAction.description =
              "ยังไม่ได้รับอนุญาตให้ส่งงานไปยัง Creative Director หรือ Image Model";
            reply = "ยกเลิกการวางแผนแล้วครับ ยังไม่ได้สร้าง Task หรือส่ง prompt, ภาพ ไปยัง AI provider";
          } else {
            try {
              const direction = await prepareRemoteCreativeDirection(
                {
                  prompt: directorPrompt,
                  conversationHistory: historyForContinuity
                    .map((message): ClientChatMessage => ({
                      role: message.role,
                      content: message.content,
                    }))
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
              ).catch((dirErr) => {
                if (
                  (dirErr as Error).name !== "AbortError" &&
                  !controller.signal.aborted &&
                  (isImageGenerationPrompt(promptToSend) || refsForTurn.length > 0)
                ) {
                  console.warn(
                    "Creative Director error, activating self-healing fallback:",
                    dirErr,
                  );
                  const isEdit = refsForTurn.length > 0;
                  return {
                    kind: "image-task" as const,
                    requestedOutputCount: 1,
                    outputBriefs: ["ภาพผลลัพธ์"],
                    summary: isEdit ? "แก้ไขและปรับแต่งภาพตามที่เลือก" : "สร้างสรรค์ภาพใหม่ตามคำอธิบาย",
                    refinedPrompt: promptToSend,
                    specialist: isEdit ? ("image_editor" as const) : ("image_generator" as const),
                    capability: isEdit ? ("IMAGE_EDIT" as const) : ("IMAGE_DEFAULT" as const),
                    modelAlias: "image-gpt-2" as const,
                    knowledgeSkillIds: [],
                    reviewCriteria: [],
                    search: { required: false, queries: [], sources: [] },
                    detailScore: 8,
                    precisionScore: 8,
                  };
                }
                throw dirErr;
              });

              activeRunningAction = directorAction;

              if (direction.kind === "answer") {
                setPendingClarification(null);
                directorAction.status = "success";
                directorAction.stage = "succeeded";
                directorAction.description = "Creative Director ตอบโดยไม่เรียก Image Model";
                const trimmed = direction.text.trim();
                let cleanAnswer = direction.text;
                if (
                  trimmed.startsWith("{") &&
                  (trimmed.includes('"kind"') || trimmed.includes('"calls"'))
                ) {
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
                directorAction.status = "success";
                directorAction.stage = "clarifying";
                directorAction.description =
                  "Creative Director ต้องการรายละเอียดเพิ่มก่อนเลือก Specialist";
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
                directorAction.status = "success";
                directorAction.stage = "planned";
                directorAction.description = `เตรียมแผนแก้ Canvas ${direction.proposal.commands.length} รายการ รอการอนุมัติ`;
                reply =
                  "ArtShift Orchestrator เตรียมแผนแก้ไข Canvas แล้วครับ ตรวจสอบและกด Apply plan เพื่อดำเนินงาน";
                suggestions = ["ตรวจสอบแผนแล้วกด Apply plan", "แก้ brief ก่อนเริ่มงาน"];
              } else if (direction.kind === "sequential-plan") {
                setPendingClarification(null);
                setPendingSequentialPlan(direction.plan);
                directorAction.status = "success";
                directorAction.stage = "planned";
                directorAction.description = `Creative Director เสนอแผนงาน ${direction.plan.steps.length} ขั้นตอน`;
                reply = `ArtShift Creative Director เสนอแผนงานต่อเนื่อง ${direction.plan.steps.length} ขั้นตอน เพื่อความแม่นยำ กรุณาตรวจสอบและกด Approve & Execute เพื่อเริ่มงานครับ`;
                suggestions = ["อนุมัติและเริ่มรันแผน", "ยกเลิกแผนนี้"];
              } else if (direction.search.required) {
                directorAction.status = "success";
                directorAction.stage = "analyzing";
                directorAction.description =
                  "Creative Director ระบุว่าต้องค้น Context ภายนอกก่อนสร้างงาน";
                reply = `ยังไม่เรียก Image Model ครับ Creative Director ต้องค้นข้อมูลเพิ่มก่อน: ${direction.search.queries.join(", ")}`;
                suggestions = ["เพิ่ม Reference เอง", "ปรับ brief โดยไม่ใช้ข้อมูลภายนอก"];
              } else {
                directorAction.status = "success";
                directorAction.stage = "succeeded";
                directorAction.detailScore = direction.detailScore;
                directorAction.precisionScore = direction.precisionScore;
                const summaryDetail =
                  direction.summary || "กำหนดคอนเซปต์และจัดวางองค์ประกอบศิลป์เรียบร้อย";
                const scoresParts: string[] = [];
                if (direction.detailScore !== undefined) {
                  scoresParts.push(`Detail: ${direction.detailScore}/10`);
                }
                if (direction.precisionScore !== undefined) {
                  scoresParts.push(`Precision: ${direction.precisionScore}/10`);
                }
                const scoresBadge = scoresParts.length > 0 ? ` (${scoresParts.join(" · ")})` : "";
                const cleanSummary = cleanTechnicalPromptText(summaryDetail);
                directorAction.description = `วางแผนสำเร็จ: ${cleanSummary}${scoresBadge} (เลือก ${direction.modelAlias})`;
                upsertCurrentAction({ ...directorAction });

                const imageRun = createDirectedImageRun(contextDecision.input, direction);
                setPendingClarification(null);
                const count = imageRun.requestedOutputCount;
                const isEditTurn =
                  direction.specialist === "image_editor" || refsForTurn.length > 0;
                const plannedAspects = imageRun.tasks
                  .map((task) => task.requestedDimensions?.aspectRatio)
                  .filter((ratio): ratio is string => Boolean(ratio));
                const thoughtText = formatThoughtText(
                  rawPrompt,
                  direction.summary,
                  count,
                  isEditTurn,
                  plannedAspects.length > 1
                    ? undefined
                    : imageRun.tasks[0]?.requestedDimensions,
                  plannedAspects,
                );
                const modelName = formatCreatingModelLabel(direction.modelAlias);
                resolvedModelLabel = modelName;
                const specialistTitle =
                  direction.specialist === "image_editor" ? "Image Editor" : "Image Specialist";

                const imageTaskAction: SubAgentActionLog = {
                  id: imageRun.id,
                  taskId: imageRun.id,
                  agent: direction.specialist === "image_editor" ? "image_edit" : "image_gen",
                  title: `${specialistTitle} (${modelName})${count > 1 ? ` · ${count} ภาพ` : ""}`,
                  description: `กำลังเรนเดอร์ภาพกราฟิกความละเอียดสูงตามสเปกของ Creative Director (${count} ภาพ)...`,
                  status: "running",
                  timestamp: Date.now(),
                  stage: "planned",
                };
                activeRunningAction = imageTaskAction;
                actions = [...actions, imageTaskAction];
                upsertCurrentAction({ ...imageTaskAction });

                setLiveAssistantState({
                  stage: "generating",
                  thought: thoughtText,
                  toolLabel: modelName,
                  requestedCount: count,
                  statusMessage: `กำลังสร้างรูปภาพด้วย ${modelName}...`,
                  prompt: rawPrompt,
                  isEdit: isEditTurn,
                  actions: [...actions],
                });

                const isMultiOutput = imageRun.requestedOutputCount > 1;
                const runResult = await runContextAwareImageRun(imageRun, refsForTurn, {
                  signal: controller.signal,
                  cloudConsent: true,
                  stageOnly: isMultiOutput,
                  reviewOutput: ({ prompt, reviewCriteria, outputAnalysis, signal }) =>
                    reviewRemoteCreativeOutput(
                      { prompt, reviewCriteria, outputAnalysis },
                      { signal, cloudConsent: true },
                    ),
                  onUpdate: (update) => {
                    imageTaskAction.description = `${update.message} · สำเร็จ ${update.completedCount}/${update.requestedOutputCount}`;
                    imageTaskAction.stage = update.stage;
                    imageTaskAction.status =
                      update.stage === "failed" ||
                      update.stage === "cancelled" ||
                      update.stage === "outcome-unknown"
                        ? "error"
                        : update.stage === "succeeded"
                          ? "success"
                          : "running";
                    upsertCurrentAction({ ...imageTaskAction });
                    setLiveAssistantState((prev) =>
                      prev
                        ? {
                            ...prev,
                            statusMessage: update.message,
                            actions: [...actions],
                          }
                        : null,
                    );
                  },
                });

                if (runResult.status === "cancelled") {
                  imageTaskAction.status = "error";
                  imageTaskAction.stage = "cancelled";
                  imageTaskAction.description =
                    "ยกเลิกงานสร้างภาพตามคำขอแล้ว ไม่มีการเปลี่ยนแปลงบน Canvas";
                  upsertCurrentAction({ ...imageTaskAction });
                  reply = "ยกเลิกงานสร้างภาพตามคำขอแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas";
                  suggestions = ["ระบุ brief ใหม่", "ตรวจสอบภาพที่เลือก"];
                  setLiveAssistantState(null);
                } else if (runResult.status === "partial" && runResult.completedCount === 0) {
                  const firstError =
                    runResult.items.find((i) => i.error)?.error || "การสร้างภาพไม่สำเร็จ";
                  const diagnosis = diagnoseOrchestratorError(firstError, promptToSend, {
                    conversationHistory: messages
                      .flatMap((m) =>
                        (m.role === "user" || m.role === "assistant") && m.kind !== "progress"
                          ? [{ role: m.role, content: m.content }]
                          : [],
                      )
                      .slice(-10),
                  });
                  if (diagnosis.alternativePrompt) {
                    lastAlternativePromptRef.current = diagnosis.alternativePrompt;
                  }
                  imageTaskAction.status = "error";
                  imageTaskAction.stage = "failed";
                  imageTaskAction.description = `Task ไม่สำเร็จ: ${diagnosis.shortReason}`;
                  upsertCurrentAction({ ...imageTaskAction });
                  reply = diagnosis.reply;
                  suggestions = diagnosis.suggestions;
                  setLiveAssistantState(null);

                  setMessages((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: reply,
                      toolLabel: modelName,
                      errorCard: diagnosis.errorCard,
                      timestamp: Date.now(),
                      actions,
                      suggestions,
                    },
                  ]);
                  setBusy(false);
                  return;
                } else {
                  imageTaskAction.status = "success";
                  imageTaskAction.stage = "succeeded";
                  const summaryMsg =
                    imageRun.requestedOutputCount > 1
                      ? `สำเร็จ ${runResult.completedCount}/${imageRun.requestedOutputCount} ภาพ`
                      : "สำเร็จ";
                  imageTaskAction.description = `สร้างและเรนเดอร์ภาพกราฟิกสำเร็จ (${summaryMsg})`;
                  upsertCurrentAction({ ...imageTaskAction });

                  const reviewerAction: SubAgentActionLog = {
                    id: crypto.randomUUID(),
                    agent: "brand_stylist",
                    title: "Quality Reviewer (ตรวจเช็คคุณภาพ)",
                    description: "ตรวจเช็คความสมบูรณ์ แสงเงา ความคมชัด และมาตรฐานความตรงตามบรีฟ",
                    status: "success",
                    timestamp: Date.now(),
                    stage: "succeeded",
                  };
                  actions = [...actions, reviewerAction];
                  upsertCurrentAction({ ...reviewerAction });

                  const generatedImages = runResult.items
                    .filter((i) => i.status === "succeeded" && Boolean(i.result?.dataUrl))
                    .map((i) => {
                      const task = imageRun.tasks[i.outputIndex - 1];
                      const brief = direction.outputBriefs?.[i.outputIndex - 1];
                      const ratio = task?.requestedDimensions?.aspectRatio;
                      return {
                        url: i.result?.dataUrl || "",
                        fileId: i.result?.fileId || `img-${i.outputIndex}`,
                        label:
                          (brief && brief.trim()) ||
                          (ratio ? `ขนาด ${ratio}` : `รูปที่ ${i.outputIndex}`),
                        width: i.result?.width,
                        height: i.result?.height,
                        prompt: direction.refinedPrompt,
                      };
                    });

                  const subject = extractSubject(promptToSend, direction.summary);
                  const isEditTurn =
                    direction.specialist === "image_editor" || refsForTurn.length > 0;
                  const firstSucceeded = runResult.items.find(
                    (i) => i.status === "succeeded" && i.result?.width,
                  );
                  const firstSucceededTask = firstSucceeded
                    ? imageRun.tasks[firstSucceeded.outputIndex - 1]
                    : undefined;
                  const dims =
                    firstSucceededTask?.requestedDimensions ??
                    imageRun.tasks.find((task) => task.requestedDimensions)?.requestedDimensions;
                  const succeededAspects = runResult.items
                    .filter((i) => i.status === "succeeded")
                    .map(
                      (i) =>
                        imageRun.tasks[i.outputIndex - 1]?.requestedDimensions?.aspectRatio ||
                        formatFriendlyAspectRatio(i.result?.width, i.result?.height),
                    )
                    .filter((ratio): ratio is string => Boolean(ratio));
                  const failedAspects = runResult.items
                    .filter(
                      (i) => i.status === "failed" || i.status === "outcome-unknown",
                    )
                    .map(
                      (i) =>
                        imageRun.tasks[i.outputIndex - 1]?.requestedDimensions?.aspectRatio ||
                        `รูปที่ ${i.outputIndex}`,
                    );
                  const replyOptions = {
                    printSizeSource: `${promptToSend}\n${direction.summary ?? ""}\n${direction.refinedPrompt ?? ""}`,
                    outputWidthPx: firstSucceeded?.result?.width ?? dims?.width,
                    summary: direction.summary,
                    refinedPrompt: direction.refinedPrompt,
                    userPrompt: promptToSend,
                    width: firstSucceeded?.result?.width ?? dims?.width,
                    height: firstSucceeded?.result?.height ?? dims?.height,
                    aspectRatio:
                      firstSucceededTask?.requestedDimensions?.aspectRatio ?? dims?.aspectRatio,
                    succeededAspects,
                    failedAspects,
                    modelLabel: modelName,
                    quality: selectedQuality,
                  };
                  const resultSummary = buildImageCompletionSummary(
                    subject,
                    runResult.completedCount,
                    succeededAspects.length > 1
                      ? succeededAspects.map((ratio) => `ขนาด ${ratio}`)
                      : direction.outputBriefs,
                    isEditTurn,
                    replyOptions,
                  );
                  reply = formatImageCompletionReply(
                    subject,
                    runResult.completedCount,
                    succeededAspects.length > 1
                      ? succeededAspects.map((ratio) => `ขนาด ${ratio}`)
                      : direction.outputBriefs,
                    isEditTurn,
                    replyOptions,
                  );

                  const partialFailureCount =
                    imageRun.requestedOutputCount > 1
                      ? imageRun.requestedOutputCount - runResult.completedCount
                      : 0;
                  let completionSuggestions = [
                    "ปรับรายละเอียดต่อ",
                    "ตรวจสอบ Layout",
                    "↶ Undo ผลลัพธ์ล่าสุด",
                  ];
                  if (partialFailureCount > 0) {
                    const failedDetails = runResult.items
                      .filter(
                        (i) => i.status === "failed" || i.status === "outcome-unknown",
                      )
                      .map((i) => {
                        const ratio =
                          imageRun.tasks[i.outputIndex - 1]?.requestedDimensions
                            ?.aspectRatio || `รูปที่ ${i.outputIndex}`;
                        const err = i.error || "";
                        const isPolicy =
                          /sensitive|policy|flagged|safety|nsfw|content filter/i.test(err);
                        return isPolicy
                          ? `${ratio} (โดน content policy)`
                          : `${ratio} (provider error)`;
                      });
                    reply += `\n\n⚠️ สร้างไม่ครบ ${runResult.completedCount}/${imageRun.requestedOutputCount} — ขาด: ${failedDetails.join(", ")} กดสร้างภาพที่เหลือใหม่ได้ครับ`;
                    completionSuggestions = ["🔄 สร้างภาพที่เหลือใหม่", ...completionSuggestions];
                  }

                  if (isMultiOutput) {
                    const newStaged: StagedVariationCard[] = runResult.items
                      .filter((i) => i.status === "succeeded" && Boolean(i.result?.dataUrl))
                      .map((i) => {
                        const task = imageRun.tasks[i.outputIndex - 1];
                        const brief = direction.outputBriefs?.[i.outputIndex - 1];
                        const ratio = task?.requestedDimensions?.aspectRatio;
                        return {
                          id: `var-${Date.now()}-${i.outputIndex}`,
                          fileId: i.result?.fileId || `img-${i.outputIndex}`,
                          url: i.result?.dataUrl || "",
                          width: i.result?.width || 1024,
                          height: i.result?.height || 1024,
                          label:
                            (brief && brief.trim()) ||
                            (ratio ? `ขนาด ${ratio}` : `ตัวเลือกที่ ${i.outputIndex}`),
                          status: "staged" as const,
                          targetSlideId: slide?.id,
                        };
                      });
                    setStagedVariations(newStaged);
                    reply +=
                      "\n\n💡 เลื่อนเมาส์เหนือตัวเลือกใน Staging Tray ด้านล่างเพื่อดู Ghost Preview บน Canvas หรือกด Apply ภาพที่ต้องการลงชิ้นงานได้เลยครับ";
                  }

                  const locksFromHelper = pendingRefinementLocksRef.current;
                  pendingRefinementLocksRef.current = null;
                  const continuedAnchors =
                    locksFromHelper?.sharedAnchors ??
                    priorGeneration?.sharedAnchors ??
                    inferSharedAnchors(
                      isFollowUpTurn
                        ? priorGeneration?.userPrompt || promptToSend
                        : promptToSend,
                    );
                  const continuedVariants =
                    locksFromHelper?.variantSelections ?? priorGeneration?.variantSelections;

                  setMessages((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: reply,
                      thought: thoughtText,
                      toolLabel: modelName,
                      images: generatedImages,
                      imageRefs: refsForTurn.length > 0 ? refsForTurn : undefined,
                      resultSummary,
                      qualityLabel: selectedQuality,
                      generationContext: {
                        userPrompt: isFollowUpTurn
                          ? priorGeneration?.userPrompt || promptToSend
                          : promptToSend,
                        refinedPrompt: direction.refinedPrompt,
                        summary: direction.summary,
                        width:
                          firstSucceeded?.result?.width ??
                          firstSucceededTask?.requestedDimensions?.width ??
                          1024,
                        height:
                          firstSucceeded?.result?.height ??
                          firstSucceededTask?.requestedDimensions?.height ??
                          1024,
                        aspectRatio:
                          firstSucceededTask?.requestedDimensions?.aspectRatio ?? "1:1",
                        refinementMode:
                          locksFromHelper?.refinementMode ??
                          priorGeneration?.refinementMode ??
                          (continuedVariants?.length ? "brand-variant" : "generic"),
                        sharedAnchors: continuedAnchors,
                        ...(continuedVariants?.length
                          ? { variantSelections: continuedVariants }
                          : {}),
                      } satisfies PriorImageGenerationContext,
                      timestamp: Date.now(),
                      actions,
                      suggestions: completionSuggestions,
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
              activeRunningAction.status = "error";
              activeRunningAction.stage = outcomeUnknown
                ? "outcome-unknown"
                : wasCancelled
                  ? "cancelled"
                  : "failed";
              if (outcomeUnknown) {
                activeRunningAction.description = "ผลลัพธ์ provider ยังยืนยันไม่ได้ จึงไม่สร้างงานซ้ำอัตโนมัติ";
                reply =
                  "ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้ครับ ผมจะไม่สร้างงานซ้ำอัตโนมัติจนกว่าจะตรวจสอบงานเดิมได้";
                suggestions = ["ตรวจสอบสถานะ provider ก่อนลองใหม่", "ลองใหม่หลังยืนยันว่าไม่มีงานเดิมค้างอยู่"];
              } else if (wasCancelled) {
                activeRunningAction.description = "ยกเลิก Task แล้ว ไม่มีการเปลี่ยนแปลงบน Canvas";
                reply = "ยกเลิกงานที่กำลังประมวลผลแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas";
                suggestions = ["ส่ง brief เดิมอีกครั้ง", "ตรวจสอบภาพที่เลือก"];
              } else {
                const diagnosis = diagnoseOrchestratorError(
                  (error as Error).message,
                  promptToSend,
                  {
                    conversationHistory: messages
                      .flatMap((m) =>
                        (m.role === "user" || m.role === "assistant") && m.kind !== "progress"
                          ? [{ role: m.role, content: m.content }]
                          : [],
                      )
                      .slice(-10),
                  },
                );
                if (diagnosis.alternativePrompt) {
                  lastAlternativePromptRef.current = diagnosis.alternativePrompt;
                }
                activeRunningAction.description = `Task ไม่สำเร็จ: ${diagnosis.shortReason}`;
                reply = diagnosis.reply;
                suggestions = diagnosis.suggestions;

                setMessages((previous) => [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: reply,
                    toolLabel: diagnosis.errorCard ? resolvedModelLabel : undefined,
                    errorCard: diagnosis.errorCard,
                    timestamp: Date.now(),
                    actions,
                    suggestions,
                  },
                ]);
                setLiveAssistantState(null);
                setBusy(false);
                return;
              }
            }
          }
          upsertCurrentAction({ ...activeRunningAction });
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
      let remoteGeneratedImages:
        | Array<{
            url: string;
            fileId: string;
            label: string;
            width?: number;
            height?: number;
            prompt?: string;
          }>
        | undefined;
      let remoteModelAlias: string | undefined;
      let remoteResultSummary: ReturnType<typeof buildImageCompletionSummary> | undefined;

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
            if (
              trimmed.startsWith("{") &&
              (trimmed.includes('"kind"') || trimmed.includes('"calls"'))
            ) {
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
                preferredQuality: selectedQuality !== "auto" ? selectedQuality : undefined,
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
            const remoteReplyOptions = {
              printSizeSource: `${promptToSend}\n${result.summary ?? ""}\n${result.refinedPrompt ?? ""}`,
              outputWidthPx: generated.width,
              summary: result.summary,
              refinedPrompt: result.refinedPrompt,
              userPrompt: promptToSend,
              width: generated.width,
              height: generated.height,
              aspectRatio: directedTask.requestedDimensions?.aspectRatio,
              modelLabel: formatCreatingModelLabel(result.modelAlias),
              quality: selectedQuality,
            };
            remoteResultSummary = buildImageCompletionSummary(
              subject,
              1,
              briefs,
              false,
              remoteReplyOptions,
            );
            reply = formatImageCompletionReply(subject, 1, briefs, false, remoteReplyOptions);
            remoteModelAlias = result.modelAlias;
            remoteGeneratedImages = [
              {
                url: generated.dataUrl || "",
                fileId: generated.fileId,
                label: briefs[0] || result.summary,
                width: generated.width,
                height: generated.height,
                prompt: result.refinedPrompt,
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
        toolLabel: remoteGeneratedImages
          ? formatCreatingModelLabel(remoteModelAlias)
          : undefined,
        images: remoteGeneratedImages,
        resultSummary: remoteResultSummary,
        qualityLabel: remoteGeneratedImages ? selectedQuality : undefined,
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

  const hasSelection = selectedIds.size > 0;

  return (
    <div
      style={{
        position: "relative", width: "100%", height: "100%", minHeight: 0,
        display: "flex", flexDirection: "column", pointerEvents: "auto", overflow: "hidden",
        background: "#ffffff", color: "#0f172a",
        fontFamily: 'Sarabun, "Noto Sans Thai", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        @keyframes artshiftPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .artshift-custom-scroll::-webkit-scrollbar { width: 5px; }
        .artshift-custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .artshift-custom-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .artshift-custom-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>

      {/* 1. Thread Header and Messages Area */}
      <ChatThread
        messages={messages}
        busy={busy}
        liveAssistantState={liveAssistantState}
        streamingText={streamingText}
        currentActions={currentActions}
        feedbackState={feedbackState}
        scrollRef={scrollRef}
        onSelectCanvasImage={handleSelectCanvasImage}
        onSelectSuggestion={(sug, errorCard) => {
          const isEditAction = sug.startsWith("✏️") || /(?:ปรับแต่ง|ปรับปรุง|แก้ไขคำขอ|Edit prompt|แก้ brief)/i.test(sug);
          const fallbackUserPrompt = errorCard?.promptToEdit || messages.slice().reverse().find((m) => m.role === "user")?.content || editorRef.current?.getValue() || input;
          if (isEditAction) {
            if (fallbackUserPrompt) {
              setInput(fallbackUserPrompt);
              editorRef.current?.setValue(fallbackUserPrompt);
              editorRef.current?.focus();
              setPromptRefinementData(createPromptRefinement(fallbackUserPrompt));
            }
            return;
          }
          const isRetryAction = sug.startsWith("🔄") || /(?:ลองสร้างใหม่อีกครั้ง|ลองใหม่อีกครั้ง|สร้างภาพที่เหลือใหม่)/i.test(sug);
          if (isRetryAction) {
            if (fallbackUserPrompt) { handleSend(fallbackUserPrompt); return; }
          }
          if (sug.includes("ตรวจสอบภาพที่เลือกบน Canvas") || sug.includes("ตรวจสอบภาพที่เลือก")) {
            handleSelectCanvasImage();
            return;
          }
          if (sug.includes("ตรวจสอบการตั้งค่า API Token") || sug.startsWith("⚙️")) return;
          handleSend(sug);
        }}
        onToggleFeedback={handleToggleFeedback}
        onClearHistory={handleClearHistory}
        onEditPromptFromError={(prompt) => {
          setInput(prompt);
          editorRef.current?.setValue(prompt);
          editorRef.current?.focus();
          const refinement = createPromptRefinement(prompt);
          setPromptRefinementData(refinement);
        }}
      >
        <ChatActionCards
          promptRefinementData={promptRefinementData}
          onGenerateFromRefinement={(refined) => {
            setPromptRefinementData(null);
            handleSend(refined);
          }}
          onApplyRefinementToComposer={(refined) => {
            setInput(refined);
            editorRef.current?.setValue(refined);
            editorRef.current?.focus();
          }}
          onDismissRefinement={() => {
            pendingRefinementLocksRef.current = null;
            setPromptRefinementData(null);
          }}
          onRefinementLocksChange={(locks) => {
            pendingRefinementLocksRef.current = locks;
          }}
          pendingPlan={pendingPlan}
          busy={busy}
          onApplyPendingPlan={applyPendingPlan}
          onDiscardPendingPlan={() => setPendingPlan(null)}
          pendingSequentialPlan={pendingSequentialPlan}
          isExecutingPlan={isExecutingPlan}
          onExecuteSequentialPlan={executeSequentialPlan}
          onDiscardSequentialPlan={() => setPendingSequentialPlan(null)}
          stagedVariations={stagedVariations}
          onVariationHover={handleVariationHover}
          onVariationLeave={handleVariationLeave}
          onCommitVariation={commitVariationToCanvas}
          onDismissVariation={dismissVariation}
          onClearVariationsTray={() => {
            useEngine.getState().clearGhostOverlay();
            setStagedVariations([]);
          }}
        />
      </ChatThread>

      {/* 2. Composer */}
      <ChatComposer
        input={input}
        setInput={setInput}
        busy={busy}
        hasSelection={hasSelection}
        omittedCount={composerImageSelection.omittedCount}
        composerImageRefs={composerImageRefs}
        allSlideImageRefs={allSlideImageRefs}
        setEditorRef={setEditorRef}
        onSend={(text) => handleSend(text)}
        onStop={() => abortRef.current?.abort()}
        onBackspaceAtStart={removeLastAttachedImage}
        onInlineTagsChange={handleInlineTagsChange}
        onClear={() => {
          clearAttachedImages();
          setInput("");
        }}
        onTogglePromptHelper={handleTogglePromptHelper}
        isPromptHelperOpen={Boolean(promptRefinementData)}
        selectedQuality={selectedQuality}
        onSelectQuality={setSelectedQuality}
      />
    </div>
  );
}

function findClarificationOption(
  pending: PendingClarification,
  value: string,
): PendingClarification["options"][number] | undefined {
  return pending.options.find((option) => option.label === value);
}
