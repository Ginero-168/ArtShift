"use client";

import { useState } from "react";
import { computeVisionAware603010AutoLayout } from "@/lib/engine/autoLayout603010";
import { useEngine } from "@/lib/engine/store";
import styles from "./AutoLayoutAction.module.css";

export default function AutoLayoutAction() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const updateElements = useEngine((state) => state.updateElements);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!slide) return null;

  async function handleAutoLayout() {
    if (!slide || busy) return;
    setBusy(true);
    setActive(true);
    try {
      const patches = await computeVisionAware603010AutoLayout(slide);
      if (patches.length > 0) {
        updateElements(patches, "vision auto layout 60/30/10");
      }
    } finally {
      setBusy(false);
      setTimeout(() => setActive(false), 600);
    }
  }

  return (
    <button
      className={`${styles.action} ${active ? styles.actionActive : ""}`}
      type="button"
      disabled={busy}
      onClick={handleAutoLayout}
      title="Vision AI Auto Layout: Organizes workspace following the 60/30/10 visual hierarchy rule (Top-Right to Bottom-Left)"
    >
      <span aria-hidden="true" className={styles.icon}>
        ✦
      </span>
      {busy ? "Analyzing..." : "Auto Layout"}
      <small>60/30/10</small>
    </button>
  );
}
