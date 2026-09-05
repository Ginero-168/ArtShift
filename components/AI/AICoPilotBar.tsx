"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CoPilotMessage,
  executeCoPilotInstruction,
  isToolCoPilotPrompt,
  type SubAgentActionLog,
} from "@/lib/ai/coPilot";
import { isImageGenerationPrompt } from "@/lib/ai/imageGeneration";
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

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [messages, setMessages] = useState<CoPilotMessage[]>([
    {
      id: "initial-msg",
      role: "assistant",
      content:
        "สวัสดีครับ! ผมคือ AI Assistance ของคุณ พร้อมช่วยสร้างรูปด้วย GPT Image 2 ผ่าน Replicate (คุณภาพ low), ลบพื้นหลัง, แปลง Vector, คิดพาดหัว และจัด Layout 60-30-10 สั่งการได้เลยครับ ✨",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
    const promptToSend = (customPrompt ?? input).trim();
    if (!promptToSend || busy) return;

    setInput("");
    setBusy(true);
    setStreamingText("");
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: CoPilotMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptToSend,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setCurrentActions([]);

    try {
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
        const result = await prepareRemoteDesignTurn(
          history,
          buildDesignAgentContext(),
          controller.signal,
        );

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
        <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder={hasSelection ? "แก้ไขวัตถุที่เลือก..." : "บอกสิ่งที่ต้องการออกแบบ..."}
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #d8dde7",
              borderRadius: 7,
              background: "#ffffff",
              outline: "none",
              fontSize: 11,
              color: "#0f172a",
              padding: "8px 8px",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />

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
