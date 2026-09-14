import { useRef, useState } from "react";
import { IconClose, IconPenEdit, IconWand } from "@/components/icons";
import {
  buildRefinedPromptString,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";

export interface PromptRefinementCardProps {
  data: PromptRefinementCardData;
  onGenerate: (refinedPrompt: string) => void;
  onApplyToComposer: (refinedPrompt: string) => void;
  onDismiss: () => void;
}

export default function PromptRefinementCard({
  data,
  onGenerate,
  onApplyToComposer,
  onDismiss,
}: PromptRefinementCardProps) {
  // Local state for active selections: { [dimensionId]: optionId | null }
  const [selections, setSelections] = useState<Record<string, string | null>>(() => ({
    ...data.selectedOptions,
  }));

  const assembledPrompt = buildRefinedPromptString(data, selections);

  const handleToggleOption = (dimId: string, optionId: string) => {
    setSelections((prev) => ({
      ...prev,
      [dimId]: prev[dimId] === optionId ? null : optionId,
    }));
  };

  const handleClearDimension = (dimId: string) => {
    setSelections((prev) => ({
      ...prev,
      [dimId]: null,
    }));
  };

  return (
    <div
      data-testid="prompt-refinement-card"
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
      {/* Header with Live Prompt Preview */}
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
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#0f172a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#94a3b8";
            }}
          >
            <IconClose size={13} color="currentColor" />
          </button>
        </div>

        {/* Live dynamic preview box */}
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

      {/* Category Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.dimensions.map((dim) => {
          const selectedOptionId = selections[dim.id] ?? null;
          const isCleared = selectedOptionId === null;

          return (
            <DimensionRow
              key={dim.id}
              title={dim.title}
              options={dim.options}
              selectedOptionId={selectedOptionId}
              isCleared={isCleared}
              onClear={() => handleClearDimension(dim.id)}
              onToggleOption={(optId) => handleToggleOption(dim.id, optId)}
            />
          );
        })}
      </div>

      {/* Action Buttons */}
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
          onClick={() => onGenerate(assembledPrompt)}
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
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 3px 8px rgba(79, 70, 229, 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow = "0 1.5px 5px rgba(79, 70, 229, 0.25)";
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>สร้างรูปภาพตามตัวเลือกนี้</span>
            <IconWand size={13} color="#ffffff" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onApplyToComposer(assembledPrompt)}
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
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
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
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#0f172a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#64748b";
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
  options: Array<{ id: string; label: string; modifier: string }>;
  selectedOptionId: string | null;
  isCleared: boolean;
  onClear: () => void;
  onToggleOption: (id: string) => void;
}

function DimensionRow({
  title,
  options,
  selectedOptionId,
  isCleared,
  onClear,
  onToggleOption,
}: DimensionRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = (delta: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Dimension Title */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#334155",
        }}
      >
        {title}
      </div>

      {/* Row with Navigation and Options */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          width: "100%",
        }}
      >
        {/* Left Arrow Button */}
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => handleScroll(-120)}
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
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
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
            e.currentTarget.style.borderColor = "#94a3b8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#cbd5e1";
          }}
        >
          ‹
        </button>

        {/* Scrollable Container with X and Option Pills */}
        <div
          ref={scrollContainerRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            flex: 1,
            padding: "1px 0",
          }}
        >
          {/* First Pill: X button */}
          <button
            type="button"
            onClick={onClear}
            title={`ไม่ระบุ${title} (ใช้ค่าเริ่มต้น)`}
            style={{
              flexShrink: 0,
              minWidth: 24,
              height: 22,
              padding: "0 6px",
              borderRadius: 5,
              border: isCleared ? "1px solid #dc2626" : "1px solid #fecaca",
              background: isCleared ? "#dc2626" : "#fef2f2",
              color: isCleared ? "#ffffff" : "#b91c1c",
              fontWeight: 700,
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.12s ease",
            }}
          >
            <IconClose size={10} color={isCleared ? "#ffffff" : "#b91c1c"} />
          </button>

          {/* Option Pills */}
          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;

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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  transition: "all 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "#eef2ff";
                    e.currentTarget.style.borderColor = "#c7d2fe";
                    e.currentTarget.style.color = "#4338ca";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.color = "#334155";
                  }
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => handleScroll(120)}
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
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
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
            e.currentTarget.style.borderColor = "#94a3b8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#cbd5e1";
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
