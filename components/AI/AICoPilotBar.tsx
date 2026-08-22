"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CoPilotMessage,
  executeCoPilotInstruction,
  isSpecializedCoPilotPrompt,
  type SubAgentActionLog,
} from "@/lib/ai/coPilot";
import { AI_MODE_CONFIG, type AIMode, loadAIMode, saveAIMode } from "@/lib/ai/modes";
import { type ChatMsg, runEngineChat } from "@/lib/engine/chat";
import { useEngine } from "@/lib/engine/store";

export default function AICoPilotBar() {
  const _currentSlideId = useEngine((s) => s.currentSlideId);
  const slide = useEngine((s) =>
    s.doc.slides.find((candidate) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s) => s.selectedIds);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AIMode>("eco");
  const [streamingText, setStreamingText] = useState("");
  const [messages, setMessages] = useState<CoPilotMessage[]>([
    {
      id: "initial-msg",
      role: "assistant",
      content:
        "สวัสดีครับ! ผมคือ AI Assistance ของคุณ พร้อมช่วยสร้างรูป (FLUX), ลบพื้นหลัง, แปลง Vector, คิดพาดหัว และจัด Layout 60-30-10 สั่งการได้เลยครับ ✨",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMode(loadAIMode());
  }, []);

  const selectMode = (nextMode: AIMode) => {
    if (busy) return;
    setMode(nextMode);
    saveAIMode(nextMode);
  };

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
      const useSpecializedPath = mode === "eco" || isSpecializedCoPilotPrompt(promptToSend);
      let reply = "";
      let actions: SubAgentActionLog[] = [];
      let suggestions: string[] = [];

      if (useSpecializedPath) {
        const result = await executeCoPilotInstruction(promptToSend, upsertCurrentAction, {
          mode,
          signal: controller.signal,
        });
        reply = result.reply;
        actions = result.actions;
        suggestions = result.suggestions;
      } else {
        const fastActions: SubAgentActionLog[] = [];
        const addFastAction = (
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
            mode: "fast",
          };
          fastActions.push(action);
          upsertCurrentAction(action);
        };

        addFastAction("∞ Fast API Planner", "กำลังวิเคราะห์คำสั่งและบริบทของ Workspace...");
        const history: ChatMsg[] = [
          ...messages
            .flatMap((message): ChatMsg[] =>
              message.role === "user" || message.role === "assistant"
                ? [{ role: message.role, content: message.content }]
                : [],
            )
            .slice(-10),
          { role: "user", content: promptToSend },
        ];
        const result = await runEngineChat(history, {
          signal: controller.signal,
          onTextDelta: (delta) => setStreamingText((previous) => previous + delta),
          onPlan: () => addFastAction("∞ Workspace Plan", "ได้รับแผนงานจาก API แล้ว"),
          onProgress: (progress) => {
            const detail =
              typeof progress === "object" && progress && "message" in progress
                ? String((progress as { message?: unknown }).message ?? "กำลังทำงาน...")
                : "กำลังดำเนินการบน Workspace...";
            addFastAction("∞ Fast API Progress", detail, "success");
          },
          onMutation: (mutation) =>
            addFastAction(`∞ ${mutation.tool}`, "ปรับแก้ Workspace เรียบร้อย", "success"),
        });

        if (result.error) {
          fastActions[0] = {
            ...fastActions[0],
            status: "error",
            description: result.error,
          };
          upsertCurrentAction(fastActions[0]);
          reply = `โหมด Fast ยังใช้งานไม่ได้: ${result.error}`;
          suggestions = [
            "🍃 สลับเป็น Eco เพื่อทำงาน local",
            "ลองตรวจสอบ ANTHROPIC_API_KEY แล้วส่งคำสั่งอีกครั้ง",
          ];
        } else {
          fastActions[0] = {
            ...fastActions[0],
            status: "success",
            description: `ดำเนินการเสร็จ: applied ${result.applied}, skipped ${result.skipped}`,
          };
          upsertCurrentAction(fastActions[0]);
          reply = result.text;
          suggestions = ["📐 จัด Layout ต่อ", "✍️ เพิ่มข้อความหรือ CTA", "🍃 สลับเป็น Eco สำหรับงาน local"];
        }
        actions = fastActions;
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

  const elementCount = (slide?.elements ?? []).filter((e) => !e.isDeleted).length;
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>🧠</span>
            <strong style={{ fontSize: 11, color: "#1e1b4b" }}>AI Assistance</strong>
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
              {elementCount} objects
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
                    msg.role === "user"
                      ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                      : "#f8fafc",
                  color: msg.role === "user" ? "#ffffff" : "#1e293b",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  border: msg.role === "user" ? "none" : "1px solid rgba(226, 232, 240, 0.8)",
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
        {/* Local-first / paid API mode selector */}
        <div
          role="radiogroup"
          aria-label="AI execution mode"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: 2,
            borderRadius: 8,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {(Object.keys(AI_MODE_CONFIG) as AIMode[]).map((candidate) => {
            const config = AI_MODE_CONFIG[candidate];
            const active = mode === candidate;
            return (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy}
                onClick={() => selectMode(candidate)}
                title={config.description}
                style={{
                  border: active ? `1px solid ${config.accent}55` : "1px solid transparent",
                  borderRadius: 6,
                  background: active ? `${config.accent}12` : "transparent",
                  color: active ? config.accent : "#64748b",
                  padding: "3px 5px",
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  cursor: busy ? "default" : "pointer",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                <span aria-hidden="true">{config.icon}</span> {config.label}
              </button>
            );
          })}
        </div>

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
            placeholder={
              mode === "eco"
                ? hasSelection
                  ? "Eco: แก้ไขวัตถุที่เลือก..."
                  : "Eco: สั่งงาน local..."
                : hasSelection
                  ? "Fast: ให้ API ช่วยแก้ไข..."
                  : "Fast: ให้ API ช่วยออกแบบ..."
            }
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
