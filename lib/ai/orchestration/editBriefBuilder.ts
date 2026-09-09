/**
 * Structured EditBrief builder for image editing and iteration operations.
 * Follows /opt/artshift/docs/plans/gpt-image-generation-edit-orchestration-plan.md
 */

import type { ImageWorkSpec } from "./imageWorkSpec";

export type ParsedEditBrief = {
  changes: string[];
  invariants: string[];
  referenceRoles: string[];
  successCriteria: string[];
};

/**
 * Builds a structured, multi-section EditBrief string from an ImageWorkSpec.
 * Clearly separates requested modifications from invariant constraints and reference roles.
 */
export function buildEditBrief(spec: ImageWorkSpec): string {
  const sections: string[] = [];

  // 1. CHANGE section
  const changes =
    spec.requestedChanges && spec.requestedChanges.length > 0
      ? spec.requestedChanges
      : [spec.refinedPrompt || spec.userPrompt || "Apply requested modifications"];
  sections.push("CHANGE:\n" + changes.map((c) => `- ${c.trim()}`).join("\n"));

  // 2. PRESERVE section (invariants)
  const invariants =
    spec.invariants && spec.invariants.length > 0
      ? spec.invariants
      : [
          "Preserve overall layout, background, and lighting unless explicitly asked to modify",
          "Preserve existing text, logo, and core subject geometry",
        ];
  sections.push("PRESERVE:\n" + invariants.map((inv) => `- ${inv.trim()}`).join("\n"));

  // 3. REFERENCE ROLES section
  if (spec.references && spec.references.length > 0) {
    const roles = spec.references.map((ref, idx) => {
      const label = `image ${idx + 1}`;
      const roleText =
        ref.role === "base"
          ? "base image to edit"
          : ref.role === "style"
            ? "style reference only"
            : ref.role === "palette"
              ? "color reference only"
              : ref.role === "composition"
                ? "composition reference only"
                : "subject reference";
      return `- ${label} (${ref.assetRef}) = ${roleText}`;
    });
    sections.push("REFERENCE ROLES:\n" + roles.join("\n"));
  }

  // 4. SUCCESS CRITERIA section
  const criteria: string[] = [];
  if (changes.length > 0) {
    criteria.push(`Requested changes must be clearly applied (${changes[0]})`);
  }
  if (spec.exactText && spec.exactText.length > 0) {
    criteria.push(
      `Exact text must be preserved or rendered accurately: "${spec.exactText.join('", "')}"`,
    );
  }
  criteria.push("Invariants and non-targeted regions must remain intact without unwanted drift");
  criteria.push("Composition shift must remain within acceptable bounds");

  sections.push("SUCCESS CRITERIA:\n" + criteria.map((c) => `- ${c}`).join("\n"));

  return sections.join("\n\n");
}

/**
 * Parses a structured EditBrief text back into its constituent parts.
 */
export function parseEditBrief(brief: string): ParsedEditBrief {
  const result: ParsedEditBrief = {
    changes: [],
    invariants: [],
    referenceRoles: [],
    successCriteria: [],
  };

  const lines = brief.split(/\r?\n/);
  let currentSection: keyof ParsedEditBrief | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^CHANGE:/i.test(line)) {
      currentSection = "changes";
      continue;
    }
    if (/^PRESERVE:/i.test(line)) {
      currentSection = "invariants";
      continue;
    }
    if (/^REFERENCE ROLES:/i.test(line)) {
      currentSection = "referenceRoles";
      continue;
    }
    if (/^SUCCESS CRITERIA:/i.test(line)) {
      currentSection = "successCriteria";
      continue;
    }

    if (line.startsWith("-") || line.startsWith("*")) {
      const item = line.replace(/^[-*]\s*/, "").trim();
      if (item && currentSection) {
        result[currentSection].push(item);
      }
    }
  }

  return result;
}
