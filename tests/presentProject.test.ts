import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPresentDocument } from "@/lib/project/presentProject";
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
});
