"use client";

import type { ArrowElement, EngineElement } from "@/lib/engine/types";
import { ArrowheadSelect, ArrowheadSizeControl, Section } from "./PanelParts";

export function ArrowSection({
  firstArrow,
  arrows,
  updateElements,
}: {
  firstArrow: ArrowElement;
  arrows: ArrowElement[];
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label: string,
  ) => void;
}) {
  return (
    <>
      <Section>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <ArrowheadSelect
            value={firstArrow.startArrowhead}
            onChange={(v) =>
              updateElements(
                arrows.map((el) => ({ id: el.id, patch: { startArrowhead: v } })),
                "arrow start",
              )
            }
            label="Start"
          />
          <span style={{ color: "#9ca3af", fontSize: 10 }}>→</span>
          <ArrowheadSelect
            value={firstArrow.endArrowhead}
            onChange={(v) =>
              updateElements(
                arrows.map((el) => ({ id: el.id, patch: { endArrowhead: v } })),
                "arrow end",
              )
            }
            label="End"
          />
        </div>
      </Section>
      <Section>
        <ArrowheadSizeControl arrow={firstArrow} arrows={arrows} />
      </Section>
    </>
  );
}
