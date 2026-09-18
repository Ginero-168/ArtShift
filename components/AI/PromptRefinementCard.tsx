import { useEffect, useRef, useState } from "react";
import { IconClose, IconPenEdit, IconWand } from "@/components/icons";
import {
  buildRefinedPromptString,
  buildRefinementOrchestratorLocks,
  type PromptRefinementCardData,
  type RefinementOption,
} from "@/lib/ai/orchestration/promptRefinement";
import {
  resolveOptionFallbackPreview,
  type OptionPreview,
} from "@/lib/ai/orchestration/promptOptionCatalog";
import { promptHelperThumbPath } from "@/lib/ai/orchestration/promptHelperThumbManifest";

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

    async function fetchReady(wanted: string[]): Promise<string[]> {
      if (wanted.length === 0) return [];
      const res = await fetch(
        `/api/ai/prompt-helper/thumbs?ids=${encodeURIComponent(wanted.slice(0, 80).join(","))}`,
      );
      if (!res.ok) return [];
      const body = (await res.json().catch(() => null)) as { ready?: string[] } | null;
      return Array.isArray(body?.ready) ? body.ready : [];
    }

    async function ensureAndPoll() {
      try {
        await fetch("/api/ai/prompt-helper/thumbs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionIds: ids }),
        });
      } catch {
        // Helper still works with SVG/swatch fallbacks.
      }
      if (cancelled) return;

      // Snapshot what's already on disk — do NOT bump versions (avoids flicker).
      try {
        const ready = await fetchReady(ids);
        for (const id of ready) knownReady.add(id);
      } catch {
        // ignore
      }

      let missing = ids.filter((id) => !knownReady.has(id));
      for (const id of missing) seenMissing.add(id);
      if (missing.length === 0) return;

      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelled) return;

        // Only poll ids still missing — skip chips that already have files.
        missing = ids.filter((id) => !knownReady.has(id));
        if (missing.length === 0) return;

        try {
          const ready = await fetchReady(missing);
          const newlyReady = ready.filter(
            (id) => seenMissing.has(id) && !knownReady.has(id),
          );
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{title}</div>
        {hint && <div style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 4, width: "100%" }}>
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => handleScroll(visual ? -140 : -120)}
          style={navBtnStyle}
        >
          ‹
        </button>

        <div
          ref={scrollContainerRef}
          style={{
            display: "flex",
            alignItems: visual ? "stretch" : "center",
            gap: 5,
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
              minWidth: visual ? 28 : 24,
              height: visual ? 28 : 22,
              padding: visual ? "0 6px" : "0 6px",
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
        width: 56,
        borderRadius: 7,
        border: selected ? "2px solid #0284c7" : "1px solid #e2e8f0",
        background: selected ? "#f0f9ff" : "#ffffff",
        padding: 2,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        textAlign: "left",
        boxShadow: selected ? "0 0 0 1px rgba(2,132,199,0.25)" : "none",
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
          fontSize: 9,
          fontWeight: selected ? 700 : 600,
          color: selected ? "#0369a1" : "#334155",
          lineHeight: 1.15,
          padding: "0 1px",
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
            fontSize: 8,
            color: "#94a3b8",
            padding: "0 1px 1px",
            lineHeight: 1.1,
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
    // Retry only when this option's thumb was newly generated (version appears/changes).
    if (thumbVersion != null) setFailed(false);
  }, [optionId, thumbVersion]);

  const frameStyle = {
    height: 28,
    borderRadius: 4,
    overflow: "hidden" as const,
    border: selected ? "1px solid #7dd3fc" : "1px solid rgba(15,23,42,0.06)",
    lineHeight: 0,
    background: "#f8fafc",
  };

  const fallback = resolveOptionFallbackPreview(optionId);
  const baseSrc =
    preview?.kind === "image" ? preview.src : promptHelperThumbPath(optionId);
  // Stable URL when already on disk; cache-bust only after a missing→ready transition.
  const thumbSrc =
    thumbVersion != null ? `${baseSrc}?v=${thumbVersion}` : baseSrc;

  if (!failed) {
    return (
      <div style={frameStyle}>
        {/* Catalog thumbs are served via /api/ai/prompt-helper/thumbs/:id */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt={preview?.kind === "image" ? preview.alt || "" : ""}
          width={52}
          height={28}
          style={{ width: "100%", height: 28, objectFit: "cover", display: "block" }}
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
        dangerouslySetInnerHTML={{ __html: fallback.svg }}
      />
    );
  }

  return <div style={frameStyle} />;
}
