"use client";

import { useSyncExternalStore } from "react";
import type { EditorInteractionSnapshot } from "@/lib/perf/editorTelemetry";
import { getEditorInteractionSnapshot, subscribeEditorTelemetry } from "@/lib/perf/editorTelemetry";
import type { RasterTelemetrySnapshot } from "@/lib/raster/telemetry";
import { getRasterTelemetrySnapshot, subscribeRasterTelemetry } from "@/lib/raster/telemetry";

const EMPTY_SNAPSHOT: RasterTelemetrySnapshot = {};
const EMPTY_EDITOR_SNAPSHOT: EditorInteractionSnapshot = {} as EditorInteractionSnapshot;

/** Opt-in developer HUD: append ?perf=1 to inspect Worker/API raster timings. */
export default function RasterPerformanceOverlay() {
  const snapshot = useSyncExternalStore<RasterTelemetrySnapshot>(
    subscribeRasterTelemetry,
    getRasterTelemetrySnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const editorSnapshot = useSyncExternalStore<EditorInteractionSnapshot>(
    subscribeEditorTelemetry,
    getEditorInteractionSnapshot,
    () => EMPTY_EDITOR_SNAPSHOT,
  );
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("perf")) {
    return null;
  }
  const entries = Object.entries(snapshot);
  const editorEntries = Object.entries(editorSnapshot);
  if (!entries.length && !editorEntries.length) return null;
  return (
    <div
      role="status"
      aria-label="Raster performance"
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 80,
        padding: "6px 8px",
        border: "1px solid rgba(15, 23, 42, 0.16)",
        borderRadius: 6,
        background: "rgba(255,255,255,0.92)",
        color: "#334155",
        font: "10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
        pointerEvents: "none",
      }}
    >
      {entries.map(([kind, stats]) => (
        <div key={kind}>
          {kind} p95 {stats.p95Ms.toFixed(1)}ms · last {stats.lastMs.toFixed(1)}ms
          {stats.failures ? ` · errors ${stats.failures}` : ""}
        </div>
      ))}
      {editorEntries.map(([kind, stats]) => (
        <div key={kind}>
          {kind} dispatch p95 {stats.p95Ms.toFixed(1)}ms · last {stats.lastMs.toFixed(1)}ms
        </div>
      ))}
    </div>
  );
}
