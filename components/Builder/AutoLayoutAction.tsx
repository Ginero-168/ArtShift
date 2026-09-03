"use client";

import { useState } from "react";
import { useEngine } from "@/lib/engine/store";
import styles from "./AutoLayoutAction.module.css";

/** Local, deterministic Smart Arrange; it previews before changing the Artwork. */
export default function AutoLayoutAction() {
  const [open, setOpen] = useState(false);
  const [includeDecorations, setIncludeDecorations] = useState(false);
  const [scope, setScope] = useState<"selected" | "slide">("slide");
  const [goal, setGoal] = useState<"hierarchy" | "fill" | "fix-overlap">("hierarchy");
  const [density, setDensity] = useState<"compact" | "comfortable" | "airy">("comfortable");
  const preview = useEngine((state) => state.smartArrangePreview);
  const previewSmartArrange = useEngine((state) => state.previewSmartArrange);
  const applySmartArrange = useEngine((state) => state.applySmartArrange);
  const cancelSmartArrange = useEngine((state) => state.cancelSmartArrange);

  function arrange() {
    previewSmartArrange({ includeDecorations, scope, goal, density });
    setOpen(true);
  }

  return (
    <div className={styles.wrapper}>
      <button
        className={`${styles.action} ${preview ? styles.actionActive : ""}`}
        type="button"
        onClick={() => (preview ? setOpen(true) : arrange())}
        title="Preview a deterministic Smart Arrange"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true" className={styles.icon}>
          ✦
        </span>
        Smart Arrange
        <small>{preview ? "PREVIEW" : "LOCAL"}</small>
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label="Smart Arrange">
          <strong>Smart Arrange</strong>
          <p>Preview first. Locked, hidden, and decorative objects stay protected by default.</p>
          <label>
            Scope
            <select
              aria-label="Smart Arrange scope"
              value={scope}
              onChange={(event) => setScope(event.currentTarget.value as typeof scope)}
            >
              <option value="slide">Current slide</option>
              <option value="selected">Selected objects</option>
            </select>
          </label>
          <label>
            Goal
            <select
              aria-label="Smart Arrange goal"
              value={goal}
              onChange={(event) => setGoal(event.currentTarget.value as typeof goal)}
            >
              <option value="hierarchy">Hierarchy</option>
              <option value="fill">Fill canvas</option>
              <option value="fix-overlap">Fix overlaps</option>
            </select>
          </label>
          <label>
            Density
            <select
              aria-label="Smart Arrange density"
              value={density}
              onChange={(event) => setDensity(event.currentTarget.value as typeof density)}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="airy">Airy</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeDecorations}
              onChange={(event) => setIncludeDecorations(event.currentTarget.checked)}
            />{" "}
            Include decorative shapes
          </label>
          <div className={styles.popoverActions}>
            <button type="button" onClick={arrange}>
              Refresh preview
            </button>
            <button
              type="button"
              onClick={() => {
                applySmartArrange();
                setOpen(false);
              }}
              disabled={!preview}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                cancelSmartArrange();
                setOpen(false);
              }}
              disabled={!preview}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
