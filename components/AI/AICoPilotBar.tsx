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
  buildComposerImageSelection,
  snapshotComposerImageRefs,
} from "@/lib/ai/orchestration/imageReferences";
import { runContextAwareImageTask } from "@/lib/ai/orchestration/imageTaskRunner";
import {
  analyzeImageReferences,
  type ImageReferenceAnalysis,
} from "@/lib/ai/orchestration/referenceAnalysis";
import {
  type ContextAwareTurnResult,
  isCanvasInventoryPrompt,
  type PendingClarification,
  prepareContextAwareTurn,
} from "@/lib/ai/orchestration/turnOrchestrator";
import { subscribeAIProgress } from "@/lib/ai/progressReporter";
import { routeUnifiedPrompt, UNIFIED_AI_SYSTEM } from "@/lib/ai/unifiedSystem";
import { planVisualRequest } from "@/lib/ai/visualOrchestrator";
import {
  buildDesignAgentContext,
  type ClientChatMessage,
  prepareRemoteDesignTurn,
} from "@/lib/designAgent/client";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import { buildLocalEditPlan } from "@/lib/designAgent/localPlan";
import { summarizePlanForReview } from "@/lib/designAgent/planReview";
import { applyAiPlan } from "@/lib/engine/applyAiPlan";
import { useEngine } from "@/lib/engine/store";

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
      suggestions: [
        "🎨 สร้างรูปแก้วกาแฟมินิมอล",
        "✂️ ลบพื้นหลังของรูปที่เลือก",
        "📐 จัด Layout สไลด์นี้แบบ 60-30-10",
        "✍️ ออกแบบแบนเนอร์ Mid-Year Sale",
      ],
    },
  ]);

  const [currentActions, setCurrentActions] = useState<SubAgentActionLog[]>([]);
  const [pendingPlan, setPendingPlan] = useState<PlanProposal | null>(null);
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
  }, [messages, currentActions, streamingText]);

  const handleSend = async (customPrompt?: string) => {
    const rawPrompt = (customPrompt ?? input).trim();
    if (!rawPrompt || busy) return;

    const pending = pendingClarification;
    const selectedOption =
      pending && customPrompt ? findClarificationOption(pending, customPrompt) : undefined;
    if (selectedOption?.id === "OTHER") {
      inputRef.current?.focus();
      return;
    }
    const promptToSend = pending
      ? `${pending.originalPrompt}\n\nDirection ที่เลือก: ${selectedOption?.label ?? `Other: ${rawPrompt}`}`
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
      content: selectedOption ? `${selectedOption.id}. ${selectedOption.label}` : rawPrompt,
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
      } else if (isImageGenerationPrompt(promptToSend) || hasImageContext) {
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

        if (
          hasImageContext &&
          analysesForTurn.length > 0 &&
          /(?:อธิบาย|describe|what\s+is|ภาพนี้คือ|รูปนี้คือ)/iu.test(promptToSend)
        ) {
          const first = analysesForTurn[0];
          contextDecision = {
            kind: "answer",
            source: "canvas-local",
            reply: `ภาพที่เลือกน่าจะเป็น ${first.caption || first.objects.join(", ") || "ภาพที่ระบบยังระบุรายละเอียดไม่ได้"}ครับ${first.visibleText ? `\nข้อความที่อ่านได้: ${first.visibleText}` : ""}`,
          };
        } else if (
          isImageGenerationPrompt(promptToSend) ||
          (hasImageContext && isImageContextRequest && !isBuiltInImageAction)
        ) {
          contextDecision = prepareContextAwareTurn({
            prompt: promptToSend,
            refs: refsForTurn,
            analyses: analysesForTurn,
            selectedIds,
            canvas: slide ? { slide, selectedIds } : undefined,
            clarification: pending
              ? {
                  question: pending.question,
                  optionIds: pending.options.map((option) => option.id),
                }
              : undefined,
            clarificationRound: pending?.round ?? 0,
          });
        }
      }

      if (contextDecision && contextDecision.kind !== "continue") {
        let reply = "";
        let actions = [...analysisActions];
        let suggestions: string[] = [];
        if (contextDecision.kind === "answer") {
          reply = contextDecision.reply;
          suggestions = ["ถามเกี่ยวกับ Object บน Canvas", "วิเคราะห์ภาพนี้ละเอียดขึ้น"];
        } else if (contextDecision.kind === "clarification") {
          setPendingClarification(contextDecision.pending);
          reply = contextDecision.pending.question;
          suggestions = contextDecision.pending.options.map(
            (option) => `${option.id === "OTHER" ? "Other" : `${option.id}.`} ${option.label}`,
          );
          actions = [
            ...actions,
            {
              id: crypto.randomUUID(),
              agent: "orchestrator",
              title: "🧭 Intent Clarification",
              description: `ต้องการคำตอบเพิ่มก่อนสร้าง Task (รอบ ${contextDecision.pending.round}/2)`,
              status: "success",
              timestamp: Date.now(),
            },
          ];
        } else if (contextDecision.kind === "capability-unavailable") {
          setPendingClarification(null);
          reply = contextDecision.reply;
          suggestions = ["ปรับคำขอให้ใช้ความสามารถที่พร้อมใช้งาน", "ถามเกี่ยวกับ Canvas แบบ local"];
          actions = [
            ...actions,
            {
              id: crypto.randomUUID(),
              agent: "orchestrator",
              title: `🧭 Capability · ${contextDecision.capability}`,
              description: contextDecision.reason,
              status: "error",
              timestamp: Date.now(),
            },
          ];
        } else {
          setPendingClarification(null);
          const taskAction: SubAgentActionLog = {
            id: crypto.randomUUID(),
            agent: contextDecision.task.subAgent === "image_editor" ? "image_edit" : "image_gen",
            title: `🧩 Task · ${contextDecision.task.subAgent}`,
            description: `พร้อมทำงานด้วยคุณภาพอัตโนมัติ: ${contextDecision.task.quality}`,
            status: "running",
            timestamp: Date.now(),
            taskId: contextDecision.task.id,
            stage: "planned",
            attempt: 0,
            quality: contextDecision.task.quality,
          };
          actions = [...actions, taskAction];
          const consent =
            typeof window === "undefined" ||
            window.confirm(
              `งานนี้จะส่ง ${refsForTurn.length ? "ภาพที่เลือกและ" : "คำสั่งไปยัง"} AI provider เพื่อสร้างผลลัพธ์ (คุณภาพอัตโนมัติ: ${contextDecision.task.quality}, สูงสุด ${contextDecision.task.maxAttempts} ครั้ง) ดำเนินการต่อหรือไม่?`,
            );
          if (!consent) {
            taskAction.status = "error";
            taskAction.description = "ยังไม่ได้รับอนุญาตให้ส่งงานไปยัง AI provider";
            reply = "ยกเลิก Task แล้วครับ ยังไม่มีการส่งภาพหรือเรียก AI provider";
          } else {
            try {
              const result = await runContextAwareImageTask(contextDecision.task, refsForTurn, {
                signal: controller.signal,
                cloudConsent: true,
                onUpdate: (update) => {
                  taskAction.description = `${update.message} · ครั้งที่ ${update.attempt}/${contextDecision.task.maxAttempts}`;
                  taskAction.stage = update.stage;
                  taskAction.attempt = update.attempt;
                  taskAction.quality = update.quality;
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
              taskAction.status = "success";
              taskAction.description = `สำเร็จและวางผลลัพธ์บน Canvas (${result.width} × ${result.height}px)`;
              reply = `สร้างภาพตาม brief และวางบน Canvas เรียบร้อยแล้วครับ ใช้คุณภาพอัตโนมัติ: ${result.task.quality} โดยคงต้นฉบับไว้`;
              suggestions = [
                "🪄 ลบพื้นหลังของรูปนี้",
                "⚡ แปลงรูปนี้เป็น Vector Paths",
                "📐 จัดวาง Layout ให้สวยงาม",
              ];
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
                ? "ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้ครับ ผมจะไม่สร้างงานซ้ำอัตโนมัติเพื่อป้องกันค่าใช้จ่ายซ้ำ"
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

      const localPlan = buildLocalEditPlan(promptToSend);
      const visualPlan = isImageGenerationPrompt(promptToSend)
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

        addRemoteAction("✦ Design Agent", "กำลังวิเคราะห์คำสั่งและบริบทของ Artwork...");
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
          const result = await prepareRemoteDesignTurn(history, buildDesignAgentContext(), {
            signal: controller.signal,
            cloudConsent: true,
          });

          if (result.type === "proposal") {
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
          } else if (result.type === "question") {
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: "ต้องการรายละเอียดเพิ่มก่อนเริ่มงาน",
            };
            reply = result.text;
            suggestions = ["ระบุเป้าหมายและขนาดงาน", "เพิ่ม reference หรือ Brand direction"];
          } else {
            remoteActions[0] = {
              ...remoteActions[0],
              status: "success",
              description: "ได้รับคำตอบจาก Design Agent แล้ว",
            };
            reply = result.text;
            suggestions = [
              "📐 ขอให้จัด Layout ต่อ",
              "✍️ ขอให้สร้าง direction ใหม่",
              "🧩 ใช้เครื่องมือแก้ไขเฉพาะทาง",
            ];
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
                <div style={{ marginTop: 5 }}>
                  <strong>Estimated AI cost:</strong>{" "}
                  {pendingReview.estimatedRemoteCostUsd > 0
                    ? `$${pendingReview.estimatedRemoteCostUsd.toFixed(4)}`
                    : "$0.0000"}
                </div>
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

        {/* Quick-Action Chips (When input is empty and not busy) */}
        {!input && !busy && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <button
              type="button"
              onClick={() => handleSend("📐 จัด Layout สไลด์นี้แบบ 60-30-10")}
              title="Apply 60-30-10 Auto Layout"
              style={{
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 5,
                padding: "3px 6px",
                fontSize: 9.5,
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📐 Layout
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={() => handleSend("✂️ ลบพื้นหลังของรูปที่เลือก")}
                title="Remove background from selected image"
                style={{
                  background: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: 5,
                  padding: "3px 6px",
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: "#4338ca",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                🪄 Remove BG
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function findClarificationOption(
  pending: PendingClarification,
  value: string,
): PendingClarification["options"][number] | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  return pending.options.find((option) => {
    const id = option.id.toLocaleLowerCase();
    return (
      normalized === option.label.toLocaleLowerCase() ||
      normalized.startsWith(`${id}.`) ||
      (id === "other" && normalized.startsWith("other"))
    );
  });
}
