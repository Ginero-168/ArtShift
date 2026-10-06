import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leavePresent,
  loadPresentDocument,
  presentHref,
  presentSlideIndex,
} from "@/lib/project/presentProject";
import { createTestProjectStore } from "@/lib/project/projectStore";

describe("present project loader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty when no projects exist", async () => {
    const store = createTestProjectStore();
    await expect(loadPresentDocument(store)).resolves.toEqual({ status: "empty" });
  });

  it("loads an explicit projectId and hydrates the document", async () => {
    const store = createTestProjectStore();
    const created = await store.createProject({ name: "Pitch deck" });
    const result = await loadPresentDocument(store, created.id);
    expect(result).toMatchObject({
      status: "loaded",
      projectId: created.id,
    });
    if (result.status === "loaded") {
      expect(result.doc.title).toBe("Pitch deck");
      expect(result.doc.slides.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the last-opened project", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    const store = createTestProjectStore();
    await store.createProject({ name: "Older" });
    vi.setSystemTime(new Date("2026-09-01T00:00:01Z"));
    const latest = await store.createProject({ name: "Newer" });
    const result = await loadPresentDocument(store);
    expect(result).toMatchObject({ status: "loaded", projectId: latest.id });
  });

  it("reports missing ids instead of loading the wrong project", async () => {
    const store = createTestProjectStore();
    await store.createProject({ name: "Exists" });
    await expect(loadPresentDocument(store, "missing-id")).resolves.toEqual({
      status: "missing",
      projectId: "missing-id",
    });
  });

  it("builds a present url for the open project and slide", () => {
    expect(presentHref({ projectId: "proj 1", slideId: "slide/2" })).toBe(
      "/present?projectId=proj+1&slideId=slide%2F2",
    );
  });

  it("starts present on the requested slide", () => {
    expect(presentSlideIndex([{ id: "a" }, { id: "b" }], "b")).toBe(1);
    expect(presentSlideIndex([{ id: "a" }], "missing")).toBe(0);
    expect(presentSlideIndex([{ id: "a" }], null)).toBe(0);
  });

  it("closes the present tab when the editor opened it", () => {
    const close = vi.fn();
    const go = vi.fn();
    leavePresent({ hasOpener: true, projectId: "p", slideId: "s", close, go });
    expect(close).toHaveBeenCalledOnce();
    expect(go).not.toHaveBeenCalled();
  });

  it("returns to the editor slide when present has no opener", () => {
    const close = vi.fn();
    const go = vi.fn();
    leavePresent({ hasOpener: false, projectId: "p", slideId: "s", close, go });
    expect(close).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith("/projects/p/editor?slideId=s");
  });
});
