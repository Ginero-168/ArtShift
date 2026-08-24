export type ImageExplanationInput = {
  caption: string;
  regionLabels?: readonly string[];
  ocrText?: string;
};

type LabelSummary = {
  label: string;
  count: number;
};

function cleanText(value: string | undefined): string {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";
  return /^(undefined|null|none)$/i.test(cleaned) ? "" : cleaned;
}

export function summarizeRegionLabels(labels: readonly string[] = []): LabelSummary[] {
  const summaries = new Map<string, LabelSummary>();

  for (const rawLabel of labels) {
    const label = cleanText(rawLabel);
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    const existing = summaries.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      summaries.set(key, { label, count: 1 });
    }
  }

  return [...summaries.values()].sort(
    (first, second) => second.count - first.count || first.label.localeCompare(second.label),
  );
}

/** Build the final assistant message produced by the local image-explanation pipeline. */
export function buildDetailedImageExplanation({
  caption,
  regionLabels = [],
  ocrText,
}: ImageExplanationInput): string {
  const cleanedCaption = cleanText(caption) || "โมเดลไม่สามารถสร้างคำบรรยายภาพหลักได้";
  const regions = summarizeRegionLabels(regionLabels).slice(0, 24);
  const cleanedOcr = cleanText(ocrText);
  const sections = [`คำอธิบายภาพโดยละเอียด\n${cleanedCaption}`];

  if (regions.length > 0) {
    sections.push(
      `องค์ประกอบที่ตรวจพบ (${regions.reduce((total, item) => total + item.count, 0)} รายการ)\n${regions
        .map(({ label, count }) => `• ${label}${count > 1 ? ` × ${count}` : ""}`)
        .join("\n")}`,
    );
  }

  if (cleanedOcr) sections.push(`ข้อความที่อ่านได้จากภาพ\n${cleanedOcr}`);

  sections.push("วิเคราะห์บนเครื่องด้วย Florence-2 โดยภาพไม่ถูกส่งออกจาก Browser");
  return sections.join("\n\n");
}
