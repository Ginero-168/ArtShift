"use client";

/**
 * /projects — Project Catalog / Dashboard.
 *
 * Requirements:
 * - Protected route (redirects to / if unauthenticated)
 * - Lists projects stored on the signed-in Google account
 * - "New Project" button (creates UUID project and navigates to editor)
 * - Project Cards with title, slide count, last updated timestamp, actions
 * - Rename & Delete (with confirmation dialog)
 * - Import .artshift project file
 * - Export .artshift project file & Export All backup
 * - Legacy workspace migration banner
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProfileMenu from "@/components/Auth/ProfileMenu";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import {
  IconBrand,
  IconClose,
  IconDownload,
  IconPenEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@/components/icons";
import { useAuth } from "@/lib/auth/useAuth";
import { type ProjectMetadata, projectStore } from "@/lib/project/projectStore";
import { renderSlideToDataUrl } from "@/lib/renderer/thumbnail";

function NewProjectGridCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="catalog-new"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="catalog-new-mark">
        <IconPlus size={24} />
      </div>
      <span className="catalog-new-label">New Project</span>
    </div>
  );
}

function ProjectSlideThumbnail({ project }: { project: ProjectMetadata }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(project.thumbnail || null);

  useEffect(() => {
    if (project.thumbnail) {
      setThumbUrl(project.thumbnail);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const record = await projectStore.getProjectDocument(project.id);
        if (!isMounted || !record?.doc?.slides?.[0]) return;

        const firstSlide = record.doc.slides[0];
        const dataUrl = await renderSlideToDataUrl(firstSlide, record.files, 480);
        if (!isMounted) return;

        if (dataUrl) {
          setThumbUrl(dataUrl);
          void projectStore.updateProjectThumbnail(project.id, dataUrl);
        }
      } catch (err) {
        console.warn("Failed to render project slide thumbnail:", err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [project.id, project.thumbnail]);

  if (thumbUrl) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 12px",
          boxSizing: "border-box",
        }}
      >
        <img
          src={thumbUrl}
          alt={project.name}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 4,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
            border: "1px solid rgba(0, 0, 0, 0.06)",
            background: "#ffffff",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 120,
          height: 68,
          background: "#ffffff",
          borderRadius: 6,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          border: "1px solid #ece7e0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#a7a198",
        }}
      >
        <IconBrand />
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "createdAt">("updatedAt");
  const [hasLegacy, setHasLegacy] = useState(false);
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<ProjectMetadata | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectMetadata | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace(`/?returnTo=${encodeURIComponent("/projects")}`);
    }
  }, [authLoading, authenticated, router]);

  // Load project list
  const refreshProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      const list = await projectStore.listProjects();
      setProjects(list);
    } catch {
      setActionError("โหลดโปรเจกต์จากบัญชีไม่สำเร็จ");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated || !user?.id) return;
    void (async () => {
      await refreshProjects();
      const legacyDoc = await projectStore.detectLegacyWorkspace();
      if (legacyDoc) setHasLegacy(true);
    })();
  }, [authenticated, refreshProjects, user?.id]);

  // Filter & Sort
  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "createdAt") {
        return b.createdAt - a.createdAt;
      }
      return b.updatedAt - a.updatedAt;
    });
    return result;
  }, [projects, searchQuery, sortBy]);

  // Create Project
  const handleCreateProject = async () => {
    try {
      const newMeta = await projectStore.createProject({
        name: "Untitled Project",
        ownerKey: user?.id ?? "local-default",
      });
      router.push(`/projects/${newMeta.id}/editor`);
    } catch {
      setActionError("Could not create project.");
    }
  };

  // Delete Project
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await projectStore.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refreshProjects();
      setActionSuccess("ลบโปรเจกต์เรียบร้อยแล้ว");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      setActionError("ไม่สามารถลบโปรเจกต์ได้");
    }
  };

  // Rename Project
  const handleRenameConfirm = async () => {
    if (!renameTarget) return;
    const finalName = renameInput.trim() || "Untitled Project";
    try {
      await projectStore.renameProject(renameTarget.id, finalName);
      setRenameTarget(null);
      await refreshProjects();
      setActionSuccess("เปลี่ยนชื่อโปรเจกต์เรียบร้อยแล้ว");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      setActionError("ไม่สามารถเปลี่ยนชื่อโปรเจกต์ได้");
    }
  };

  // Single Project Export
  const handleExportProject = async (p: ProjectMetadata) => {
    try {
      const fileContent = await projectStore.exportProject(p.id);
      const blob = new Blob([fileContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.name.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, "_")}.artshift`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("เกิดข้อผิดพลาดในการส่งออกโปรเจกต์");
    }
  };

  // Export All Projects
  const handleExportAll = async () => {
    try {
      const allJson = await projectStore.exportAllProjects();
      const blob = new Blob([allJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `artshift-all-projects-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionSuccess("ส่งออกสำรองข้อมูลทั้งหมดเรียบร้อยแล้ว");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch {
      setActionError("ไม่สามารถส่งออกข้อมูลทั้งหมดได้");
    }
  };

  // Import Single Project File or Backup
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = await projectStore.importProject(text, user?.id ?? "local-default");
      await refreshProjects();
      setActionSuccess(`นำเข้าโปรเจกต์ "${imported.name}" สำเร็จ`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ ไฟล์อาจเสียหายหรือรูปแบบไม่ถูกต้อง",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Migrate Legacy Workspace
  const handleMigrateLegacy = async () => {
    try {
      setIsMigratingLegacy(true);
      const migrated = await projectStore.migrateLegacyWorkspace(user?.id ?? "local-default");
      setHasLegacy(false);
      await refreshProjects();
      if (migrated) {
        setActionSuccess(`นำเข้าผลงานเก่าเป็นโปรเจกต์ "${migrated.name}" สำเร็จ`);
        setTimeout(() => setActionSuccess(null), 4000);
      }
    } catch {
      setActionError("ไม่สามารถนำเข้าผลงานเก่าได้");
    } finally {
      setIsMigratingLegacy(false);
    }
  };

  const handleDismissLegacy = () => {
    projectStore.dismissLegacyMigrationNotice();
    setHasLegacy(false);
  };

  if (authLoading) {
    return (
      <div className="catalog theme-cool catalog-note">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <ArtShiftLogo size="header" />
          <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 500 }}>
            กำลังตรวจสอบข้อมูลผู้ใช้…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="catalog theme-cool">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".artshift,.json,application/json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      {/* Top Navbar */}
      <header className="catalog-bar">
        {/* Brand: wordmark navigates to Index home; PROJECTS is the current-page label */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Link
              href="/"
              aria-label="ArtShift home"
              style={{
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <ArtShiftLogo size="header" />
            </Link>
            <span className="catalog-kicker">PROJECTS</span>
          </div>
        </div>

        {/* Right Actions: + New Project, Import, Export All, Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={secondaryBtnStyle}
            title="นำเข้าโปรเจกต์จากไฟล์ .artshift"
          >
            <IconDownload size={13} />
            <span>นำเข้า (Import)</span>
          </button>

          {projects.length > 0 && (
            <button
              type="button"
              onClick={handleExportAll}
              style={secondaryBtnStyle}
              title="ดาวน์โหลดสำรองข้อมูลโปรเจกต์ทั้งหมด"
            >
              <IconDownload size={13} />
              <span>สำรองทั้งหมด (Export All)</span>
            </button>
          )}

          <button type="button" onClick={handleCreateProject} style={primaryBtnStyle}>
            <IconPlus size={14} color="#ffffff" />
            <span>สร้างโปรเจกต์ใหม่</span>
          </button>

          <div style={{ width: 1, height: 24, background: "#ece7e0", margin: "0 4px" }} />

          <ProfileMenu />
        </div>
      </header>

      {/* Main Container */}
      <main
        style={{ flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "32px 24px" }}
      >
        {/* Legacy Workspace Notice Banner */}
        {hasLegacy && (
          <div
            style={{
              background: "linear-gradient(90deg, #fff3ed 0%, #ffe2d6 100%)",
              border: "1px solid #ffcebb",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              boxShadow: "0 4px 14px rgba(231, 84, 43, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#e7542b",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <IconBrand />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#7a1f02" }}>
                  ตรวจพบผลงานเดิมในระบบ (Legacy Workspace)
                </div>
                <div style={{ fontSize: 12, color: "#e7542b", marginTop: 2 }}>
                  คุณมีชิ้นงานที่เคยบันทึกไว้ ต้องการนำเข้ามาเป็น Project เพื่อแก้ไขต่อในระบบใหม่หรือไม่?
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleMigrateLegacy}
                disabled={isMigratingLegacy}
                style={{
                  padding: "8px 16px",
                  borderRadius: 7,
                  border: "none",
                  background: "#ca3701",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                {isMigratingLegacy ? "กำลังนำเข้า…" : "นำเข้าเป็น Project"}
              </button>
              <button
                type="button"
                onClick={handleDismissLegacy}
                style={{
                  padding: "8px 12px",
                  borderRadius: 7,
                  border: "1px solid #ffcebb",
                  background: "#ffffff",
                  color: "#78726a",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                ข้าม
              </button>
            </div>
          </div>
        )}

        {/* Notifications */}
        {actionSuccess && (
          <div
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46" }}
            >
              <IconClose size={14} />
            </button>
          </div>
        )}

        {actionError && (
          <div
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}
            >
              <IconClose size={14} />
            </button>
          </div>
        )}

        {/* Controls Bar: Search + Sort + Project Count */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 className="catalog-title">โปรเจกต์ของคุณ</h1>
            <span className="catalog-count">{projects.length} โปรเจกต์</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Search Input */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  color: "#a7a198",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <IconSearch size={14} />
              </div>
              <input
                className="catalog-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อโปรเจกต์..."
              />
            </div>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "updatedAt" | "name" | "createdAt")}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #d9d3cc",
                background: "#ffffff",
                fontSize: 12,
                fontWeight: 500,
                color: "#443f39",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="updatedAt">แก้ไขล่าสุด</option>
              <option value="createdAt">สร้างล่าสุด</option>
              <option value="name">ชื่อโปรเจกต์ (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Project Grid / Empty State */}
        {loadingProjects ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#78726a" }}>
            กำลังโหลดรายการโปรเจกต์…
          </div>
        ) : filteredProjects.length === 0 && searchQuery ? (
          <div
            style={{
              background: "#ffffff",
              border: "2px dashed #ece7e0",
              borderRadius: 16,
              padding: "64px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#f8f4ef",
                color: "#a7a198",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconBrand />
            </div>
            <div style={{ maxWidth: 360 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1714", marginBottom: 6 }}>
                ไม่พบโปรเจกต์ที่ค้นหา
              </div>
              <div style={{ fontSize: 13, color: "#78726a", lineHeight: 1.5 }}>
                {`ไม่พบโปรเจกต์ที่ตรงกับ "${searchQuery}" ลองค้นหาด้วยคำอื่น`}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {/* Slot 1: New Project Button */}
            {!searchQuery && <NewProjectGridCard onClick={handleCreateProject} />}

            {/* Slots 2..N: Project Cards */}
            {filteredProjects.map((p) => {
              const formattedDate = formatTimestamp(p.updatedAt);
              return (
                <div
                  key={p.id}
                  style={{
                    background: "#fdfcfa",
                    border: "1px solid rgba(26, 23, 20, 0.14)",
                    borderRadius: 10,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "none",
                    transition:
                      "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                    cursor: "pointer",
                  }}
                  onClick={() => router.push(`/projects/${p.id}/editor`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "4px 4px 0 #1a1714";
                    e.currentTarget.style.borderColor = "#1a1714";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.borderColor = "rgba(26, 23, 20, 0.14)";
                  }}
                >
                  {/* Thumbnail / Preview Header */}
                  <div
                    style={{
                      height: 150,
                      background: "#ebe5da",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      borderBottom: "1px solid rgba(26, 23, 20, 0.1)",
                      overflow: "hidden",
                    }}
                  >
                    <ProjectSlideThumbnail project={p} />

                    {/* Slide Count Badge */}
                    <span
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 10,
                        background: "rgba(26, 23, 20, 0.75)",
                        backdropFilter: "blur(4px)",
                        color: "#ffffff",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 4,
                        zIndex: 2,
                      }}
                    >
                      {p.slideCount ?? 1} {(p.slideCount ?? 1) > 1 ? "slides" : "slide"}
                    </span>
                  </div>

                  {/* Body */}
                  <div
                    style={{
                      padding: "14px 16px",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1a1714",
                        marginBottom: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </div>

                    <div style={{ fontSize: 11, color: "#78726a", marginBottom: 12 }}>
                      แก้ไขล่าสุด: {formattedDate}
                    </div>

                    {/* Card Actions Footer */}
                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: 10,
                        borderTop: "1px solid #f8f4ef",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/projects/${p.id}/editor`)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#d64418",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        เปิดใช้งาน →
                      </button>

                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {/* Rename button */}
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget(p);
                            setRenameInput(p.name);
                          }}
                          title="เปลี่ยนชื่อโปรเจกต์"
                          style={cardActionIconBtnStyle}
                        >
                          <IconPenEdit size={12} color="#78726a" />
                        </button>

                        {/* Export button */}
                        <button
                          type="button"
                          onClick={() => handleExportProject(p)}
                          title="ส่งออกไฟล์ .artshift (สำรองข้อมูล)"
                          style={cardActionIconBtnStyle}
                        >
                          <IconDownload size={12} color="#78726a" />
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          title="ลบโปรเจกต์"
                          style={{ ...cardActionIconBtnStyle, color: "#dc2626" }}
                        >
                          <IconTrash size={12} color="#dc2626" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Local Storage Privacy & Backup Note */}
        <footer
          style={{
            marginTop: 48,
            padding: "16px 20px",
            background: "#ffffff",
            border: "1px solid #ece7e0",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#78726a",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔒</span>
            <span>
              <strong>บัญชี Google:</strong> โปรเจกต์อยู่กับบัญชีที่ล็อกอิน เปิดเครื่องอื่นด้วยบัญชีเดียวกันแล้วจะเห็นงานชุดนี้
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11 }}>💡 แนะนำให้กด "สำรองทั้งหมด" เมื่อเสร็จสิ้นงานสำคัญ</span>
          </div>
        </footer>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={modalBackdropStyle} onClick={() => setDeleteTarget(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: "#1a1714" }}>
              ยืนยันการลบโปรเจกต์
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#78726a", lineHeight: 1.5 }}>
              คุณแน่ใจหรือไม่ว่าต้องการลบโปรเจกต์ <strong>"{deleteTarget.name}"</strong>?
              การกระทำนี้จะลบข้อมูลออกจากเครื่องและไม่สามารถกู้คืนได้
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={secondaryBtnStyle}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                style={{ ...primaryBtnStyle, background: "#dc2626" }}
              >
                ลบโปรเจกต์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div style={modalBackdropStyle} onClick={() => setRenameTarget(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1a1714" }}>
              เปลี่ยนชื่อโปรเจกต์
            </h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConfirm();
              }}
              placeholder="Untitled Project"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d9d3cc",
                fontSize: 13,
                outline: "none",
                marginBottom: 20,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setRenameTarget(null)} style={secondaryBtnStyle}>
                ยกเลิก
              </button>
              <button type="button" onClick={handleRenameConfirm} style={primaryBtnStyle}>
                บันทึกชื่อ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers
function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  return new Date(ts).toLocaleDateString("th-TH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 18px",
  borderRadius: 999,
  border: "1.5px solid var(--ink)",
  background: "var(--ink)",
  color: "var(--accent-ink)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "var(--shadow-pop)",
  transition: "transform 0.15s ease",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: 999,
  border: "1px solid rgba(26, 23, 20, 0.2)",
  background: "transparent",
  color: "#1a1714",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const cardActionIconBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 5,
  border: "1px solid #ece7e0",
  background: "#fcf9f5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.12s ease",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(26, 23, 20, 0.5)",
  backdropFilter: "blur(4px)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const modalContentStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: 24,
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
};
