"use client";

import type { EngineElement } from "@/lib/engine/types";
import { Section } from "./PanelParts";

export function OpacitySection({
  first,
  apply,
}: {
  first: EngineElement;
  apply: (patch: Partial<EngineElement>, label: string) => void;
}) {
  return (
    <Section>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(first.opacity * 100)}
          onChange={(e) => apply({ opacity: Number(e.currentTarget.value) / 100 }, "opacity")}
          style={{ width: 60, accentColor: "var(--accent, #6366f1)" }}
        />
        <span style={{ color: "#9ca3af", fontSize: 9, minWidth: 16, textAlign: "right" }}>
          {Math.round(first.opacity * 100)}
        </span>
      </div>
    </Section>
  );
}
