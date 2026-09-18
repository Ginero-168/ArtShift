"use client";

import type { EngineDoc } from "@/lib/engine/types";
import type { ProjectSaveResult } from "@/lib/project/projectStore";

export type ProjectAutosaveStatus = "saving" | "saved" | "error";

export type ProjectAutosaveOptions = {
  getDoc: () => EngineDoc;
  save: (projectId: string, doc: EngineDoc) => Promise<ProjectSaveResult>;
  onStatus?: (status: ProjectAutosaveStatus, error: string | null) => void;
  delayMs?: number;
};

/**
 * Debounced, serialized project autosave.
 *
 * The debounce timer is only a UI coalescer. Actual IndexedDB writes are queued
 * so an in-flight older save cannot finish after a newer one. Each queued write
 * reads `getDoc()` at write time so the persisted snapshot is the current
 * engine document, not a stale closure.
 */
export function createProjectAutosave(options: ProjectAutosaveOptions) {
  const delayMs = options.delayMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<ProjectSaveResult> = Promise.resolve({ ok: true, savedAt: 0 });
  let lastPersistedUpdatedAt: number | null = null;
  let pending = false;
  let inFlight = 0;
  let disposed = false;

  function setStatus(status: ProjectAutosaveStatus, error: string | null = null) {
    options.onStatus?.(status, error);
  }

  function schedule(projectId: string) {
    if (disposed || !projectId) return;
    pending = true;
    setStatus("saving");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush(projectId);
    }, delayMs);
  }

  function flush(projectId: string): Promise<ProjectSaveResult> {
    if (disposed || !projectId) {
      return Promise.resolve({ ok: false, message: "Autosave is not available." });
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = false;
    const operation = queue.then(async () => persistCurrent(projectId));
    queue = operation.catch((error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to save project document.";
      setStatus("error", message);
      return { ok: false as const, message };
    });
    return operation;
  }

  async function persistCurrent(projectId: string): Promise<ProjectSaveResult> {
    inFlight += 1;
    try {
      const doc = options.getDoc();
      if (lastPersistedUpdatedAt === doc.updatedAt) {
        setStatus("saved");
        return { ok: true, savedAt: lastPersistedUpdatedAt };
      }
      setStatus("saving");
      const result = await options.save(projectId, doc);
      if (result.ok) {
        lastPersistedUpdatedAt = doc.updatedAt;
        setStatus("saved");
      } else {
        setStatus("error", result.message);
      }
      return result;
    } finally {
      inFlight = Math.max(0, inFlight - 1);
    }
  }

  function hasPendingWork() {
    return pending || timer !== null || inFlight > 0;
  }

  function handlePageLeave(projectId: string, event?: BeforeUnloadEvent) {
    if (disposed || !projectId || !hasPendingWork()) return;
    event?.preventDefault();
    if (event) event.returnValue = "";
    void flush(projectId);
  }

  function markPersisted(updatedAt: number) {
    lastPersistedUpdatedAt = updatedAt;
  }

  function dispose() {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    pending = false;
  }

  return {
    schedule,
    flush,
    handlePageLeave,
    markPersisted,
    dispose,
    hasPendingWork,
  };
}
