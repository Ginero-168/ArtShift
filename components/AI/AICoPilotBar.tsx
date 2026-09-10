"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CoPilotMessage,
  diagnoseOrchestratorError,
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
  buildComposerImageSelectionFromIds,
  snapshotComposerImageRefs,
} from "@/lib/ai/orchestration/imageReferences";
import { deriveGeneratedImageName } from "@/lib/ai/orchestration/imageNaming";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import { extractInlineTagObjectIds } from "@/lib/ai/orchestration/inlineTagSynthesis";
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
import {
  isBroadImagePrompt,
  createPromptRefinement,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";
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

import { useCanvasSelectionBridge } from "@/components/AI/useCanvasSelectionBridge";
import ChatThread from "@/components/AI/ChatThread";
import ChatComposer from "@/components/AI/ChatComposer";
import ChatActionCards, { type StagedVariationCard } from "@/components/AI/ChatActionCards";

export type { StagedVariationCard };

function cleanTechnicalPromptText(text: string): string {
  let s = text.trim();
  s = s.replace(/^Edit\s+(?:ภาพ|รูป)?\s*(@\[[^\]]+\]|@[^\s]+|[^\s]+)?\s*ด้วย\s*Prompt\s*:\s*/iu, "");
  s = s.replace(/^Edit\s+image\s+.*?with\s+prompt\s*:\s*/iu, "");
  s = s.replace(/^propose_creative_direction\s*:\s*/iu, "");
  s = s.replace(/^propose_design_plan\s*:\s*/iu, "");
  s = s.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "@$1");
  return s.trim();
}

function extractSubject(prompt: string, summary?: string): string {
  let effectivePrompt = prompt;
  if (effectivePrompt.includes("User reply:")) {
    effectivePrompt = effectivePrompt.slice(effectivePrompt.lastIndexOf("User reply:") + 11).trim();
  } else if (effectivePrompt.includes("\n\n")) {
    const segments = effectivePrompt
      .split("\n\n")
      .map((s) => s.trim())
      .filter(Boolean);
    effectivePrompt = segments[segments.length - 1] || effectivePrompt;
  }

  // Strip all tag syntax @[...] and @tags from effectivePrompt
  effectivePrompt = effectivePrompt.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "").replace(/@[^\s]+/g, "").trim();

  if (summary && summary.trim().length > 0 && !summary.includes("Director question:")) {
    let cleanFromSummary = cleanTechnicalPromptText(summary);
    if (cleanFromSummary.includes("User reply:")) {
      cleanFromSummary = cleanFromSummary
        .slice(cleanFromSummary.lastIndexOf("User reply:") + 11)
        .trim();
    }
    cleanFromSummary = cleanFromSummary.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "").replace(/@[^\s]+/g, "").trim();
    cleanFromSummary = cleanFromSummary
      .replace(/^(?:ช่วย|กรุณา)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?\s*/iu, "")
      .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
      .replace(/^(?:รูปภาพ|ภาพ|รูป)\s*/iu, "")
      .replace(/\s*(?:ตามที่ขอ|เรียบร้อยแล้ว|สมจริง|สวยๆ|สไตล์.*|ในฉาก.*)\s*$/iu, "")
      .trim();
    if (
      cleanFromSummary.length > 0 &&
      cleanFromSummary.length < 60 &&
      !cleanFromSummary.includes("\n")
    ) {
      return cleanFromSummary;
    }
  }

  let cleaned = effectivePrompt
    .replace(
      /^(?:ช่วย|กรุณา|อยากได้|อยากให้|ขอ)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?/iu,
      "",
    )
    .trim();
  cleaned = cleaned.replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "").trim();
  cleaned = cleaned
    .replace(/\s*(?:ให้หน่อย|คิดให้หน่อย|สวยๆ|เจ๋งๆ|น่ารัก|สมจริง|ด้วยนะ|ด้วยครับ|ด้วยค่ะ|ด้วย)\s*$/iu, "")
    .trim();
  if (cleaned.includes("\n")) {
    cleaned = cleaned.split("\n")[0].trim();
  }
  return cleaned || "ภาพ";
}

function formatThoughtText(
  rawPrompt: string,
  directionSummary?: string,
  count = 1,
  isEdit = false,
): string {
  const cleanPrompt = cleanTechnicalPromptText(rawPrompt);
  const cleanSummary = directionSummary ? cleanTechnicalPromptText(directionSummary) : "";

  if (isEdit) {
    if (cleanSummary && cleanSummary.length > 5 && !cleanSummary.startsWith("สร้างภาพ")) {
      const actionText = cleanSummary.startsWith("ปรับ") || cleanSummary.startsWith("แก้ไข")
        ? cleanSummary
        : `ปรับแต่ง: ${cleanSummary}`;
      return `กำลังวิเคราะห์ภาพต้นฉบับ และวางแผน${actionText} โดยรักษาความกลมกลืนของแสง เงา และบรรยากาศโดยรวมให้เป็นธรรมชาติ`;
    }
    const editInstruction = cleanPrompt.replace(/@[^\s]+\s*/g, "").trim() || "ตามคำขอ";
    return `กำลังวิเคราะห์ภาพต้นฉบับ และวางแผนปรับแต่งภาพโดย ${editInstruction} พร้อมคุมโทนสีและแสงเงาเดิมให้ลงตัว`;
  }

  const isConceptPrompt =
    rawPrompt.includes("คิดให้หน่อย") ||
    rawPrompt.includes("concept") ||
    rawPrompt.includes("คอนเซปต์") ||
    rawPrompt.includes("เจ๋งๆ") ||
    rawPrompt.includes("ไอเดีย");

  if (isConceptPrompt && cleanSummary) {
    return `คิดคอนเซปต์เป็น "${cleanSummary}" โดยวางแผนจัดองค์ประกอบ แสงเงา มุมกล้อง และรายละเอียดให้สวยงามสมจริง`;
  }

  if (cleanSummary && cleanSummary.length > 5 && !cleanSummary.startsWith("สร้างภาพ")) {
    return `วางแผนออกแบบ: "${cleanSummary}" (${count} ภาพ) โดยกำหนดสไตล์ โทนสี แสงเงา และความคมชัดระดับสูง`;
  }

  const subject = extractSubject(rawPrompt, cleanSummary);
  return `กำลังวางแผนสร้างรูปภาพ "${subject}" (${count} ภาพ) โดยจัดองค์ประกอบ แสงเงา และรายละเอียดระดับสูงให้สมบูรณ์แบบค่ะ`;
}

function formatImageCompletionReply(
  subject: string,
  count: number,
  outputBriefs?: readonly string[],
  isEdit = false,
): string {
  let cleanSubject = subject
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();

  const firstBrief = outputBriefs?.[0]
    ?.replace(/^รูปที่\s*\d+:\s*/iu, "")
    ?.replace(/^(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*/iu, "")
    ?.trim();

  let headerLine = "";
  if (isEdit) {
    const editName = firstBrief || (cleanSubject && !cleanSubject.startsWith("ปรับ") ? cleanSubject : "");
    headerLine = editName
      ? `ปรับแต่งภาพ "${editName}" เสร็จแล้ว ${count} รูปค่ะ`
      : `ปรับแต่งภาพเรียบร้อยแล้วค่ะ (${count} รูป)`;
  } else {
    const genName = firstBrief || cleanSubject || "ภาพ";
    headerLine = `สร้างรูป${genName}เสร็จแล้ว ${count} รูปค่ะ`;
  }

  const lines: string[] = [headerLine, ""];
  if (outputBriefs && outputBriefs.length > 0) {
    outputBriefs.slice(0, count).forEach((brief, idx) => {
      const cleanBrief = brief
        .replace(/^รูปที่\s*\d+:\s*/iu, "")
        .replace(/^(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*/iu, "")
        .trim();
      lines.push(`• รูปที่ ${idx + 1}: ${cleanBrief || `${cleanSubject || "ภาพ"} แบบที่ ${idx + 1}`}`);
    });
  } else {
    for (let i = 1; i <= count; i++) {
      lines.push(`• รูปที่ ${i}: ${cleanSubject || "ภาพ"} แบบที่ ${i}`);
    }
  }
  lines.push("");
  lines.push("ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ");
  return lines.join("\n");
}



export default function AICoPilotBar() {
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
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null);
  const [liveAssistantState, setLiveAssistantState] = useState<{
    stage: "outputting" | "generating";
    thought?: string;
    toolLabel?: string;
    requestedCount?: number;
  } | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});
  const [promptRefinementData, setPromptRefinementData] =
    useState<PromptRefinementCardData | null>(null);

  const elementCount = (slide?.elements ?? []).filter((e) => !e.isDeleted).length;

  const handleToggleFeedback = (messageId: string, type: "up" | "down") => {
    setFeedbackState((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === type ? undefined! : type,
    }));
  };

  const handleClearHistory = () => {
    setMessages([]);
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAlternativePromptRef = useRef<string | null>(null);

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
    const elementName = deriveGeneratedImageName(card.label);
    const element = createImage({
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

  const handleSend = async (customPrompt?: string, skipRefinementCheck = false) => {
    const rawPrompt = (customPrompt ?? editorRef.current?.getValue() ?? input).trim();
    if (!rawPrompt || busy) return;

    if (!skipRefinementCheck && isBroadImagePrompt(rawPrompt)) {
      const refinement = createPromptRefinement(rawPrompt);
      setPromptRefinementData(refinement);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: rawPrompt,
          timestamp: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `กำลังวิเคราะห์ความต้องการสร้าง ${refinement.baseSubject} ให้คุณครับ! คุณสามารถเลือกปรับแต่งคุณลักษณะต่างๆ (เช่น สี, สายพันธุ์, พื้นหลัง, มุมกล้อง) ผ่านการ์ดด้านล่าง เพื่อให้ได้ภาพที่ตรงตามจินตนาการมากที่สุดครับ ✨`,
          timestamp: Date.now(),
        },
      ]);
      setInput("");
      editorRef.current?.clear();
      return;
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

    const inlineObjectIds = extractInlineTagObjectIds(rawPrompt);
    const combinedObjectIds = Array.from(new Set([...inlineObjectIds, ...attachedImageIds]));
    const effectiveSelection = buildComposerImageSelectionFromIds(
      slide?.elements ?? [],
      combinedObjectIds.length > 0 ? combinedObjectIds : attachedImageIds,
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
                const isEditTurn = direction.specialist === "image_editor" || refsForTurn.length > 0;
                const thoughtText = formatThoughtText(rawPrompt, direction.summary, count, isEditTurn);
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
                  taskAction.status = "error";
                  taskAction.stage = "failed";
                  taskAction.description = `Task ไม่สำเร็จ: ${diagnosis.shortReason}`;
                  reply = diagnosis.reply;
                  suggestions = diagnosis.suggestions;
                  setLiveAssistantState(null);

                  setMessages((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content: reply,
                      toolLabel: "GPT Image 2",
                      errorCard: diagnosis.errorCard,
                      timestamp: Date.now(),
                      actions,
                      suggestions,
                    },
                  ]);
                  setBusy(false);
                  return;
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
                  const isEditTurn = direction.specialist === "image_editor" || refsForTurn.length > 0;
                  reply = formatImageCompletionReply(
                    subject,
                    runResult.completedCount,
                    direction.outputBriefs,
                    isEditTurn,
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
              if (outcomeUnknown) {
                taskAction.description = "ผลลัพธ์ provider ยังยืนยันไม่ได้ จึงไม่สร้างงานซ้ำอัตโนมัติ";
                reply = "ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้ครับ ผมจะไม่สร้างงานซ้ำอัตโนมัติจนกว่าจะตรวจสอบงานเดิมได้";
                suggestions = ["ตรวจสอบสถานะ provider ก่อนลองใหม่", "ลองใหม่หลังยืนยันว่าไม่มีงานเดิมค้างอยู่"];
              } else if (wasCancelled) {
                taskAction.description = "ยกเลิก Task แล้ว ไม่มีการเปลี่ยนแปลงบน Canvas";
                reply = "ยกเลิกงานที่กำลังประมวลผลแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas";
                suggestions = ["ส่ง brief เดิมอีกครั้ง", "ตรวจสอบภาพที่เลือก"];
              } else {
                const diagnosis = diagnoseOrchestratorError((error as Error).message, promptToSend, {
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
                taskAction.description = `Task ไม่สำเร็จ: ${diagnosis.shortReason}`;
                reply = diagnosis.reply;
                suggestions = diagnosis.suggestions;

                setMessages((previous) => [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: reply,
                    toolLabel: diagnosis.errorCard ? "GPT Image 2" : undefined,
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


  const hasSelection = selectedIds.size > 0;

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
          if (sug.startsWith("✏️") && errorCard?.promptToEdit) {
            setInput(errorCard.promptToEdit);
            editorRef.current?.setValue(errorCard.promptToEdit);
            editorRef.current?.focus();
          } else {
            handleSend(sug);
          }
        }}
        onToggleFeedback={handleToggleFeedback}
        onClearHistory={handleClearHistory}
        onEditPromptFromError={(prompt) => {
          setInput(prompt);
          editorRef.current?.setValue(prompt);
          editorRef.current?.focus();
        }}
      >
        <ChatActionCards
          promptRefinementData={promptRefinementData}
          onGenerateFromRefinement={(refined) => {
            setPromptRefinementData(null);
            handleSend(refined, true);
          }}
          onApplyRefinementToComposer={(refined) => {
            setInput(refined);
            editorRef.current?.setValue(refined);
            editorRef.current?.focus();
          }}
          onDismissRefinement={() => setPromptRefinementData(null)}
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
