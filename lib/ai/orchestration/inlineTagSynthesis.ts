import type { ImageReferenceAnalysis } from "./referenceAnalysis";

export type InlineTagToken = {
  type: "tag";
  raw: string;
  displayName: string;
  objectId: string;
};

export type InlineTextToken = {
  type: "text";
  text: string;
};

export type InlinePromptSegment = InlineTagToken | InlineTextToken;

export type InlinePromptSynthesis = {
  /** Clean human-readable text with tag names formatted as @displayName */
  displayPrompt: string;
  /** Tokens parsed sequentially */
  segments: InlinePromptSegment[];
  /** Unique object IDs referenced inline */
  referencedObjectIds: string[];
  /** Detailed breakdown mapping each tag in the sentence to its visual analysis */
  semanticMappingText: string;
  /** Expanded prompt with visual descriptions substituted in-place for image generation models */
  expandedPromptForModel: string;
};

// Matches @[content]
const CANONICAL_TAG_REGEX = /@\[([^\]]+)\]/g;

/**
 * Parses prompt text into text segments and inline tag tokens.
 */
export function parseInlineTagTokens(text: string): InlinePromptSegment[] {
  const segments: InlinePromptSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  // Reset regex index
  CANONICAL_TAG_REGEX.lastIndex = 0;

  while (true) {
    match = CANONICAL_TAG_REGEX.exec(text);
    if (!match) break;

    const matchStart = match.index;
    const matchEnd = CANONICAL_TAG_REGEX.lastIndex;

    if (matchStart > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, matchStart),
      });
    }

    const inner = match[1]?.trim() || "";
    const lastColon = inner.lastIndexOf(":");
    let displayName = inner;
    let objectId = inner;

    if (lastColon > 0) {
      displayName = inner.slice(0, lastColon).trim();
      objectId = inner.slice(lastColon + 1).trim() || displayName;
    }

    segments.push({
      type: "tag",
      raw: match[0],
      displayName,
      objectId,
    });

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Extracts unique object IDs referenced in the inline tags.
 */
export function extractInlineTagObjectIds(text: string): string[] {
  const segments = parseInlineTagTokens(text);
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    if (seg.type === "tag" && seg.objectId && !seen.has(seg.objectId)) {
      seen.add(seg.objectId);
      ids.push(seg.objectId);
    }
  }

  return ids;
}

/**
 * Formats a clean display prompt where tokens @[displayName:objectId] are simplified to @displayName.
 */
export function formatDisplayPrompt(text: string): string {
  const segments = parseInlineTagTokens(text);
  return segments.map((seg) => (seg.type === "tag" ? `@${seg.displayName}` : seg.text)).join("");
}

/**
 * Synthesizes inline tags with their full visual analyses, generating:
 * 1. Semantic mapping linking the sentence structure to visual features
 * 2. An expanded prompt for downstream image generation models
 */
export function synthesizePromptWithInlineTags(
  prompt: string,
  analyses: readonly ImageReferenceAnalysis[],
): InlinePromptSynthesis {
  const segments = parseInlineTagTokens(prompt);
  const referencedObjectIds = extractInlineTagObjectIds(prompt);
  const displayPrompt = formatDisplayPrompt(prompt);

  const analysisByObjectId = new Map<string, ImageReferenceAnalysis>();
  const analysisByDisplayName = new Map<string, ImageReferenceAnalysis>();

  for (const item of analyses) {
    if (item.ref?.objectId) {
      analysisByObjectId.set(item.ref.objectId, item.ref ? item : item);
    }
    if (item.ref?.displayName) {
      analysisByDisplayName.set(item.ref.displayName.toLowerCase(), item);
    }
  }

  const findAnalysis = (
    objectId: string,
    displayName: string,
  ): ImageReferenceAnalysis | undefined => {
    return analysisByObjectId.get(objectId) || analysisByDisplayName.get(displayName.toLowerCase());
  };

  // Build semantic mapping text
  const mappingLines: string[] = [];
  const tagOccurrences: Array<{
    displayName: string;
    objectId: string;
    analysis?: ImageReferenceAnalysis;
  }> = [];

  for (const seg of segments) {
    if (seg.type === "tag") {
      const analysis = findAnalysis(seg.objectId, seg.displayName);
      tagOccurrences.push({
        displayName: seg.displayName,
        objectId: seg.objectId,
        analysis,
      });
    }
  }

  if (tagOccurrences.length > 0) {
    mappingLines.push("=== INLINE NAME TAG SEMANTIC MAPPING ===");
    mappingLines.push(
      "The user explicitly placed inline Name tags (@TagName) inside their request sentence. Below is the verified visual analysis for each referenced image:",
    );

    const mappedIds = new Set<string>();
    tagOccurrences.forEach((item, idx) => {
      if (mappedIds.has(item.objectId)) return;
      mappedIds.add(item.objectId);

      const title = `@${item.displayName}`;
      const an = item.analysis;
      const details: string[] = [`${idx + 1}. ${title} (Object ID: "${item.objectId}"):`];

      if (an) {
        if (an.caption) details.push(`   • Visual Summary: ${an.caption}`);
        if (an.objects?.length) details.push(`   • Key Detected Objects: ${an.objects.join(", ")}`);
        if (an.visibleText) details.push(`   • Visible Text (OCR): "${an.visibleText}"`);
        if (an.dimensions) {
          details.push(
            `   • Original Dimensions: ${an.dimensions.width}×${an.dimensions.height}px (Aspect: ${an.dimensions.aspectRatio.toFixed(2)})`,
          );
        }
        if (an.appearanceNotes?.length) {
          details.push(`   • Canvas Appearance: ${an.appearanceNotes.join("; ")}`);
        }
      } else {
        details.push("   • Visual Summary: Reference image attached on Canvas");
      }

      mappingLines.push(details.join("\n"));
    });

    mappingLines.push(
      "\nInstruction for Creative Director: Correlate each clause in the user request with the exact image tag referenced in that clause. Do NOT interchange images or guess intents.",
    );
  }

  // Build expanded prompt for downstream image models
  const expandedPromptForModel = segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const an = findAnalysis(seg.objectId, seg.displayName);
      if (an?.caption) {
        const keyObjects = an.objects?.length
          ? ` containing ${an.objects.slice(0, 3).join(", ")}`
          : "";
        return `[image: ${an.caption}${keyObjects}]`;
      }
      return `@${seg.displayName}`;
    })
    .join("");

  return {
    displayPrompt,
    segments,
    referencedObjectIds,
    semanticMappingText: mappingLines.join("\n"),
    expandedPromptForModel,
  };
}
