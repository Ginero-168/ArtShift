"use client";

import { useEffect, useState } from "react";
import { applyBrandKitToSlide } from "@/lib/brand/applyBrandKit";
import {
  type BrandKit,
  type BrandLogoPosition,
  getActiveBrandKit,
  PRESET_BRAND_KITS,
  saveActiveBrandKit,
} from "@/lib/brand/brandKit";
import { checkBrandCompliance } from "@/lib/brand/brandRules";
import { useEngine } from "@/lib/engine/store";
import styles from "./BrandKit.module.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BrandKitModal({ isOpen, onClose }: Props) {
  const [kit, setKit] = useState<BrandKit>(() => getActiveBrandKit());
  const [activeTab, setActiveTab] = useState<"identity" | "colors" | "rules">("identity");
  const doc = useEngine((s) => s.doc);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const loadDoc = useEngine((s) => s.loadDoc);

  useEffect(() => {
    if (isOpen) {
      setKit(getActiveBrandKit());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSlide = doc.slides.find((s) => s.id === currentSlideId);
  const compliance = currentSlide ? checkBrandCompliance(currentSlide, kit) : null;

  function handleSave(updatedKit: BrandKit) {
    setKit(updatedKit);
    saveActiveBrandKit(updatedKit);
  }

  function handleSelectPreset(preset: BrandKit) {
    handleSave(preset);
  }

  function handleApplyToCurrentSlide() {
    if (!currentSlide) return;
    const transformed = applyBrandKitToSlide(currentSlide, kit);
    const updatedSlides = doc.slides.map((s) => (s.id === currentSlideId ? transformed : s));
    loadDoc({
      ...doc,
      slides: updatedSlides,
      updatedAt: Date.now(),
    });
    onClose();
  }

  function handleApplyToAllSlides() {
    const updatedSlides = doc.slides.map((s) => applyBrandKitToSlide(s, kit));
    loadDoc({
      ...doc,
      slides: updatedSlides,
      updatedAt: Date.now(),
    });
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>👑 Publisher Brand Kit & Enterprise Rules</h3>
            <p className={styles.subtitle}>
              กำหนดอัตลักษณ์แบรนด์สำนักพิมพ์ สีประจำองค์กร ฟอนต์ และกฎเกณฑ์ความถูกต้อง
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Presets */}
          <div>
            <div className={styles.sectionTitle}>Presets สำนักพิมพ์สำเร็จรูป</div>
            <div className={styles.presetGrid}>
              {PRESET_BRAND_KITS.map((p) => {
                const isActive = p.id === kit.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.presetCard} ${isActive ? styles.presetCardActive : ""}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <div className={styles.presetName}>{p.name.split(" ")[0]}</div>
                    <div className={styles.colorBar}>
                      <div style={{ flex: 2, background: p.colors.primary }} />
                      <div style={{ flex: 1, background: p.colors.accent }} />
                      <div style={{ flex: 1, background: p.colors.background }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Nav */}
          <div
            style={{
              display: "flex",
              gap: 8,
              borderBottom: "1px solid var(--stroke, #27272a)",
              paddingBottom: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("identity")}
              style={{
                background: activeTab === "identity" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: activeTab === "identity" ? "#818cf8" : "#a1a1aa",
                border: "none",
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              🏢 สำนักพิมพ์ & โลโก้
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("colors")}
              style={{
                background: activeTab === "colors" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: activeTab === "colors" ? "#818cf8" : "#a1a1aa",
                border: "none",
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              🎨 ชุดสี & Typography
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rules")}
              style={{
                background: activeTab === "rules" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: activeTab === "rules" ? "#818cf8" : "#a1a1aa",
                border: "none",
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              ⚖️ กฎเกณฑ์ Brand Rules
            </button>
          </div>

          {/* Tab 1: Identity */}
          {activeTab === "identity" && (
            <div className={styles.section}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.label}>ชื่อสำนักพิมพ์ / Brand Name</span>
                  <input
                    className={styles.input}
                    value={kit.publisherName}
                    onChange={(e) => handleSave({ ...kit, publisherName: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>สโลแกน / Tagline</span>
                  <input
                    className={styles.input}
                    value={kit.tagline ?? ""}
                    onChange={(e) => handleSave({ ...kit, tagline: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.label}>ตำแหน่งโลโก้อัตโนมัติ (Logo Watermark Position)</span>
                  <select
                    className={styles.input}
                    value={kit.logo.position}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        logo: { ...kit.logo, position: e.target.value as BrandLogoPosition },
                      })
                    }
                  >
                    <option value="top-right">มุมขวาบน (Top-Right)</option>
                    <option value="top-left">มุมซ้ายบน (Top-Left)</option>
                    <option value="bottom-right">มุมขวาล่าง (Bottom-Right)</option>
                    <option value="bottom-left">มุมซ้ายล่าง (Bottom-Left)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>ขนาดโลโก้ (Logo Size px)</span>
                  <input
                    type="number"
                    className={styles.input}
                    value={kit.logo.size}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        logo: { ...kit.logo, size: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Colors & Fonts */}
          {activeTab === "colors" && (
            <div className={styles.section}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.label}>สีหลัก (Primary Color)</span>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={kit.colors.primary}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, primary: e.target.value },
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      value={kit.colors.primary}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, primary: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>สีเน้นโปรโมชัน (Accent Color)</span>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={kit.colors.accent}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, accent: e.target.value },
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      value={kit.colors.accent}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, accent: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>สีพื้นหลัง (Background Color)</span>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={kit.colors.background}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, background: e.target.value },
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      value={kit.colors.background}
                      onChange={(e) =>
                        handleSave({
                          ...kit,
                          colors: { ...kit.colors, background: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.label}>ฟอนต์หัวข้อหลัก (Header Font)</span>
                  <select
                    className={styles.input}
                    value={kit.typography.headerFont}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        typography: { ...kit.typography, headerFont: e.target.value },
                      })
                    }
                  >
                    <option value="Prompt, sans-serif">Prompt (ไทยร่วมสมัย)</option>
                    <option value="Kanit, sans-serif">Kanit (ไทยทันสมัยทรงพลัง)</option>
                    <option value="Sarabun, sans-serif">Sarabun (ไทยทางการอ่านง่าย)</option>
                    <option value="Inter, sans-serif">Inter (สากลคมชัด)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>ฟอนต์เนื้อหา & คำโปรย (Body Font)</span>
                  <select
                    className={styles.input}
                    value={kit.typography.bodyFont}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        typography: { ...kit.typography, bodyFont: e.target.value },
                      })
                    }
                  >
                    <option value="Sarabun, sans-serif">Sarabun (ไทยทางการอ่านง่าย)</option>
                    <option value="Prompt, sans-serif">Prompt (ไทยร่วมสมัย)</option>
                    <option value="Kanit, sans-serif">Kanit (ไทยทันสมัยทรงพลัง)</option>
                    <option value="Inter, sans-serif">Inter (สากลคมชัด)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Brand Rules */}
          {activeTab === "rules" && (
            <div className={styles.section}>
              <div className={styles.rulesGrid}>
                <label className={styles.ruleToggle}>
                  <input
                    type="checkbox"
                    checked={kit.rules.requireLogo}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        rules: { ...kit.rules, requireLogo: e.target.checked },
                      })
                    }
                  />
                  <span>บังคับแสดงโลโก้หรือชื่อสำนักพิมพ์บนชิ้นงาน (Require Logo)</span>
                </label>

                <label className={styles.ruleToggle}>
                  <input
                    type="checkbox"
                    checked={kit.rules.requireIsbn}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        rules: { ...kit.rules, requireIsbn: e.target.checked },
                      })
                    }
                  />
                  <span>บังคับระบุรหัส ISBN 13 หลักบน Ads (Require ISBN)</span>
                </label>

                <label className={styles.ruleToggle}>
                  <input
                    type="checkbox"
                    checked={kit.rules.requirePriceNotice}
                    onChange={(e) =>
                      handleSave({
                        ...kit,
                        rules: { ...kit.rules, requirePriceNotice: e.target.checked },
                      })
                    }
                  />
                  <span>บังคับแสดงข้อมูลราคาบนสื่อโปรโมชัน (Require Price)</span>
                </label>
              </div>

              {/* Compliance Report for Current Slide */}
              {compliance && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: "1px solid var(--stroke, #27272a)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      ความพร้อมตามเกณฑ์แบรนด์ (Brand Compliance Score):
                    </span>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                        color: compliance.passed ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {compliance.scorePercent}%
                    </span>
                  </div>
                  {compliance.issues.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {compliance.issues.map((issue) => (
                        <div
                          key={issue.ruleId}
                          style={{
                            fontSize: "0.75rem",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background:
                              issue.severity === "error"
                                ? "rgba(239, 68, 68, 0.12)"
                                : "rgba(245, 158, 11, 0.12)",
                            color: issue.severity === "error" ? "#fca5a5" : "#fcd34d",
                          }}
                        >
                          {issue.message} — {issue.recommendation}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.applyBtn}
            style={{ background: "#3f3f46" }}
            onClick={handleApplyToCurrentSlide}
          >
            ปรับใช้กับสไลด์ปัจจุบัน (Apply to Current)
          </button>
          <button type="button" className={styles.applyBtn} onClick={handleApplyToAllSlides}>
            👑 ปรับใช้ Brand Kit กับทุกสไลด์ (Apply to All)
          </button>
        </div>
      </div>
    </div>
  );
}
