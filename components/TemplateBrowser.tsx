"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";
import { runTemplate, type TemplateName, type TemplatePayload } from "@/lib/templates";

const THUMB_W = 140;

const TEMPLATE_DEFS: {
  name: TemplateName;
  label: string;
  category: string;
  sampleData: TemplatePayload;
}[] = [
  {
    name: "title-bullets",
    label: "Title + Bullets",
    category: "Content",
    sampleData: {
      template: "title-bullets",
      data: {
        title: "Key Points",
        bullets: ["Point one", "Point two", "Point three"],
        accent: "#1971c2",
      },
    },
  },
  {
    name: "hero",
    label: "Hero Section",
    category: "Cover",
    sampleData: {
      template: "hero",
      data: { title: "Welcome", subtitle: "Subtitle here", cta: "Get Started", accent: "#2f9e44" },
    },
  },
  {
    name: "three-column-cards",
    label: "3 Column Cards",
    category: "Content",
    sampleData: {
      template: "three-column-cards",
      data: {
        title: "Features",
        columns: [
          { header: "Feature A", body: { kind: "paragraph", text: "Description" } },
          { header: "Feature B", body: { kind: "paragraph", text: "Description" } },
          { header: "Feature C", body: { kind: "paragraph", text: "Description" } },
        ],
        accent: "#f08c00",
      },
    },
  },
  {
    name: "comparison",
    label: "Comparison",
    category: "Content",
    sampleData: {
      template: "comparison",
      data: {
        title: "Compare",
        left: { header: "Option A", items: ["Pro 1", "Pro 2"], tone: "good" },
        right: { header: "Option B", items: ["Con 1", "Con 2"], tone: "bad" },
        accent: "#1971c2",
      },
    },
  },
  {
    name: "stat-grid",
    label: "Stat Grid",
    category: "Data",
    sampleData: {
      template: "stat-grid",
      data: {
        title: "Metrics",
        stats: [
          { value: "100K", label: "Users" },
          { value: "50%", label: "Growth" },
          { value: "4.9", label: "Rating" },
        ],
        accent: "#6366f1",
      },
    },
  },
  {
    name: "quote",
    label: "Quote",
    category: "Content",
    sampleData: {
      template: "quote",
      data: {
        quote: "Design is intelligence made visible.",
        attribution: "— Anonymous",
        accent: "#e03131",
      },
    },
  },
  {
    name: "timeline",
    label: "Timeline",
    category: "Data",
    sampleData: {
      template: "timeline",
      data: {
        title: "Roadmap",
        steps: [
          { label: "Phase 1", description: "Research" },
          { label: "Phase 2", description: "Design" },
          { label: "Phase 3", description: "Build" },
        ],
        accent: "#2f9e44",
      },
    },
  },
  {
    name: "image-text-split",
    label: "Image + Text",
    category: "Content",
    sampleData: {
      template: "image-text-split",
      data: {
        title: "About Us",
        body: "Company description goes here.",
        imageUrl: "",
        accent: "#1971c2",
      },
    },
  },
];

const CATEGORIES = ["All", "Cover", "Content", "Data"];

export default function TemplateBrowser({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  const filtered = TEMPLATE_DEFS.filter((t) => {
    const matchesQuery = t.label.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All" || t.category === category;
    return matchesQuery && matchesCategory;
  });

  function applyTemplate(payload: TemplatePayload) {
    const result = runTemplate(payload);
    if (!result) return;
    const st = useEngine.getState();
    const slide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
    if (!slide) return;
    for (const el of result.objects) {
      st.addElement(el, "template " + payload.template);
    }
    if (result.background) {
      st.setSlideBackground(slide.id, result.background);
    }
    onClose();
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: 50,
        left: 50,
        width: 360,
        maxHeight: "70vh",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        padding: 16,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Templates</h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
        >
          ×
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search templates..."
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--stroke, #e5e7eb)",
          fontSize: 12,
          outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: "3px 8px",
              borderRadius: 12,
              border: "none",
              background:
                category === c ? "var(--accent, #6366f1)" : "var(--surface-hover, #f3f4f6)",
              color: category === c ? "#fff" : "var(--ink, #111)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, overflow: "auto" }}>
        {filtered.map((t) => (
          <TemplateThumb key={t.name} def={t} onClick={() => applyTemplate(t.sampleData)} />
        ))}
      </div>
    </div>
  );
}

function TemplateThumb({
  def,
  onClick,
}: {
  def: (typeof TEMPLATE_DEFS)[number];
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const result = runTemplate(def.sampleData);
    if (!result) return;
    const dpr = window.devicePixelRatio || 1;
    const h = Math.round((THUMB_W / 1920) * 1080);
    canvas.width = THUMB_W * dpr;
    canvas.height = h * dpr;
    canvas.style.width = THUMB_W + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = THUMB_W / 1920;
    ctx.fillStyle = result.background;
    ctx.fillRect(0, 0, THUMB_W, h);
    ctx.save();
    ctx.scale(sx, sx);
    const fakeSlide: EngineSlide = {
      id: "preview",
      name: "preview",
      background: result.background,
      elements: result.objects,
      width: 1920,
      height: 1080,
    };
    renderSlide(fakeSlide, { ctx, images: getImageCache() }, 1920, 1080);
    ctx.restore();
  }, [def]);

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: 6,
        borderRadius: 8,
        border: "1px solid var(--stroke, #e5e7eb)",
        background: "var(--surface-solid, #fff)",
        cursor: "pointer",
      }}
    >
      <canvas ref={canvasRef} style={{ borderRadius: 4, display: "block" }} />
      <span style={{ fontSize: 10, color: "var(--ink, #111)" }}>{def.label}</span>
    </button>
  );
}
