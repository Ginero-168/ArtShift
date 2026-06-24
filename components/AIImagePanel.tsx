"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}

export default function AIImagePanel({ onClose, onInsert }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ thumb: string; full: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/stock?source=unsplash&query=${encodeURIComponent(query)}&per_page=6`,
      );
      const data = await res.json();
      if (data.results) {
        setResults(
          data.results.map((r: any) => ({
            thumb: r.urls?.thumb || r.urls?.small,
            full: r.urls?.regular || r.urls?.full,
          })),
        );
      } else {
        setError("No results");
      }
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function pick(url: string) {
    setLoading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        onInsert(reader.result as string);
        setLoading(false);
      };
      reader.readAsDataURL(blob);
    } catch {
      setError("Failed to load image");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 34,
        left: 0,
        width: 220,
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 9,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
        padding: 10,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 4 }}>
        <input
          id="ai-image-prompt"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search images..."
          style={{
            flex: 1,
            padding: "5px 8px",
            borderRadius: 5,
            border: "1px solid var(--stroke, #e5e7eb)",
            fontSize: 11,
            outline: "none",
          }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{
            padding: "5px 8px",
            borderRadius: 5,
            border: "none",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            fontSize: 11,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Go"}
        </button>
      </div>

      {error && <div style={{ fontSize: 10, color: "#dc2626" }}>{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          maxHeight: 200,
          overflow: "auto",
        }}
      >
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => pick(r.full)}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <img
              src={r.thumb}
              alt=""
              style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }}
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
