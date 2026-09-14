import { describe, expect, it } from "vitest";
import { createEmptyEngineDoc } from "@/lib/engine/store";
import { createTestProjectStore, type ProjectMetadata } from "@/lib/project/projectStore";

describe("Multi-Project Store & Local Isolation", () => {
  it("creates multiple distinct projects with isolated documents", async () => {
    const store = createTestProjectStore();

    const p1 = await store.createProject({ name: "Project Alpha", ownerKey: "user-1" });
    const p2 = await store.createProject({ name: "Project Beta", ownerKey: "user-1" });

    expect(p1.id).not.toBe(p2.id);
    expect(p1.name).toBe("Project Alpha");
    expect(p2.name).toBe("Project Beta");

    // Load Project 1
    const docRecord1 = await store.loadProjectDocument(p1.id);
    expect(docRecord1).not.toBeNull();
    expect(docRecord1!.doc.title).toBe("Project Alpha");

    // Modify Project 1 by adding a slide
    const doc1 = docRecord1!.doc;
    doc1.slides.push({
      id: "slide-2",
      name: "Slide 2",
      background: "#000000",
      elements: [],
      layers: [],
      width: 1920,
      height: 1080,
    });
    doc1.updatedAt = Date.now() + 100;
    await store.saveProjectDocument(p1.id, doc1);

    // Verify Project 1 has 2 slides now
    const reloaded1 = await store.loadProjectDocument(p1.id);
    expect(reloaded1!.doc.slides.length).toBe(2);

    // Verify Project 2 is unaffected and still has 1 slide
    const docRecord2 = await store.loadProjectDocument(p2.id);
    expect(docRecord2).not.toBeNull();
    expect(docRecord2!.doc.slides.length).toBe(1);
    expect(docRecord2!.doc.title).toBe("Project Beta");
  });

  it("renames a project and keeps metadata in sync with document title", async () => {
    const store = createTestProjectStore();
    const p = await store.createProject({ name: "Initial Name" });

    await store.renameProject(p.id, "Renamed Presentation 2026");
    const meta = await store.getProject(p.id);
    expect(meta?.name).toBe("Renamed Presentation 2026");

    const docRecord = await store.loadProjectDocument(p.id);
    expect(docRecord?.doc.title).toBe("Renamed Presentation 2026");
  });

  it("handles empty name fallback to 'Untitled Project'", async () => {
    const store = createTestProjectStore();
    const p = await store.createProject({ name: "   " });
    expect(p.name).toBe("Untitled Project");

    await store.renameProject(p.id, "");
    const meta = await store.getProject(p.id);
    expect(meta?.name).toBe("Untitled Project");
  });

  it("deletes a project and its document", async () => {
    const store = createTestProjectStore();
    const p = await store.createProject({ name: "Temporary Project" });

    const before = await store.listProjects();
    expect(before.some((item) => item.id === p.id)).toBe(true);

    await store.deleteProject(p.id);

    const after = await store.listProjects();
    expect(after.some((item) => item.id === p.id)).toBe(false);
    expect(await store.loadProjectDocument(p.id)).toBeNull();
  });

  it("exports a project as JSON archive and imports it into a new project", async () => {
    const store = createTestProjectStore();

    // Create project with custom slide background and asset
    const customDoc = createEmptyEngineDoc("Original Masterpiece");
    customDoc.slides[0].background = "#ff0077";
    const p = await store.createProject({
      name: "Original Masterpiece",
      doc: customDoc,
      files: { "asset-123": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" },
    });

    const exportedJson = await store.exportProject(p.id);
    expect(exportedJson).toContain("artshift-project-v1");
    expect(exportedJson).toContain("Original Masterpiece");
    expect(exportedJson).toContain("asset-123");

    // Import into the same store
    const importedMeta = await store.importProject(exportedJson, "user-2");
    expect(importedMeta.id).not.toBe(p.id); // distinct UUID
    expect(importedMeta.name).toBe("Original Masterpiece");

    const importedRecord = await store.loadProjectDocument(importedMeta.id);
    expect(importedRecord).not.toBeNull();
    expect(importedRecord!.doc.slides[0].background).toBe("#ff0077");
    expect(importedRecord!.files["asset-123"]).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
  });

  it("exports all projects into a single archive", async () => {
    const store = createTestProjectStore();
    await store.createProject({ name: "Deck A" });
    await store.createProject({ name: "Deck B" });

    const bundleJson = await store.exportAllProjects();
    expect(bundleJson).toContain("artshift-all-projects-v1");
    expect(bundleJson).toContain("Deck A");
    expect(bundleJson).toContain("Deck B");
  });
});
