"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@/components/icons";
import { type MoodboardProgress, runMoodboardAiBatch } from "@/lib/moodboard/aiBatchClient";
import {
  MOODBOARD_BATCH_COUNTS,
  MOODBOARD_DEFAULT_BATCH_COUNT,
  MOODBOARD_IMAGE_QUALITY,
  MOODBOARD_PER_IMAGE_USD,
  MOODBOARD_REPLICATE_MODEL,
  type MoodboardBatchCount,
  moodboardBatchUsd,
  moodboardGridSide,
} from "@/lib/moodboard/constants";
import styles from "./MoodboardControl.module.css";

const EXPANDED_STORAGE_KEY = "artshift:moodboard:controls-expanded";

function readExpandedPreference(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeExpandedPreference(expanded: boolean) {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // Ignore private-mode storage failures; the in-memory toggle still works.
  }
}

/**
 * Moodboard control for Infinity Canvas.
 * Gemini Flash expands a vibe into 9, 16, or 25 ideas, then Flare low
 * fills a square grid anchored on the shared Preload card.
 * Collapsed by default into one toolbar row; expanded is a horizontal strip.
 */
export default function MoodboardControl() {
  const [keyword, setKeyword] = useState("");
  const [count, setCount] = useState<MoodboardBatchCount>(MOODBOARD_DEFAULT_BATCH_COUNT);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MoodboardProgress | null>(null);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnExpandRef = useRef(false);
  const side = moodboardGridSide(count);
  const batchUsd = moodboardBatchUsd(count);
  const modelLabel = MOODBOARD_REPLICATE_MODEL.split("/")[1] ?? MOODBOARD_REPLICATE_MODEL;
  const priceLabel = `≈ $${batchUsd.toFixed(2)}`;
  const costLabel = `${priceLabel} · ${modelLabel} ${MOODBOARD_IMAGE_QUALITY}`;
  const trimmedKeyword = keyword.trim();
  const summary = trimmedKeyword
    ? `${trimmedKeyword} · ${side}×${side} · ${priceLabel}`
    : `Prompt or keyword · ${side}×${side} · ${priceLabel}`;
  const showProgress = busy && progress !== null && progress.stage !== "idle";
  const showStatus = showProgress || (!busy && status.length > 0);

  useEffect(() => {
    setExpanded(readExpandedPreference());
  }, []);

  useEffect(() => {
    if (!expanded || !focusOnExpandRef.current) return;
    focusOnExpandRef.current = false;
    inputRef.current?.focus();
  }, [expanded]);

  function setExpandedPersisted(next: boolean) {
    setExpanded(next);
    writeExpandedPreference(next);
  }

  function openPanel() {
    focusOnExpandRef.current = true;
    setExpandedPersisted(true);
  }

  async function runAi() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("");
    setProgress(null);
    try {
      const result = await runMoodboardAiBatch(keyword, {
        count,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (result.ok) {
        const failNote = result.failed > 0 ? ` · ${result.failed} failed` : "";
        setStatus(
          `AI: placed ${result.placed}/${result.count} via ${result.model} (~$${result.estimatedUsd.toFixed(2)})${failNote}`,
        );
      } else {
        setStatus(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.slot} data-expanded={expanded ? "true" : "false"}>
      <div
        data-moodboard-control="true"
        data-expanded={expanded ? "true" : "false"}
        data-busy={busy ? "true" : "false"}
        role="region"
        aria-label="Moodboard"
        className={styles.bar}
      >
        <div className={styles.primary}>
          <strong className={styles.title}>Moodboard</strong>
          {expanded ? (
            <input
              ref={inputRef}
              id="moodboard-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void runAi();
                }
              }}
              placeholder="Prompt, keyword, or vibe…"
              disabled={busy}
              aria-label="Moodboard prompt"
              className={styles.keyword}
            />
          ) : (
            <button
              type="button"
              className={styles.summary}
              data-empty={trimmedKeyword ? "false" : "true"}
              title={summary}
              onClick={openPanel}
            >
              {summary}
            </button>
          )}
          {expanded ? (
            <fieldset className={styles.counts}>
              <legend className={styles.legend}>Image count</legend>
              {MOODBOARD_BATCH_COUNTS.map((option) => {
                const optionSide = moodboardGridSide(option);
                const selected = count === option;
                return (
                  <label
                    key={option}
                    className={styles.pill}
                    data-selected={selected ? "true" : "false"}
                  >
                    <input
                      type="radio"
                      name="moodboard-batch-count"
                      value={option}
                      checked={selected}
                      disabled={busy}
                      onChange={() => setCount(option)}
                    />
                    {option}
                    <span className={styles.grid}>
                      {optionSide}×{optionSide}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className={styles.trailing}>
            {expanded ? (
              <span className={styles.cost} title={costTitle(count, batchUsd)}>
                {costLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void runAi()}
              disabled={busy || !trimmedKeyword}
              className={`${styles.button} ${styles.ai}`}
              title={`Expand ideas → ${count} ${MOODBOARD_REPLICATE_MODEL} images at quality ${MOODBOARD_IMAGE_QUALITY} (~$${MOODBOARD_PER_IMAGE_USD} each, ~$${batchUsd.toFixed(2)} total)`}
            >
              {busy ? `AI ×${count}…` : `AI ×${count}`}
            </button>
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className={`${styles.button} ${styles.cancel}`}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              onClick={() => (expanded ? setExpandedPersisted(false) : openPanel())}
            >
              <IconChevronDown size={14} className={styles.toggleIcon} aria-hidden="true" />
              <span className={styles.legend}>
                {expanded ? "Collapse Moodboard controls" : "Expand Moodboard controls"}
              </span>
            </button>
          </div>
        </div>

        {showStatus ? (
          <div className={styles.status} aria-live="polite">
            {busy && progress && progress.stage !== "idle" ? (
              <>
                <div className={styles.statusText} title={progress.message}>
                  {progress.message}
                </div>
                {progress.total > 0 && progress.stage === "generate" ? (
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      data-failed={progress.failed > 0 ? "true" : "false"}
                      style={{
                        width: `${Math.min(100, ((progress.completed + progress.failed) / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                ) : null}
                {progress.errors.length > 0 ? (
                  <ul className={styles.errors}>
                    {progress.errors.slice(0, 4).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                    {progress.errors.length > 4 ? (
                      <li>+{progress.errors.length - 4} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            ) : null}
            {!busy && status ? <div className={styles.statusText}>{status}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function costTitle(count: MoodboardBatchCount, batchUsd: number): string {
  return `${count} images · ${MOODBOARD_REPLICATE_MODEL} · quality ${MOODBOARD_IMAGE_QUALITY} · $${MOODBOARD_PER_IMAGE_USD} each · ~$${batchUsd.toFixed(2)} total`;
}
