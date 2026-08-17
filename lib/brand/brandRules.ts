/**
 * Enterprise Brand Rules Compliance Engine.
 * Verifies artwork against brand guidelines (logos, ISBNs, contrast, pricing notices).
 */

import type { EngineSlide, ImageElement, TextElement } from "../engine/types";
import type { BrandKit } from "./brandKit";

export type ComplianceSeverity = "error" | "warning" | "info";

export type ComplianceIssue = {
  ruleId: string;
  ruleName: string;
  severity: ComplianceSeverity;
  message: string;
  recommendation: string;
};

export type BrandComplianceReport = {
  brandKitName: string;
  publisherName: string;
  passed: boolean;
  scorePercent: number;
  issues: ComplianceIssue[];
};

export function checkBrandCompliance(
  slide: EngineSlide,
  brandKit: BrandKit,
): BrandComplianceReport {
  const issues: ComplianceIssue[] = [];
  const rules = brandKit.rules;
  const activeElements = slide.elements.filter((e) => !e.isDeleted);

  // 1. Check Publisher Logo Rule
  if (rules.requireLogo) {
    const hasLogoImage = activeElements.some(
      (el) =>
        el.type === "image" && (el as ImageElement).sourceName?.toLowerCase().includes("logo"),
    );
    const hasPublisherText = activeElements.some(
      (el) =>
        el.type === "text" &&
        ((el as TextElement).text.includes(brandKit.publisherName) ||
          (el as TextElement).text.includes("สำนักพิมพ์")),
    );

    if (!hasLogoImage && !hasPublisherText) {
      issues.push({
        ruleId: "brand-logo-required",
        ruleName: "Publisher Logo / Name Requirement",
        severity: "error",
        message: `ไม่พบโลโก้หรือชื่อสำนักพิมพ์ "${brandKit.publisherName}" บนชิ้นงานโฆษณา`,
        recommendation: "แทรกโลโก้สำนักพิมพ์หรือใส่ชื่อสำนักพิมพ์ในบริเวณมุมของชิ้นงาน",
      });
    }
  }

  // 2. Check ISBN Requirement
  if (rules.requireIsbn) {
    const hasIsbn = activeElements.some((el) => {
      if (el.type !== "text") return false;
      const content = (el as TextElement).text;
      return (
        content.toUpperCase().includes("ISBN") ||
        /\b978[-\d]{10,14}\b/.test(content) ||
        /\b\d{13}\b/.test(content)
      );
    });

    if (!hasIsbn) {
      issues.push({
        ruleId: "isbn-required",
        ruleName: "ISBN & Barcode Requirement",
        severity: "warning",
        message: "ไม่พบรหัส ISBN หรือบาร์โค้ดหนังสือสำหรับชิ้นงานนี้",
        recommendation: "เพิ่มรหัส ISBN 13 หลักเพื่อความถูกต้องในการสั่งซื้อและแคตตาล็อก",
      });
    }
  }

  // 3. Check Price Notice Requirement
  if (rules.requirePriceNotice) {
    const hasPrice = activeElements.some((el) => {
      if (el.type !== "text") return false;
      const content = (el as TextElement).text;
      return (
        content.includes("฿") ||
        content.includes("บาท") ||
        content.includes("ราคา") ||
        /\b\d{2,4}\.-?\b/.test(content)
      );
    });

    if (!hasPrice) {
      issues.push({
        ruleId: "price-notice-required",
        ruleName: "Price Notice Requirement",
        severity: "info",
        message: "ไม่พบข้อมูลราคาหรือป้ายระบุราคาจำหน่ายบนชิ้นงาน",
        recommendation: "ระบุราคาปกติหรือราคาพิเศษเพื่อกระตุ้นยอดขาย",
      });
    }
  }

  // Calculate score
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const penalty = errorCount * 35 + warningCount * 15;
  const scorePercent = Math.max(0, Math.min(100, 100 - penalty));

  return {
    brandKitName: brandKit.name,
    publisherName: brandKit.publisherName,
    passed: errorCount === 0,
    scorePercent,
    issues,
  };
}
