"use client";

import type { ImageElement } from "@/lib/engine/types";
import { Section } from "./PanelParts";

export function ImageSection({
  firstImage,
  croppingImageId,
  setCroppingImageId,
}: {
  firstImage: ImageElement;
  croppingImageId: string | null;
  setCroppingImageId: (id: string | null) => void;
}) {
  return (
    <Section>
      <button
        onClick={() => setCroppingImageId(croppingImageId === firstImage.id ? null : firstImage.id)}
        style={{
          padding: "4px 10px",
          borderRadius: 5,
          border: "1px solid var(--stroke, #eae6e1)",
          background:
            croppingImageId === firstImage.id
              ? "var(--accent, #d64418)"
              : "var(--surface-solid, #fff)",
          color: croppingImageId === firstImage.id ? "#fff" : "var(--ink, #111)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {croppingImageId === firstImage.id ? "Done" : "Crop"}
      </button>
    </Section>
  );
}
