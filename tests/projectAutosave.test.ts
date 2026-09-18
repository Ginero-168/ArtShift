import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyEngineDoc } from "@/lib/engine/store";
import type { EngineDoc } from "@/lib/engine/types";
import { createProjectAutosave } from "@/lib/project/projectAutosave";
import type { ProjectSaveResult } from "@/lib/project/projectStore";

function doc(title: string, updatedAt: number): EngineDoc {
  const next = createEmptyEngineDoc(title);
  next.title = title;
  next.updatedAt = updatedAt;
  return next;
}

describe("project autosave behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the current engine document at write time, not a stale debounce snapshot", async () => {
    vi.useFakeTimers();
    let current = doc("first", 1);
    const writes: string[] = [];
    const autosave = createProjectAutosave({
      delayMs: 500,
      getDoc: () => current,
      save: async (_id, snapshot) => {
        writes.push(snapshot.title);
        return { ok: true, savedAt: snapshot.updatedAt };
      },
    });

    autosave.schedule("project-1");
    current = doc("second", 2);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(writes).toEqual(["second"]);
  });

  it("serializes overlapping writes so an older in-flight save cannot finish last", async () => {
    let current = doc("older", 10);
    const writeOrder: string[] = [];
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let started = 0;
    const autosave = createProjectAutosave({
      delayMs: 0,
      getDoc: () => current,
      save: async (_id, snapshot) => {
        started += 1;
        if (started === 1) await firstGate;
        writeOrder.push(snapshot.title);
        return { ok: true, savedAt: snapshot.updatedAt };
      },
    });

    const first = autosave.flush("project-1");
    await Promise.resolve();
    current = doc("newer", 20);
    const second = autosave.flush("project-1");
    releaseFirst();
    await Promise.all([first, second]);

    expect(writeOrder[0]).toBe("older");
    expect(writeOrder.at(-1)).toBe("newer");
  });

  it("does not report saved when persist returns ok:false", async () => {
    const statuses: string[] = [];
    const errors: Array<string | null> = [];
    const autosave = createProjectAutosave({
      getDoc: () => doc("failing", 3),
      save: async () => ({ ok: false, message: "quota exceeded" }) satisfies ProjectSaveResult,
      onStatus: (status, error) => {
        statuses.push(status);
        errors.push(error);
      },
    });

    const result = await autosave.flush("project-1");

    expect(result).toEqual({ ok: false, message: "quota exceeded" });
    expect(statuses).not.toContain("saved");
    expect(statuses.at(-1)).toBe("error");
    expect(errors.at(-1)).toBe("quota exceeded");
  });

  it("flushes a pending debounced save on beforeunload", async () => {
    vi.useFakeTimers();
    const writes: number[] = [];
    const current = doc("pending", 11);
    const autosave = createProjectAutosave({
      delayMs: 500,
      getDoc: () => current,
      save: async (_id, snapshot) => {
        writes.push(snapshot.updatedAt);
        return { ok: true, savedAt: snapshot.updatedAt };
      },
    });

    autosave.schedule("project-1");
    const event = {
      preventDefault: vi.fn(),
      returnValue: "",
    } as unknown as BeforeUnloadEvent;
    autosave.handlePageLeave("project-1", event);
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(writes).toEqual([11]);
  });
});
