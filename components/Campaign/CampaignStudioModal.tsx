"use client";

import { useEffect, useMemo, useState } from "react";
import { exportCampaignBatchToZip, type ZipFolderStructure } from "@/lib/campaign/exportZip";
import { type GeneratedBatchItem, generateCampaignBatch } from "@/lib/campaign/generator";
import {
  autoDetectColumnMapping,
  parseCSV,
  recordsFromMappedRows,
  SAMPLE_CAMPAIGNS,
} from "@/lib/campaign/parser";
import { type PreflightReport, runCampaignPreflight } from "@/lib/campaign/preflight";
import { CAMPAIGN_TEMPLATE_DEFS } from "@/lib/campaign/templates";
import {
  type BatchExportProgress,
  CAMPAIGN_CHANNELS,
  type CampaignTemplateId,
  type CampaignTemplateTheme,
  type ColumnMapping,
} from "@/lib/campaign/types";
import { serializeSlideToSVG } from "@/lib/engine/exportSVG";
import type { EngineSlide } from "@/lib/engine/types";
import styles from "./CampaignStudio.module.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onLoadIntoCanvas: (slides: EngineSlide[]) => void;
};

export default function CampaignStudioModal({ isOpen, onClose, onLoadIntoCanvas }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Data State
  const [csvText, setCsvText] = useState(SAMPLE_CAMPAIGNS[0].csv);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    title: "ชื่อหนังสือ",
    author: "ผู้เขียน",
    isbn: "ISBN",
    listPrice: "ราคาปกติ",
    salePrice: "ราคาโปร",
    discountText: "ส่วนลด",
    coverUrl: "รูปปก",
    publisher: "สำนักพิมพ์",
    tagline: "แท็กไลน์",
    badgeText: "ป้าย",
    reviewerQuote: "คำนิยม",
    reviewerName: "ผู้รีวิว",
  });

  // Step 2: Templates & Channels State
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplateId>("launch-hero");
  const [selectedTheme, setSelectedTheme] = useState<CampaignTemplateTheme>("warm");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([
    "feed-square",
    "story-vertical",
    "banner-landscape",
  ]);

  // Step 3: Batch, Preflight & Export State
  const [generatedBatch, setGeneratedBatch] = useState<GeneratedBatchItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null);
  const [exportProgress, setExportProgress] = useState<BatchExportProgress | null>(null);
  const [folderStructure, setFolderStructure] = useState<ZipFolderStructure>("by-book");

  // Parse CSV
  const { headers, rows } = useMemo(() => parseCSV(csvText), [csvText]);

  // Auto-detect mappings when headers change
  useEffect(() => {
    if (headers.length > 0) {
      const detected = autoDetectColumnMapping(headers);
      setColumnMapping((prev) => ({ ...prev, ...detected }));
    }
  }, [headers]);

  // Convert to structured records
  const records = useMemo(() => {
    return recordsFromMappedRows(headers, rows, columnMapping);
  }, [headers, rows, columnMapping]);

  // Selected Channel specs
  const activeChannels = useMemo(() => {
    return CAMPAIGN_CHANNELS.filter((c) => selectedChannelIds.includes(c.id));
  }, [selectedChannelIds]);

  // Re-generate batch when entering step 3
  useEffect(() => {
    if (step === 3 && records.length > 0 && activeChannels.length > 0) {
      setIsGenerating(true);
      generateCampaignBatch(records, selectedTemplate, activeChannels, selectedTheme)
        .then((items) => {
          setGeneratedBatch(items);
          const report = runCampaignPreflight(items);
          setPreflightReport(report);
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }
  }, [step, records, selectedTemplate, activeChannels, selectedTheme]);

  if (!isOpen) return null;

  function loadSampleData(sampleId: string) {
    const found = SAMPLE_CAMPAIGNS.find((s) => s.id === sampleId);
    if (found) {
      setCsvText(found.csv);
    }
  }

  function toggleChannel(channelId: string) {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  }

  async function handleExportZip() {
    if (generatedBatch.length === 0) return;
    try {
      await exportCampaignBatchToZip(generatedBatch, {
        campaignName: `${records[0]?.title || "book"}-campaign`,
        folderStructure,
        onProgress: (p) => setExportProgress(p),
      });
    } catch (err) {
      console.error("ZIP Export failed:", err);
    } finally {
      setTimeout(() => setExportProgress(null), 2500);
    }
  }

  function handleOpenInEditor() {
    if (generatedBatch.length === 0) return;
    const slides = generatedBatch.map((item) => item.slide);
    onLoadIntoCanvas(slides);
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-labelledby="modal-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 id="modal-title" className={styles.title}>
              Campaign Studio
            </h2>
            <span className={styles.badge}>Batch Creative Pack</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className={styles.stepper}>
          <button
            type="button"
            className={`${styles.stepTab} ${step === 1 ? styles.stepTabActive : styles.stepTabCompleted}`}
            onClick={() => setStep(1)}
          >
            <span className={styles.stepNumber}>1</span>
            1. ข้อมูลหนังสือ & CSV
          </button>
          <button
            type="button"
            className={`${styles.stepTab} ${step === 2 ? styles.stepTabActive : step > 2 ? styles.stepTabCompleted : ""}`}
            onClick={() => records.length > 0 && setStep(2)}
            disabled={records.length === 0}
          >
            <span className={styles.stepNumber}>2</span>
            2. เทมเพลต & ขนาดชิ้นงาน
          </button>
          <button
            type="button"
            className={`${styles.stepTab} ${step === 3 ? styles.stepTabActive : ""}`}
            onClick={() => records.length > 0 && activeChannels.length > 0 && setStep(3)}
            disabled={records.length === 0 || activeChannels.length === 0}
          >
            <span className={styles.stepNumber}>3</span>
            3. Preflight QA & ชิ้นงาน ({records.length * activeChannels.length})
          </button>
        </div>

        {/* Body Content */}
        <div className={styles.body}>
          {step === 1 && (
            <div>
              <h3 className={styles.sectionTitle}>นำเข้าข้อมูลหนังสือ (Book Catalog Source)</h3>
              <p className={styles.sectionDesc}>
                วางข้อมูล CSV หรือเลือกชุดตัวอย่างเพื่อสร้างชุดชิ้นงานสำหรับโฆษณาหลายเล่มพร้อมกัน
              </p>

              {/* Sample Buttons */}
              <div className={styles.sampleBar}>
                <span className={styles.sampleLabel}>ชุดข้อมูลตัวอย่าง:</span>
                {SAMPLE_CAMPAIGNS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.sampleBtn}
                    onClick={() => loadSampleData(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* CSV Textarea */}
              <textarea
                className={styles.textarea}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="ISBN,ชื่อหนังสือ,ผู้เขียน,ราคาปกติ,ราคาโปร,รูปปก..."
              />

              {/* Column Mapping Controls */}
              {headers.length > 0 && (
                <div>
                  <h4
                    className={styles.sectionTitle}
                    style={{ fontSize: "0.875rem", marginTop: "1rem" }}
                  >
                    จับคู่คอลัมน์ (Column Mapping):
                  </h4>
                  <div className={styles.mappingGrid}>
                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>ชื่อหนังสือ (Title) *</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.title}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, title: e.target.value })
                        }
                      >
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>ผู้เขียน (Author) *</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.author}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, author: e.target.value })
                        }
                      >
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>รหัส ISBN / SKU</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.isbn || ""}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, isbn: e.target.value })
                        }
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>ราคาโปรโมชัน (Sale Price)</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.salePrice || ""}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, salePrice: e.target.value })
                        }
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>ราคาปกติ (List Price)</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.listPrice || ""}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, listPrice: e.target.value })
                        }
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.mappingItem}>
                      <span className={styles.mappingLabel}>รูปภาพปก (Cover URL)</span>
                      <select
                        className={styles.mappingSelect}
                        value={columnMapping.coverUrl || ""}
                        onChange={(e) =>
                          setColumnMapping({ ...columnMapping, coverUrl: e.target.value })
                        }
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Table Preview */}
              {records.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#22c55e" }}>
                      ✓ ตรวจพบข้อมูลหนังสือ {records.length} รายการ
                    </span>
                  </div>
                  <div className={styles.tableWrapper}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>ISBN</th>
                          <th>ชื่อเรื่อง</th>
                          <th>ผู้เขียน</th>
                          <th>ราคาโปร</th>
                          <th>ราคาปกติ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((rec, idx) => (
                          <tr key={rec.id}>
                            <td>{idx + 1}</td>
                            <td>{rec.isbn || "-"}</td>
                            <td style={{ fontWeight: 600, color: "#fff" }}>{rec.title}</td>
                            <td>{rec.author}</td>
                            <td style={{ color: "#ef4444", fontWeight: 600 }}>
                              {rec.salePrice ? `฿${rec.salePrice}` : "-"}
                            </td>
                            <td style={{ color: "#a1a1aa" }}>
                              {rec.listPrice ? `฿${rec.listPrice}` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className={styles.sectionTitle}>เลือกเทมเพลตและขนาดชิ้นงาน (Template & Formats)</h3>
              <p className={styles.sectionDesc}>
                เลือกรูปแบบการจัดวางและขนาดสื่อที่ต้องการผลิตสำหรับแต่ละช่องทาง
              </p>

              {/* Template Grid */}
              <div className={styles.templateGrid}>
                {CAMPAIGN_TEMPLATE_DEFS.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className={`${styles.templateCard} ${selectedTemplate === tmpl.id ? styles.templateCardActive : ""}`}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                  >
                    <h4 className={styles.templateName}>{tmpl.name}</h4>
                    <p className={styles.templateDesc}>{tmpl.description}</p>
                  </div>
                ))}
              </div>

              {/* Theme Palette Choice */}
              <div style={{ marginBottom: "1.5rem" }}>
                <span
                  className={styles.mappingLabel}
                  style={{ marginBottom: "0.5rem", display: "block" }}
                >
                  โทนสี (Visual Theme):
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {(["warm", "dark", "vibrant", "minimal", "navy"] as CampaignTemplateTheme[]).map(
                    (thm) => (
                      <button
                        key={thm}
                        type="button"
                        className={`${styles.sampleBtn} ${selectedTheme === thm ? styles.sampleBtnActive : ""}`}
                        style={{
                          borderColor: selectedTheme === thm ? "#38bdf8" : undefined,
                          background:
                            selectedTheme === thm ? "rgba(56, 189, 248, 0.15)" : undefined,
                        }}
                        onClick={() => setSelectedTheme(thm)}
                      >
                        {thm.toUpperCase()}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Channel / Variant Selection */}
              <h4 className={styles.sectionTitle} style={{ fontSize: "0.9rem" }}>
                ช่องทางและสัดส่วนชิ้นงาน (Target Channels):
              </h4>
              <div className={styles.channelGrid}>
                {CAMPAIGN_CHANNELS.map((ch) => {
                  const isSelected = selectedChannelIds.includes(ch.id);
                  return (
                    <div
                      key={ch.id}
                      className={`${styles.channelCard} ${isSelected ? styles.channelCardActive : ""}`}
                      onClick={() => toggleChannel(ch.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ marginTop: "2px", accentColor: "#38bdf8" }}
                      />
                      <div>
                        <p className={styles.channelName}>{ch.name}</p>
                        <p className={styles.channelSub}>{ch.channel}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              {/* Preflight QA Card */}
              {preflightReport && (
                <div
                  className={`${styles.scoreCard} ${
                    preflightReport.status === "pass"
                      ? styles.scorePass
                      : preflightReport.status === "warnings"
                        ? styles.scoreWarn
                        : styles.scoreError
                  }`}
                >
                  <div>
                    <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", fontWeight: 700 }}>
                      {preflightReport.status === "pass"
                        ? "✓ ผ่านการตรวจสอบคุณภาพ (Preflight Passed)"
                        : `พบข้อสังเกต ${preflightReport.warningCount + preflightReport.errorCount} รายการ`}
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.85 }}>
                      ผลิตชิ้นงานทั้งหมด {generatedBatch.length} ไฟล์ จากหนังสือ {records.length} เล่ม ×{" "}
                      {activeChannels.length} ขนาด
                    </p>
                  </div>
                  <div className={styles.scoreNumber}>{preflightReport.scorePercent}%</div>
                </div>
              )}

              {/* Preflight Issues */}
              {preflightReport && preflightReport.issues.length > 0 && (
                <div className={styles.issueList}>
                  {preflightReport.issues.map((iss) => (
                    <div key={iss.id} className={styles.issueItem}>
                      <span
                        className={`${styles.issuePill} ${
                          iss.severity === "error"
                            ? styles.pillError
                            : iss.severity === "warning"
                              ? styles.pillWarning
                              : styles.pillInfo
                        }`}
                      >
                        {iss.severity}
                      </span>
                      <div>
                        <strong>[{iss.bookTitle}]</strong> {iss.message} —{" "}
                        <span style={{ opacity: 0.75 }}>{iss.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Folder Structure selector */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}
              >
                <span className={styles.mappingLabel}>โครงสร้างโฟลเดอร์สำหรับ ZIP:</span>
                <select
                  className={styles.mappingSelect}
                  value={folderStructure}
                  onChange={(e) => setFolderStructure(e.target.value as ZipFolderStructure)}
                >
                  <option value="by-book">แยกตามโฟลเดอร์หนังสือ (ISBN-Title)</option>
                  <option value="by-channel">แยกตามช่องทาง (Facebook / Story / Banner)</option>
                  <option value="flat">ไฟล์ทั้งหมดรวมในโฟลเดอร์เดียว (Flat)</option>
                </select>
              </div>

              {/* Contact Sheet Grid */}
              <h4 className={styles.sectionTitle} style={{ fontSize: "0.9rem" }}>
                พรีวิวชิ้นงานทั้งหมด (Contact Sheet Preview): {isGenerating ? "(กำลังสร้าง...)" : ""}
              </h4>
              <div className={styles.contactSheet}>
                {generatedBatch.map((item) => {
                  const svgMarkup = serializeSlideToSVG(item.slide);
                  const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;

                  return (
                    <div key={item.slide.id} className={styles.contactCard}>
                      <div className={styles.contactPreviewBox}>
                        {/* biome-ignore lint/performance/noImgElement: inline SVG data URL preview */}
                        <img
                          src={svgDataUrl}
                          alt={item.slide.name}
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                      <div className={styles.contactInfo}>
                        <p className={styles.contactTitle}>{item.book.title}</p>
                        <p className={styles.contactMeta}>
                          {item.channel.name} • {item.slide.width}×{item.slide.height}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Export Progress */}
              {exportProgress && (
                <div style={{ marginTop: "1rem" }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}
                  >
                    <span>{exportProgress.currentName}</span>
                    <span>
                      {exportProgress.completed} / {exportProgress.total}
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${Math.round((exportProgress.completed / Math.max(1, exportProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div>
            {step > 1 && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              >
                ← ย้อนกลับ
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            {step < 3 ? (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                disabled={records.length === 0 || (step === 2 && activeChannels.length === 0)}
              >
                ถัดไป →
              </button>
            ) : (
              <>
                <button type="button" className={styles.btnSecondary} onClick={handleOpenInEditor}>
                  เปิดแก้ไขใน Canvas Editor
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleExportZip}
                  disabled={
                    exportProgress?.status === "rendering" || exportProgress?.status === "packaging"
                  }
                >
                  {exportProgress?.status === "rendering" || exportProgress?.status === "packaging"
                    ? "กำลังส่งออก ZIP..."
                    : `ดาวน์โหลด Batch ZIP (${generatedBatch.length} ชิ้น)`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
