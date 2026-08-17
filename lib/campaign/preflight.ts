/**
 * Automated Preflight QA and Defect Detection for Book Campaign Production.
 */

import { measureTextElementHeight } from "../engine/textLayout";
import type { TextElement } from "../engine/types";
import type { GeneratedBatchItem } from "./generator";
import type { PreflightIssue } from "./types";

export type PreflightReport = {
  totalItems: number;
  passedCount: number;
  warningCount: number;
  errorCount: number;
  scorePercent: number;
  status: "pass" | "warnings" | "errors";
  issues: PreflightIssue[];
};

export function runCampaignPreflight(batchItems: GeneratedBatchItem[]): PreflightReport {
  const issues: PreflightIssue[] = [];

  for (const item of batchItems) {
    const { slide, book, channel, templateId } = item;

    // 1. Missing Cover Image Check
    if (!book.coverUrl || book.coverUrl.trim().length === 0) {
      issues.push({
        id: crypto.randomUUID(),
        slideId: slide.id,
        bookId: book.id,
        bookTitle: book.title,
        ratio: channel.ratio,
        field: "coverUrl",
        severity: "warning",
        message: "ไม่พบ URL ภาพปกหนังสือ (ระบบใช้ภาพตัวอย่างแทน)",
        suggestion: "ใส่ URL ภาพปกในตารางหรืออัปโหลดรูปปกหนังสือจริง",
      });
    }

    // 2. Missing Key Data Check based on template
    if (templateId === "sale-promo") {
      if (!book.salePrice && !book.listPrice) {
        issues.push({
          id: crypto.randomUUID(),
          slideId: slide.id,
          bookId: book.id,
          bookTitle: book.title,
          ratio: channel.ratio,
          field: "salePrice",
          severity: "error",
          message: "เทมเพลตโปรโมชันลดราคา แต่ไม่พบข้อมูลราคาขายหรือราคาเดิม",
          suggestion: "ระบุราคาโปรโมชัน เช่น '249' ในคอลัมน์ราคา",
        });
      }
    }

    if (templateId === "quote-review" && !book.reviewerQuote) {
      issues.push({
        id: crypto.randomUUID(),
        slideId: slide.id,
        bookId: book.id,
        bookTitle: book.title,
        ratio: channel.ratio,
        field: "reviewerQuote",
        severity: "info",
        message: "ไม่พบคำนิยมหรือรีวิวเฉพาะเล่ม (ระบบใช้ข้อความมาตรฐานแทน)",
        suggestion: "ใส่คำนิยมหรือข้อความรีวิวในคอลัมน์คำนิยม",
      });
    }

    if (!book.isbn || book.isbn.startsWith("book-")) {
      issues.push({
        id: crypto.randomUUID(),
        slideId: slide.id,
        bookId: book.id,
        bookTitle: book.title,
        ratio: channel.ratio,
        field: "isbn",
        severity: "info",
        message: "ไม่มีรหัส ISBN สำหรับตั้งชื่อไฟล์ผลลัพธ์แบบมาตรฐาน",
        suggestion: "ระบุรหัส ISBN 13 หลัก เพื่อให้ระบบแยกโฟลเดอร์ตาม SKU ได้แม่นยำ",
      });
    }

    // 3. Text Layout Overflow & Bounds Check
    for (const el of slide.elements) {
      if (el.type === "text") {
        const textEl = el as TextElement;
        const requiredHeight = measureTextElementHeight(textEl);

        // Check if text exceeds allocated height significantly
        if (requiredHeight > textEl.height * 1.25) {
          issues.push({
            id: crypto.randomUUID(),
            slideId: slide.id,
            bookId: book.id,
            bookTitle: book.title,
            ratio: channel.ratio,
            field: "text_overflow",
            severity: "warning",
            message: `ข้อความ "${textEl.text.slice(0, 24)}…" อาจล้นกล่องข้อความ (${Math.round(requiredHeight)}px > ${Math.round(textEl.height)}px)`,
            suggestion: "ลดความยาวข้อความหรือเปิดใน Canvas Editor เพื่อปรับขนาดฟอนต์",
          });
        }
      }

      // Check boundary bleed (element outside canvas)
      if (el.x + el.width > slide.width + 20 || el.y + el.height > slide.height + 20) {
        issues.push({
          id: crypto.randomUUID(),
          slideId: slide.id,
          bookId: book.id,
          bookTitle: book.title,
          ratio: channel.ratio,
          field: "canvas_boundary",
          severity: "warning",
          message: `องค์ประกอบ [${el.type}] มีบางส่วนล้นออกนอกขอบชิ้นงาน`,
          suggestion: "ปรับลดขนาดหรือย้ายตำแหน่งเข้ามาในขอบ Canvas",
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const totalItems = batchItems.length;

  // Calculate score (100% minus deductions)
  const penalty = errorCount * 15 + warningCount * 5;
  const scorePercent = Math.max(0, Math.min(100, 100 - penalty));

  let status: "pass" | "warnings" | "errors" = "pass";
  if (errorCount > 0) status = "errors";
  else if (warningCount > 0) status = "warnings";

  const passedCount =
    totalItems - new Set(issues.filter((i) => i.severity !== "info").map((i) => i.slideId)).size;

  return {
    totalItems,
    passedCount: Math.max(0, passedCount),
    warningCount,
    errorCount,
    scorePercent,
    status,
    issues,
  };
}
