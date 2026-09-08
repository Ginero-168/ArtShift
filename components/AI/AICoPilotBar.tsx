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
};

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
        "สวัสดีครับ! ผมคือ AI Assistance ของคุณ จะอ่านบริบทและช่วยวางแผนก่อนสร้างภาพ เพื่อให้ได้ผลลัพธ์ที่ตรงความต้องการมากขึ้นครับ ✨",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return subscribeAIProgress((event) => {
      const isResult = event.presentation === "result";
      const progressLabel = typeof event.progress === "number" ? ` (${event.progress}%)` : "";
      setMessages((previous) => {
        const messageId = `progress-${event.taskId}-${event.stage}`;
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
    useEngine.getState().clearGhostOverlay();
    const state = useEngine.getState();
    const currentSlide = state.currentSlide();
    if (!currentSlide) return;
    const bounds = calculateGhostBounds(
      currentSlide.width,
      currentSlide.height,
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
            content: `รันแผนงานแบบต่อเนื่อง ${finishedPlan.steps.length} ขั้นตอนเสร็จสมบูรณ์เรียบร้อยครับ! ✨`,
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
      const isImageContextRequest =
        /(?:ภาพ|รูป|image|photo|สร้าง|วาด|generate|create|พื้นหลัง|background|อธิบาย|describe|แก้ภาพ|edit\s+image)/iu.test(
          promptToSend,
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
        (hasImageContext && isImageContextRequest && !isBuiltInImageAction)
      ) {
        if (hasImageContext && analysesForTurn.length === 0) {
          const analysisAction: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: "orchestrator",
            title: "🔎 Image Analysis",
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
            title: "🧠 Creative Director",
            description: "กำลังส่ง brief ให้ Creative Director วางแผน…",
            status: "running",
            timestamp: Date.now(),
            stage: "analyzing",
            attempt: 0,
          };
          actions = [...actions, taskAction];
          upsertCurrentAction({ ...taskAction });
          const consent =
            typeof window === "undefined" ||
            window.confirm(
              `งานนี้จะส่ง ${refsForTurn.length ? "สรุปภาพที่วิเคราะห์แล้วและ" : ""}คำสั่งไปยัง gpt-oss-120b Creative Director เพื่อวางแผน อาจค้น Reference ผ่าน Unsplash/Pexels เมื่อจำเป็น แล้วเรียก Image Model เพื่อสร้างและตรวจผลลัพธ์ ดำเนินการต่อหรือไม่?`,
            );
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
                reply = direction.text;
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
                taskAction.taskId = imageRun.id;
                const countLabel =
                  imageRun.requestedOutputCount > 1
                    ? ` (${imageRun.requestedOutputCount} ภาพ)`
                    : "";
                taskAction.agent =
                  direction.specialist === "image_editor" ? "image_edit" : "image_gen";
                taskAction.title = `🧠 Creative Director → ${direction.specialist}${countLabel}`;
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
                } else if (runResult.status === "partial" && runResult.completedCount === 0) {
                  const firstError =
                    runResult.items.find((i) => i.error)?.error || "การสร้างภาพไม่สำเร็จ";
                  taskAction.status = "error";
                  taskAction.stage = "failed";
                  taskAction.description = `Task ไม่สำเร็จ: ${firstError}`;
                  reply = `การสร้างภาพไม่สำเร็จครับ: ${firstError}`;
                  suggestions = ["ปรับ brief แล้วลองใหม่", "ตรวจสอบภาพที่เลือก"];
                } else {
                  taskAction.status = "success";
                  taskAction.stage = "succeeded";
                  const summaryMsg =
                    imageRun.requestedOutputCount > 1
                      ? `สำเร็จ ${runResult.completedCount}/${imageRun.requestedOutputCount} ภาพ`
                      : "สำเร็จ";
                  taskAction.description = `Creative Director ตรวจ brief และจัดวางภาพบน Canvas (${summaryMsg})`;
                  const partialNote =
                    runResult.failedCount > 0 ? ` (มี ${runResult.failedCount} ภาพที่ไม่สำเร็จ)` : "";
                  reply = `สร้างภาพตามแผนของ Creative Director และวางบน Canvas เรียบร้อยแล้วครับ (${summaryMsg})${partialNote} ใช้ ${direction.modelAlias} โดยจัดวางไม่ซ้อนทับกัน`;
                  suggestions = [
                    "🪄 ลบพื้นหลังของรูปนี้",
                    "⚡ แปลงรูปนี้เป็น Vector Paths",
                    "📐 จัดวาง Layout ให้สวยงาม",
                  ];

                  // Collect variations into Staging Tray for hover ghost preview
                  const stagedItems: StagedVariationCard[] = runResult.items
                    .filter((i) => i.status === "succeeded")
                    .map((i, idx) => ({
                      id: `var-${Date.now()}-${idx + 1}`,
                      fileId:
                        ((i.result as Record<string, unknown> | undefined)?.fileId as string) ||
                        `var-${idx + 1}`,
                      url: (i.result as Record<string, unknown> | undefined)?.url as
                        | string
                        | undefined,
                      width:
                        ((i.result as Record<string, unknown> | undefined)?.width as number) ||
                        1024,
                      height:
                        ((i.result as Record<string, unknown> | undefined)?.height as number) ||
                        1024,
                      label: `Variation ${i.outputIndex}`,
                      status: "staged" as const,
                    }));
                  if (stagedItems.length > 0) {
                    setStagedVariations((prev) => [...prev, ...stagedItems]);
                  }
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

      if (localPlan) {
        const localAction: SubAgentActionLog = {
          id: crypto.randomUUID(),
          agent: "orchestrator",
          title: "⚙️ Deterministic edit",
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
          suggestions = ["↶ Undo การแก้ไขครั้งนี้", "🎨 เปลี่ยนสี Object", "✦ ให้ AI ช่วยต่อยอด"];
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

        addRemoteAction("🧠 ArtShift Orchestrator", "กำลังเข้าใจคำสั่งและวางแผนจนจบงาน...");
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
        const remoteConsent =
          typeof window !== "undefined" &&
          window.confirm(
            "คำขอนี้จะส่ง prompt และสรุปบริบท Artwork ไปยัง AI provider เพื่อช่วยวางแผน ดำเนินการต่อหรือไม่?",
          );
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
              referenceAnalyses: [],
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
              selectedImages: [],
              analyses: [],
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
            reply = result.text;
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
                refs: [],
                analyses: [],
                canvas: slide ? { slide, selectedIds } : undefined,
              },
              result,
            );
            remoteActions[0] = {
              ...remoteActions[0],
              title: `🧠 ArtShift Orchestrator → ${directedTask.subAgent}`,
              description: `กำลังดำเนินงานด้วย ${result.modelAlias}`,
            };
            upsertCurrentAction(remoteActions[0]);
            const generated = await runContextAwareImageTask(directedTask, [], {
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
            reply = "ArtShift Orchestrator สร้าง ตรวจ และวางผลลัพธ์บน Canvas เรียบร้อยแล้วครับ";
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
      title: "✅ Apply reviewed plan",
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
        suggestions: result.ok ? ["↶ Undo แผนล่าสุด", "📐 ตรวจสอบ Layout"] : ["รีเฟรชบริบทแล้วลองใหม่"],
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
        background: "#f8f9fb",
      }}
    >
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
            padding: "10px 10px 9px",
            borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div
            title={UNIFIED_AI_SYSTEM.description}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ fontSize: 13 }}>🧠</span>
            <strong style={{ fontSize: 11, color: "#1e1b4b" }}>{UNIFIED_AI_SYSTEM.label}</strong>
            <span
              style={{
                fontSize: 9.5,
                padding: "1px 6px",
                borderRadius: 10,
                background: "rgba(99, 102, 241, 0.1)",
                color: "#4f46e5",
                fontWeight: 600,
              }}
            >
              {elementCount} objects · auto
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => setMessages([])}
              style={{
                background: "none",
                border: "none",
                fontSize: 10,
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "12px 10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 4,
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background:
                    msg.kind === "progress"
                      ? "#f0fdf4"
                      : msg.role === "user"
                        ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                        : "#f8fafc",
                  color:
                    msg.kind === "progress"
                      ? "#166534"
                      : msg.role === "user"
                        ? "#ffffff"
                        : "#1e293b",
                  fontSize: msg.kind === "progress" ? 10.5 : 11.5,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  border:
                    msg.role === "user"
                      ? "none"
                      : msg.kind === "progress"
                        ? "1px solid #bbf7d0"
                        : "1px solid rgba(226, 232, 240, 0.8)",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                }}
              >
                {msg.content}
              </div>

              {/* Sub-agent Action logs (if any) */}
              {msg.actions && msg.actions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    marginTop: 2,
                  }}
                >
                  {msg.actions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        minWidth: 0,
                        fontSize: 9.5,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background:
                          act.status === "success"
                            ? "#ecfdf5"
                            : act.status === "error"
                              ? "#fef2f2"
                              : "#eff6ff",
                        color:
                          act.status === "success"
                            ? "#065f46"
                            : act.status === "error"
                              ? "#991b1b"
                              : "#1e40af",
                        border: "1px solid",
                        borderColor:
                          act.status === "success"
                            ? "#a7f3d0"
                            : act.status === "error"
                              ? "#fecaca"
                              : "#bfdbfe",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 4,
                        overflowWrap: "anywhere",
                      }}
                    >
                      <span>
                        {act.status === "success" ? "✓" : act.status === "error" ? "✕" : "⏳"}
                      </span>
                      <strong>{act.title}</strong>
                      {act.taskId && (
                        <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.8 }}>
                          {act.stage ?? "planned"}
                          {typeof act.attempt === "number" ? ` · attempt ${act.attempt}` : ""}
                          {act.quality ? ` · auto/${act.quality}` : ""}
                        </span>
                      )}
                      <span>— {act.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up Suggestions Chips */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  {msg.suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleSend(sug)}
                      style={{
                        fontSize: 9.5,
                        padding: "3px 7px",
                        borderRadius: 12,
                        background: "#ffffff",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        color: "#4f46e5",
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                      }}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {pendingReview ? (
            <div
              role="region"
              aria-label="Pending AI plan review"
              style={{
                alignSelf: "stretch",
                padding: "9px 10px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#78350f",
                fontSize: 10.5,
              }}
            >
              <strong style={{ display: "block", fontSize: 11 }}>Reviewable plan</strong>
              <span style={{ display: "block", marginTop: 3, lineHeight: 1.4 }}>
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
                <div style={{ marginTop: 3, fontWeight: 600 }}>
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
                    padding: "5px 9px",
                    background: busy ? "#d6d3d1" : "#d97706",
                    color: "#ffffff",
                    cursor: busy ? "default" : "pointer",
                    fontSize: 10,
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
                    border: "1px solid #fcd34d",
                    borderRadius: 6,
                    padding: "5px 9px",
                    background: "#ffffff",
                    color: "#92400e",
                    cursor: busy ? "default" : "pointer",
                    fontSize: 10,
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          {/* BUILD-04 / BUILD-03: Sequential Execution Plan proposal */}
          {pendingSequentialPlan && (
            <div
              role="region"
              aria-label="Sequential Execution Plan"
              style={{
                alignSelf: "stretch",
                padding: "10px",
                borderRadius: 8,
                background: "#f5f3ff",
                border: "1px solid #ddd6fe",
                color: "#4c1d95",
                fontSize: 10.5,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <strong style={{ fontSize: 11.5 }}>
                  ⚡ Multi-Specialist Plan ({pendingSequentialPlan.steps.length} steps)
                </strong>
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 10,
                    background: "#ede9fe",
                    color: "#6d28d9",
                    fontWeight: 700,
                  }}
                >
                  {pendingSequentialPlan.overallStatus}
                </span>
              </div>
              <span style={{ display: "block", marginTop: 3, color: "#5b21b6", lineHeight: 1.4 }}>
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
                      border: "1px solid #e9d5ff",
                      fontSize: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "#7c3aed" }}>#{idx + 1}</span>
                      <strong>{step.name}</strong>
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
                        color:
                          step.status === "completed"
                            ? "#059669"
                            : step.status === "running"
                              ? "#2563eb"
                              : step.status === "paused_on_gate"
                                ? "#d97706"
                                : step.status === "failed"
                                  ? "#dc2626"
                                  : "#94a3b8",
                      }}
                    >
                      {step.status === "completed"
                        ? "✓ Done"
                        : step.status === "running"
                          ? "⏳ Running"
                          : step.status === "paused_on_gate"
                            ? "⚠️ Quality Gate"
                            : step.status === "failed"
                              ? "✕ Failed"
                              : "Pending"}
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
                    background: isExecutingPlan ? "#a78bfa" : "#7c3aed",
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
                    background: "#ffffff",
                    color: "#6b21a8",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* BUILD-05: Staging Tray & Hover Ghost Preview */}
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
                <strong style={{ fontSize: 11, color: "#166534" }}>
                  ✨ Staging Tray ({stagedVariations.length} Candidate Variations)
                </strong>
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
                    color: "#64748b",
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
                      border: v.status === "accepted" ? "2px solid #10b981" : "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: 5,
                      background: "#ffffff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
                        background: "#f1f5f9",
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
                        <span style={{ fontSize: 20 }}>🖼️</span>
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
                          background: v.status === "accepted" ? "#10b981" : "#6366f1",
                          color: "#ffffff",
                          fontSize: 9.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {v.status === "accepted" ? "✓ Done" : "Place"}
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
                          background: "#f8fafc",
                          color: "#64748b",
                          fontSize: 9,
                          cursor: "pointer",
                        }}
                      >
                        ✕
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
                background: "#eef2ff",
                color: "#312e81",
                fontSize: 11.5,
                lineHeight: 1.45,
                border: "1px solid #c7d2fe",
              }}
            >
              {streamingText}
            </div>
          )}

          {/* Live running actions indicator */}
          {busy && currentActions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {currentActions.map((act) => (
                <div
                  key={act.id}
                  style={{
                    minWidth: 0,
                    fontSize: 10,
                    padding: "4px 8px",
                    borderRadius: 4,
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
                  <span style={{ animation: "spin 1s linear infinite" }}>⚙️</span>
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
                  border: "1px solid #fecaca",
                  borderRadius: 5,
                  padding: "4px 8px",
                  background: "#fff1f2",
                  color: "#be123c",
                  cursor: "pointer",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                ยกเลิก Task
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
          borderTop: "1px solid #dfe3ea",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 6, width: "100%" }}>
          {/* Input Field */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 104,
              border: "1px solid #d8dde7",
              borderRadius: 9,
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              gap: 5,
              padding: 6,
              boxSizing: "border-box",
            }}
          >
            <ComposerImageTags
              refs={snapshotComposerImageRefs(selectedImageRefs)}
              omittedCount={selectedImageSelection.omittedCount}
              onRemove={(ref) => useEngine.getState().toggleSelect(ref.objectId)}
            />
            <textarea
              ref={inputRef}
              rows={3}
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
                minHeight: 72,
                resize: "vertical",
                border: 0,
                outline: "none",
                fontSize: 11,
                lineHeight: 1.45,
                color: "#0f172a",
                padding: "4px 2px",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Send / cancel action */}
          <button
            type="button"
            disabled={!busy && !input.trim()}
            onClick={() => (busy ? abortRef.current?.abort() : handleSend())}
            style={{
              flex: "0 0 30px",
              width: 30,
              height: 30,
              borderRadius: 7,
              border: "none",
              background:
                busy || !input.trim()
                  ? "#e2e8f0"
                  : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: busy || !input.trim() ? "#94a3b8" : "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy || !input.trim() ? (busy ? "pointer" : "default") : "pointer",
              fontSize: 12,
              transition: "all 0.12s ease",
              boxShadow: input.trim() && !busy ? "0 2px 6px rgba(99, 102, 241, 0.3)" : "none",
            }}
            title={busy ? "Cancel current task" : "Send to AI Assistance"}
          >
            {busy ? "■" : "➔"}
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
