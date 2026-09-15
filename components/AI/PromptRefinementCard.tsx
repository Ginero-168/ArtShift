import { useRef, useState } from "react";
import { IconClose, IconPenEdit, IconWand } from "@/components/icons";
import {
  buildRefinedPromptString,
  buildRefinementOrchestratorLocks,
  type PromptRefinementCardData,
  type RefinementOption,
} from "@/lib/ai/orchestration/promptRefinement";
import type { OptionPreview } from "@/lib/ai/orchestration/promptOptionCatalog";

export interface PromptRefinementCardProps {
  data: PromptRefinementCardData;
  onGenerate: (refinedPrompt: string) => void;
  onApplyToComposer: (refinedPrompt: string) => void;
  onDismiss: () => void;
  /** Optional: receive Layer-1/2 locks so Orchestrator can store them in generationContext */
  onLocksChange?: (
    locks: ReturnType<typeof buildRefinementOrchestratorLocks>,
  ) => void;
}

export default function PromptRefinementCard({
  data,
  onGenerate,
  onApplyToComposer,
  onDismiss,
  onLocksChange,
}: PromptRefinementCardProps) {
  const [selections, setSelections] = useState<Record<string, string | null>>(() => ({
    ...data.selectedOptions,
  }));

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

  return (
    <div
      data-testid="prompt-refinement-card"
      data-refinement-mode={data.mode}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        background: "#ffffff",
        padding: "10px 12px",
        margin: "6px 0",
        boxShadow: "0 3px 12px rgba(0, 0, 0, 0.05)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <IconWand size={14} color="#6366f1" />
            <span>Prompt ของผู้ใช้ ...</span>
            {isBrand && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#4338ca",
                  background: "#eef2ff",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                Anchor + Variant
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            title="ปิดการ์ด"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              lineHeight: 1,
              padding: "2px 4px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconClose size={13} color="currentColor" />
          </button>
        </div>

        <div
          style={{
            padding: "5px 8px",
            background: "#f8fafc",
            borderRadius: 6,
            border: "1px dashed #cbd5e1",
            fontSize: 11,
            lineHeight: 1.4,
            color: "#1e293b",
            fontWeight: 500,
            minHeight: 26,
            wordBreak: "break-word",
          }}
        >
          {assembledPrompt}
        </div>
      </div>

      {data.sharedAnchors.length > 0 && (
        <div
          data-testid="shared-anchors-strip"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "6px 8px",
            background: isBrand ? "#f8fafc" : "#fafafa",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 0.2 }}>
            {isBrand ? "ล็อกทุกแบบ (Shared Anchor)" : "บริบทที่คงไว้"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {data.sharedAnchors.map((anchor) => (
              <span
                key={anchor.id}
                title={anchor.detail}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#0f172a",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "2px 8px",
                  maxWidth: "100%",
                }}
              >
                {anchor.label}
                <span style={{ color: "#64748b", fontWeight: 500 }}> · {anchor.detail}</span>
              </span>
            ))}
          </div>
          {isBrand && (
            <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.35 }}>
              เลือกคาแรคเตอร์ด้านล่างเพื่อสร้างความต่าง — ข้อความ/โลโก้/สัดส่วนจะไม่ขยับเมื่อ Orchestrator
              สร้างแบบต่อเนื่อง
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          gap: 6,
          marginTop: 2,
          paddingTop: 6,
          borderTop: "1px solid #f1f5f9",
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
            gap: 5,
            padding: "6px 10px",
            background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 7,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 1.5px 5px rgba(79, 70, 229, 0.25)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>
              {isBrand && selectedCount > 0
                ? `สร้างตามทิศทางที่เลือก (${selectedCount})`
                : "สร้างรูปภาพตามตัวเลือกนี้"}
            </span>
            <IconWand size={13} color="#ffffff" />
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
            padding: "6px 8px",
            background: "#f1f5f9",
            color: "#334155",
            border: "1px solid #e2e8f0",
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>คัดลอกลงช่องพิมพ์</span>
            <IconPenEdit size={12} color="#334155" />
          </span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "5px 6px",
            background: "transparent",
            color: "#64748b",
            border: "none",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          ข้าม
        </button>
      </div>
    </div>
  );
}

interface DimensionRowProps {
  title: string;
  hint?: string;
  options: RefinementOption[];
  selectedOptionId: string | null;
  visual: boolean;
  onClear: () => void;
  onToggleOption: (id: string) => void;
}

function DimensionRow({
  title,
  hint,
  options,
  selectedOptionId,
  visual,
  onClear,
  onToggleOption,
}: DimensionRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isCleared = selectedOptionId === null;

  const handleScroll = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{title}</div>
        {hint && <div style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 4, width: "100%" }}>
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => handleScroll(visual ? -160 : -120)}
          style={navBtnStyle}
        >
          ‹
        </button>

        <div
          ref={scrollContainerRef}
          style={{
            display: "flex",
            alignItems: visual ? "stretch" : "center",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            flex: 1,
            padding: "1px 0",
          }}
        >
          <button
            type="button"
            onClick={onClear}
            title={`ไม่ระบุ${title}`}
            style={{
              flexShrink: 0,
              alignSelf: visual ? "center" : undefined,
              minWidth: visual ? 36 : 24,
              height: visual ? 36 : 22,
              padding: visual ? "0 8px" : "0 6px",
              borderRadius: 6,
              border: isCleared ? "1px solid #dc2626" : "1px solid #fecaca",
              background: isCleared ? "#dc2626" : "#fef2f2",
              color: isCleared ? "#ffffff" : "#b91c1c",
              fontWeight: 700,
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconClose size={10} color={isCleared ? "#ffffff" : "#b91c1c"} />
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
                  height: 22,
                  padding: "0 8px",
                  borderRadius: 5,
                  border: isSelected ? "1px solid #0284c7" : "1px solid #e2e8f0",
                  background: isSelected ? "#0284c7" : "#f8fafc",
                  color: isSelected ? "#ffffff" : "#334155",
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 11,
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
          onClick={() => handleScroll(visual ? 160 : 120)}
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
  width: 18,
  height: 18,
  alignSelf: "center",
  borderRadius: "50%",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 800,
  padding: 0,
};

function ThumbnailOption({
  option,
  selected,
  onToggle,
}: {
  option: RefinementOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`refinement-thumb-${option.id}`}
      onClick={onToggle}
      title={option.modifier}
      style={{
        flexShrink: 0,
        width: 76,
        borderRadius: 8,
        border: selected ? "2px solid #0284c7" : "1px solid #e2e8f0",
        background: selected ? "#f0f9ff" : "#ffffff",
        padding: 3,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        textAlign: "left",
        boxShadow: selected ? "0 0 0 1px rgba(2,132,199,0.25)" : "none",
      }}
    >
      <OptionPreviewSurface preview={option.preview!} selected={selected} />
      <div
        style={{
          fontSize: 10,
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
            fontSize: 9,
            color: "#94a3b8",
            padding: "0 2px 1px",
            lineHeight: 1.2,
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
  preview,
  selected,
}: {
  preview: OptionPreview;
  selected: boolean;
}) {
  if (preview.kind === "swatch") {
    const gradient = `linear-gradient(135deg, ${preview.colors.join(", ")})`;
    return (
      <div
        style={{
          height: 40,
          borderRadius: 5,
          background: gradient,
          border: selected ? "1px solid #7dd3fc" : "1px solid rgba(15,23,42,0.06)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        height: 40,
        borderRadius: 5,
        overflow: "hidden",
        border: selected ? "1px solid #7dd3fc" : "1px solid rgba(15,23,42,0.06)",
        lineHeight: 0,
      }}
      // Catalog SVGs are authored in-repo (no user HTML).
      dangerouslySetInnerHTML={{ __html: preview.svg }}
    />
  );
}
