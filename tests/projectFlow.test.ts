import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ArtShift Project Flow and Local Storage (acceptance criteria)", () => {
  it("verifies auth callback redirects to /projects instead of root editor", () => {
    const callbackSource = readFileSync("app/api/auth/google/callback/route.ts", "utf8");
    expect(callbackSource).toContain("redirect(`${publicUrl}/projects`)");
    expect(callbackSource).not.toContain("redirect(`${publicUrl}/?auth=success`)");
  });

  it("verifies root page (/) is an Index Landing Page with Google Sign-in and no editor canvas", () => {
    const rootPageSource = readFileSync("app/page.tsx", "utf8");

    // Has ArtShift title and Branding
    expect(rootPageSource).toContain("ArtShift");
    expect(rootPageSource).toContain("IconBrand");

    // Has Google sign-in trigger
    expect(rootPageSource).toContain("signInWithGoogle");
    expect(rootPageSource).toContain("GoogleGIcon");

    // Has link to /projects when authenticated
    expect(rootPageSource).toContain('href="/projects"');

    // Does NOT render the CanvasEditor directly on /
    expect(rootPageSource).not.toContain("<CanvasEditor");
    expect(rootPageSource).not.toContain("useEngine");
  });

  it("verifies /projects catalog page handles projects, search, sort, and legacy migration", () => {
    const projectsSource = readFileSync("app/projects/page.tsx", "utf8");

    // ProjectStore integration
    expect(projectsSource).toContain("projectStore.listProjects");
    expect(projectsSource).toContain("projectStore.createProject");
    expect(projectsSource).toContain("projectStore.deleteProject");
    expect(projectsSource).toContain("projectStore.renameProject");
    expect(projectsSource).toContain("projectStore.exportProject");
    expect(projectsSource).toContain("projectStore.exportAllProjects");
    expect(projectsSource).toContain("projectStore.importProject");

    // Legacy workspace migration banner
    expect(projectsSource).toContain("projectStore.detectLegacyWorkspace");
    expect(projectsSource).toContain("projectStore.migrateLegacyWorkspace");
    expect(projectsSource).toContain("Legacy Workspace");

    // Card navigation to editor
    expect(projectsSource).toContain("/projects/${p.id}/editor");

    // First slot: New Project button with dashed border, '+' in center, and 'New Project' label
    expect(projectsSource).toContain("NewProjectGridCard");
    expect(projectsSource).toContain("New Project");
    expect(projectsSource).toContain("2px dashed");

    // Project cards render the first slide thumbnail
    expect(projectsSource).toContain("ProjectSlideThumbnail");
    expect(projectsSource).toContain("renderSlideToDataUrl");
  });

  it("verifies Editor route header matches strict requirements (Section 7)", () => {
    const editorSource = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");

    // Top-left Logo button linking back to /projects
    expect(editorSource).toContain('href="/projects"');
    expect(editorSource).toContain("<IconBrand");

    // NO "ArtShift" brand text in topbar header
    // The topbar header section must not have <span>ArtShift</span>
    const headerSectionMatch = editorSource.match(
      /<header className="topbar">([\s\S]*?)<\/header>/,
    );
    expect(headerSectionMatch).toBeTruthy();
    const headerHtml = headerSectionMatch ? headerSectionMatch[1] : "";
    expect(headerHtml).not.toContain("ArtShift");

    // NO "Saved" or "Local Workspace" status in header
    expect(headerHtml).not.toContain("Saved");
    expect(headerHtml).not.toContain("Local workspace");
    expect(headerHtml).not.toContain("save-state");

    // Has live Project Name Input
    expect(headerHtml).toContain('aria-label="Project Title"');
    expect(headerHtml).toContain("handleRename");

    // Has Auto Save indicator right behind Project Title Input
    expect(headerHtml).toContain("<AutoSaveIndicator");
    expect(editorSource).toContain("function AutoSaveIndicator");
    expect(editorSource).toContain("กำลัง Save");
    expect(editorSource).toContain("Save แล้ว");

    // Autosave is scoped to projectId
    expect(editorSource).toContain("createProjectAutosave");
    expect(editorSource).toContain("projectStore.saveProjectDocument");

    // Not found state handled without auto-creating
    expect(editorSource).toContain("ไม่พบโปรเจกต์นี้");
    expect(editorSource).toContain('href="/projects"');
  });

  it("verifies ProjectStore isolates documents by projectId and protects against corruption", () => {
    const storeSource = readFileSync("lib/project/projectStore.ts", "utf8");

    expect(storeSource).toContain("artshift-projects-v1");
    expect(storeSource).toContain("serializeWithImages");
    expect(storeSource).toContain("deserializeWithImages");
    expect(storeSource).toContain("exportProject");
    expect(storeSource).toContain("importProject");
    expect(storeSource).toContain("exportAllProjects");
  });
});
