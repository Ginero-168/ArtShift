import { describe, expect, it } from "vitest";
import { createImage } from "@/lib/engine/factory";
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
    expect(importedRecord!.files["asset-123"]).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    );
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

  it("serializes overlapping saves and keeps the newest document", async () => {
    const store = createTestProjectStore();
    const project = await store.createProject({ name: "Race" });
    const base = (await store.loadProjectDocument(project.id))!.doc;
    const older = {
      ...base,
      title: "older revision",
      slides: [...base.slides],
      updatedAt: base.updatedAt + 10,
    };
    const newer = {
      ...base,
      title: "newer revision",
      slides: [...base.slides],
      updatedAt: base.updatedAt + 20,
    };

    const first = store.saveProjectDocument(project.id, older);
    const second = store.saveProjectDocument(project.id, newer);
    await Promise.all([first, second]);

    const loaded = await store.loadProjectDocument(project.id);
    expect(loaded!.doc.title).toBe("newer revision");
    expect(loaded!.doc.updatedAt).toBe(newer.updatedAt);
  });

  it("rejects a stale document so it cannot overwrite a newer saved revision", async () => {
    const store = createTestProjectStore();
    const project = await store.createProject({ name: "Stale" });
    const base = (await store.loadProjectDocument(project.id))!.doc;
    const newer = {
      ...base,
      title: "kept",
      slides: [...base.slides],
      updatedAt: base.updatedAt + 50,
    };
    const older = {
      ...base,
      title: "stale",
      slides: [...base.slides],
      updatedAt: base.updatedAt + 10,
    };

    const newest = await store.saveProjectDocument(project.id, newer);
    expect(newest.ok).toBe(true);
    const stale = await store.saveProjectDocument(project.id, older);
    expect(stale.ok).toBe(true);

    const loaded = await store.loadProjectDocument(project.id);
    expect(loaded!.doc.title).toBe("kept");
    expect(loaded!.doc.updatedAt).toBe(newer.updatedAt);
  });

  it("fails save with an error status when a live image binary is missing", async () => {
    const store = createTestProjectStore();
    const project = await store.createProject({ name: "Needs images" });
    const doc = (await store.loadProjectDocument(project.id))!.doc;
    doc.slides[0].elements.push(
      createImage({
        x: 0,
        y: 0,
        width: 80,
        height: 80,
        fileId: "not-in-files-map",
        naturalWidth: 80,
        naturalHeight: 80,
      }),
    );

    const result = await store.saveProjectDocument(project.id, doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/missing image data/);
    }
  });
});
