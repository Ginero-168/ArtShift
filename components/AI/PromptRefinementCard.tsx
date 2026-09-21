import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose, IconPenEdit, IconRotate, IconSparkles, IconWand } from "@/components/icons";
import { hasStoredCloudConsent } from "@/lib/ai/cloudConsent";
import { promptHelperThumbPath } from "@/lib/ai/orchestration/promptHelperThumbManifest";
import { requestPromptHelperThumbGeneration } from "@/lib/ai/orchestration/promptHelperThumbsClient";
import {
  type OptionPreview,
  resolveOptionFallbackPreview,
} from "@/lib/ai/orchestration/promptOptionCatalog";
import {
  buildRefinedPromptString,
  buildRefinementOrchestratorLocks,
  type PromptRefinementCardData,
  type RefinementOption,
} from "@/lib/ai/orchestration/promptRefinement";

const THUMB_CARD_WIDTH = 104;
const THUMB_IMAGE_HEIGHT = 64;
const THUMB_POLL_CHUNK = 80;

export interface PromptRefinementCardProps {
  data: PromptRefinementCardData;
  onGenerate: (refinedPrompt: string) => void;
  onApplyToComposer: (refinedPrompt: string) => void;
  onDismiss: () => void;
  /** Optional: receive Layer-1/2 locks so Orchestrator can store them in generationContext */
  onLocksChange?: (locks: ReturnType<typeof buildRefinementOrchestratorLocks>) => void;
  /** True while Gemini is planning which options fit this prompt */
  planning?: boolean;
  /** Where the current option set came from */
  planSource?: "gemini" | "baseline" | null;
  /** Short Thai rationale from the planner */
  rationale?: string;
  /** Human-readable reason when Gemini planning did not apply */
  planError?: string;
  /** Ask Gemini to rethink options for the same prompt */
  onRethink?: () => void;
}

export default function PromptRefinementCard({
  data,
  onGenerate,
  onApplyToComposer,
  onDismiss,
  onLocksChange,
  planning = false,
  planSource = null,
  rationale = "",
  planError = "",
  onRethink,
}: PromptRefinementCardProps) {
  const [selections, setSelections] = useState<Record<string, string | null>>(() => ({
    ...data.selectedOptions,
  }));

  const dimensionsKey = data.dimensions
    .map((d) => `${d.id}:${d.options.map((o) => o.id).join(",")}`)
    .join("|");
  useEffect(() => {
    setSelections({ ...data.selectedOptions });
  }, [data.id, dimensionsKey, data.selectedOptions]);

  const assembledPrompt = buildRefinedPromptString(data, selections);
  const locks = buildRefinementOrchestratorLocks(data, selections);
  const selectedCount = Object.values(selections).filter(Boolean).length;

  const emitLocks = (next: Record<string, string | null>) => {
    onLocksChange?.(buildRefinementOrchestratorLocks(data, next));
  };

  const handleToggleOption = (dimId: string, optionId: string) => {
    setSelections((prev) => {
      const next = {
        ...prev,
        [dimId]: prev[dimId] === optionId ? null : optionId,
      };
      emitLocks(next);
      return next;
    });
  };

  const handleClearDimension = (dimId: string) => {
    setSelections((prev) => {
      const next = { ...prev, [dimId]: null };
      emitLocks(next);
      return next;
    });
  };

  const isBrand = data.mode === "brand-variant";
  /** Cache-bust only for ids that were missing and later became ready — never remount already-visible thumbs. */
  const [thumbVersions, setThumbVersions] = useState<Record<string, number>>({});
  const optionIds = data.dimensions.flatMap((dim) => dim.options.map((o) => o.id));
  const optionIdsKey = optionIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = optionIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return;

    const knownReady = new Set<string>();
    const seenMissing = new Set<string>();

    async function fetchReady(wanted: string[]): Promise<{ ready: string[]; failed: string[] }> {
      if (wanted.length === 0) return { ready: [], failed: [] };
      const ready: string[] = [];
      const failed: string[] = [];
      for (let i = 0; i < wanted.length; i += THUMB_POLL_CHUNK) {
        const slice = wanted.slice(i, i + THUMB_POLL_CHUNK);
        const res = await fetch(
          `/api/ai/prompt-helper/thumbs?ids=${encodeURIComponent(slice.join(","))}`,
        );
        if (!res.ok) continue;
        const body = (await res.json().catch(() => null)) as {
          ready?: string[];
          failed?: string[];
        } | null;
        if (Array.isArray(body?.ready)) ready.push(...body.ready);
        if (Array.isArray(body?.failed)) failed.push(...body.failed);
      }
      return { ready, failed };
    }

    async function queueMissing(missingIds: string[]) {
      if (missingIds.length === 0) return;
      try {
        await requestPromptHelperThumbGeneration(missingIds, {
          cloudConsent: hasStoredCloudConsent(),
        });
      } catch {
        // Helper still works with SVG/swatch fallbacks.
      }
    }

    async function ensureAndPoll() {
      await queueMissing(ids);
      if (cancelled) return;

      const permanentlyFailed = new Set<string>();

      try {
        const { ready, failed } = await fetchReady(ids);
        for (const id of ready) knownReady.add(id);
        for (const id of failed) permanentlyFailed.add(id);
      } catch {
        // ignore
      }

      let missing = ids.filter((id) => !knownReady.has(id) && !permanentlyFailed.has(id));
      for (const id of missing) seenMissing.add(id);
      if (missing.length === 0) return;

      for (let i = 0; i < 36; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelled) return;

        missing = ids.filter((id) => !knownReady.has(id) && !permanentlyFailed.has(id));
        if (missing.length === 0) return;

        if (i > 0 && i % 3 === 0) {
          await queueMissing(missing);
        }

        try {
          const { ready, failed } = await fetchReady(missing);
          for (const id of failed) permanentlyFailed.add(id);
          const newlyReady = ready.filter((id) => seenMissing.has(id) && !knownReady.has(id));
          if (newlyReady.length === 0) continue;

          const stamp = Date.now();
          for (const id of newlyReady) knownReady.add(id);
          setThumbVersions((prev) => {
            const next = { ...prev };
            for (const id of newlyReady) next[id] = stamp;
            return next;
          });
        } catch {
          // ignore poll errors
        }
      }
    }

    void ensureAndPoll();
    return () => {
      cancelled = true;
    };
  }, [data.id, optionIdsKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onDismiss]);

  const panel = (
    <div
      data-testid="prompt-refinement-card"
      data-refinement-mode={data.mode}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt Helper"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(780px, 94vw)",
        maxHeight: "88vh",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        background: "#ffffff",
        padding: "14px 16px 12px",
        boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <IconWand size={16} color="#6366f1" />
            <span>Prompt ของผู้ใช้ ...</span>
            {isBrand && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#4338ca",
                  background: "#eef2ff",
                  borderRadius: 5,
                  padding: "2px 8px",
                }}
              >
                Anchor + Variant
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            title="ปิดหน้าต่าง"
            aria-label="ปิด Prompt Helper"
            style={{
              background: "#f1f5f9",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
              width: 30,
              height: 30,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconClose size={15} color="currentColor" />
          </button>
        </div>

        <div
          style={{
            padding: "8px 10px",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px dashed #cbd5e1",
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "#1e293b",
            fontWeight: 500,
            minHeight: 34,
            maxHeight: 72,
            overflowY: "auto",
            wordBreak: "break-word",
          }}
        >
          {assembledPrompt}
        </div>

        <div
          data-testid="prompt-helper-plan-status"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: planning ? "#eef2ff" : planSource === "gemini" ? "#f0fdf4" : "#fff7ed",
            border: planning
              ? "1px solid #c7d2fe"
              : planSource === "gemini"
                ? "1px solid #bbf7d0"
                : "1px solid #fed7aa",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: planning ? "#4338ca" : planSource === "gemini" ? "#166534" : "#9a3412",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {planning ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#6366f1",
                      animation: "promptHelperPulse 1s ease-in-out infinite",
                      flexShrink: 0,
                    }}
                  />
                  กำลังส่ง prompt ให้โมเดลคิดตัวเลือก…
                </>
              ) : planSource === "gemini" ? (
                <>
                  <IconSparkles size={13} color="#16a34a" />
                  โมเดลคัดตัวเลือกให้แล้ว
                </>
              ) : (
                <>
                  <IconSparkles size={13} color="#ea580c" />
                  ใช้ชุดตัวเลือกเริ่มต้น (ยังไม่ได้คัดโดยโมเดล)
                </>
              )}
            </div>
            {!planning && rationale ? (
              <div style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.4 }}>{rationale}</div>
            ) : !planning && planError ? (
              <div style={{ fontSize: 11.5, color: "#78716c", lineHeight: 1.4 }}>{planError}</div>
            ) : !planning && planSource !== "gemini" ? (
              <div style={{ fontSize: 11.5, color: "#78716c", lineHeight: 1.4 }}>
                กด “ทบทวนตัวเลือก” เพื่อให้โมเดลคัดชุดที่เข้ากับ prompt นี้มากขึ้น
              </div>
            ) : null}
          </div>
          {onRethink && (
            <button
              type="button"
              data-testid="prompt-helper-rethink"
              onClick={onRethink}
              disabled={planning}
              title="ให้โมเดลคิดชุดตัวเลือกใหม่จาก prompt นี้"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #c7d2fe",
                background: planning ? "#e0e7ff" : "#ffffff",
                color: "#4338ca",
                fontSize: 12,
                fontWeight: 650,
                cursor: planning ? "wait" : "pointer",
                opacity: planning ? 0.7 : 1,
              }}
            >
              <IconRotate size={13} color="#4338ca" />
              ทบทวนตัวเลือก
            </button>
          )}
        </div>
      </div>

      {data.sharedAnchors.length > 0 && (
        <div
          data-testid="shared-anchors-strip"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            padding: "8px 10px",
            background: isBrand ? "#f8fafc" : "#fafafa",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: 0.2 }}>
            {isBrand ? "ล็อกทุกแบบ (Shared Anchor)" : "บริบทที่คงไว้"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {data.sharedAnchors.map((anchor) => (
              <span
                key={anchor.id}
                title={anchor.detail}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#0f172a",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "3px 10px",
                  maxWidth: "100%",
                }}
              >
                {anchor.label}
                <span style={{ color: "#64748b", fontWeight: 500 }}> · {anchor.detail}</span>
              </span>
            ))}
          </div>
          {isBrand && (
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
              เลือกคาแรคเตอร์ด้านล่างเพื่อสร้างความต่าง — ข้อความ/โลโก้/สัดส่วนจะไม่ขยับเมื่อ Orchestrator
              สร้างแบบต่อเนื่อง
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingRight: 2,
          opacity: planning ? 0.55 : 1,
          pointerEvents: planning ? "none" : "auto",
          transition: "opacity 160ms ease",
        }}
      >
        {data.dimensions.map((dim) => {
          const selectedOptionId = selections[dim.id] ?? null;
          return (
            <DimensionRow
              key={dim.id}
              title={dim.title}
              hint={dim.hint}
              options={dim.options}
              selectedOptionId={selectedOptionId}
              visual={dim.options.some((o) => o.preview)}
              thumbVersions={thumbVersions}
              onClear={() => handleClearDimension(dim.id)}
              onToggleOption={(optId) => handleToggleOption(dim.id, optId)}
            />
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 2,
          paddingTop: 10,
          borderTop: "1px solid #f1f5f9",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          data-testid="refinement-generate-button"
          onClick={() => {
            onLocksChange?.(locks);
            onGenerate(assembledPrompt);
          }}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 14px",
            background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(79, 70, 229, 0.28)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span>
              {isBrand && selectedCount > 0
                ? `สร้างตามทิศทางที่เลือก (${selectedCount})`
                : "สร้างรูปภาพตามตัวเลือกนี้"}
            </span>
            <IconWand size={15} color="#ffffff" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onLocksChange?.(locks);
            onApplyToComposer(assembledPrompt);
          }}
          title="คัดลอกลงในช่องพิมพ์เพื่อแก้ไขต่อ"
          style={{
            padding: "10px 12px",
            background: "#f1f5f9",
            color: "#334155",
            border: "1px solid #e2e8f0",
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>คัดลอกลงช่องพิมพ์</span>
            <IconPenEdit size={13} color="#334155" />
          </span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "8px 10px",
            background: "transparent",
            color: "#64748b",
            border: "none",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          ข้าม
        </button>
      </div>
    </div>
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      data-testid="prompt-refinement-overlay"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(2, 6, 23, 0.48)",
        backdropFilter: "blur(6px)",
      }}
    >
      <style>{`@keyframes promptHelperPulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}`}</style>
      {panel}
    </div>,
    document.body,
  );
}

interface DimensionRowProps {
  title: string;
  hint?: string;
  options: RefinementOption[];
  selectedOptionId: string | null;
  visual: boolean;
  thumbVersions: Record<string, number>;
  onClear: () => void;
  onToggleOption: (id: string) => void;
}

function DimensionRow({
  title,
  hint,
  options,
  selectedOptionId,
  visual,
  thumbVersions,
  onClear,
  onToggleOption,
}: DimensionRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isCleared = selectedOptionId === null;

  const handleScroll = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 6, width: "100%" }}>
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => handleScroll(visual ? -240 : -160)}
          style={navBtnStyle}
        >
          ‹
        </button>

        <div
          ref={scrollContainerRef}
          style={{
            display: "flex",
            alignItems: visual ? "stretch" : "center",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            flex: 1,
            padding: "2px 0",
          }}
        >
          <button
            type="button"
            onClick={onClear}
            title={`ไม่ระบุ${title}`}
            style={{
              flexShrink: 0,
              alignSelf: visual ? "center" : undefined,
              minWidth: visual ? 36 : 30,
              height: visual ? 36 : 28,
              padding: "0 8px",
              borderRadius: 8,
              border: isCleared ? "1px solid #dc2626" : "1px solid #fecaca",
              background: isCleared ? "#dc2626" : "#fef2f2",
              color: isCleared ? "#ffffff" : "#b91c1c",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconClose size={12} color={isCleared ? "#ffffff" : "#b91c1c"} />
          </button>

          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            if (visual && opt.preview) {
              return (
                <ThumbnailOption
                  key={opt.id}
                  option={opt}
                  selected={isSelected}
                  onToggle={() => onToggleOption(opt.id)}
                  thumbVersion={thumbVersions[opt.id]}
                />
              );
            }
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleOption(opt.id)}
                style={{
                  flexShrink: 0,
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 7,
                  border: isSelected ? "1px solid #0284c7" : "1px solid #e2e8f0",
                  background: isSelected ? "#0284c7" : "#f8fafc",
                  color: isSelected ? "#ffffff" : "#334155",
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 12.5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => handleScroll(visual ? 240 : 160)}
          style={navBtnStyle}
        >
          ›
        </button>
      </div>
    </div>
  );
}

const navBtnStyle: {
  flexShrink: number;
  width: number;
  height: number;
  alignSelf: "center";
  borderRadius: string;
  border: string;
  background: string;
  color: string;
  display: "flex";
  alignItems: "center";
  justifyContent: "center";
  cursor: "pointer";
  fontSize: number;
  fontWeight: number;
  padding: number;
} = {
  flexShrink: 0,
  width: 26,
  height: 26,
  alignSelf: "center",
  borderRadius: "50%",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  padding: 0,
};

function ThumbnailOption({
  option,
  selected,
  onToggle,
  thumbVersion,
}: {
  option: RefinementOption;
  selected: boolean;
  onToggle: () => void;
  thumbVersion?: number;
}) {
  return (
    <button
      type="button"
      data-testid={`refinement-thumb-${option.id}`}
      onClick={onToggle}
      title={option.modifier}
      style={{
        flexShrink: 0,
        width: THUMB_CARD_WIDTH,
        borderRadius: 10,
        border: selected ? "2px solid #0284c7" : "1px solid #e2e8f0",
        background: selected ? "#f0f9ff" : "#ffffff",
        padding: 4,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
        boxShadow: selected ? "0 0 0 1px rgba(2,132,199,0.25)" : "0 1px 3px rgba(15,23,42,0.06)",
      }}
    >
      <OptionPreviewSurface
        optionId={option.id}
        preview={option.preview}
        selected={selected}
        thumbVersion={thumbVersion}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: selected ? 700 : 600,
          color: selected ? "#0369a1" : "#334155",
          lineHeight: 1.2,
          padding: "0 2px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {option.label}
      </div>
      {option.character && (
        <div
          style={{
            fontSize: 10,
            color: "#94a3b8",
            padding: "0 2px 2px",
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {option.character}
        </div>
      )}
    </button>
  );
}

function OptionPreviewSurface({
  optionId,
  preview,
  selected,
  thumbVersion,
}: {
  optionId: string;
  preview?: OptionPreview;
  selected: boolean;
  thumbVersion?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (thumbVersion != null) setFailed(false);
  }, [optionId, thumbVersion]);

  const frameStyle = {
    height: THUMB_IMAGE_HEIGHT,
    borderRadius: 7,
    overflow: "hidden" as const,
    border: selected ? "1px solid #7dd3fc" : "1px solid rgba(15,23,42,0.06)",
    lineHeight: 0,
    background: "#f8fafc",
  };

  const fallback = resolveOptionFallbackPreview(optionId);
  const baseSrc = preview?.kind === "image" ? preview.src : promptHelperThumbPath(optionId);
  const thumbSrc = thumbVersion != null ? `${baseSrc}?v=${thumbVersion}` : baseSrc;

  if (!failed) {
    return (
      <div style={frameStyle}>
        {/* Catalog thumbs are served via /api/ai/prompt-helper/thumbs/:id */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt={preview?.kind === "image" ? preview.alt || "" : ""}
          width={THUMB_CARD_WIDTH - 8}
          height={THUMB_IMAGE_HEIGHT}
          style={{
            width: "100%",
            height: THUMB_IMAGE_HEIGHT,
            objectFit: "cover",
            display: "block",
          }}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (fallback.kind === "swatch") {
    const gradient = `linear-gradient(135deg, ${fallback.colors.join(", ")})`;
    return (
      <div
        style={{
          ...frameStyle,
          background: gradient,
        }}
      />
    );
  }

  if (fallback.kind === "svg") {
    return (
      <div
        style={frameStyle}
        // Catalog SVGs are authored in-repo (no user HTML).
        // biome-ignore lint/security/noDangerouslySetInnerHtml: in-repo catalog SVG fallbacks, not user HTML
        dangerouslySetInnerHTML={{ __html: fallback.svg }}
      />
    );
  }

  return <div style={frameStyle} />;
}
