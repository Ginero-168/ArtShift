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

// @[Name:id] matches anywhere (composer often glues tags to Thai words).
// Bare @Name still requires a soft boundary so emails are not treated as tags.
const CANONICAL_TAG_REGEX =
  /(?:@\[([^\]]+)\]|(?:^|(?<=\s|[([{"']))@([A-Za-z0-9_\u0E00-\u0E7F]+))/g;

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

    const isBracketed = Boolean(match[1]);
    const inner = (match[1] || match[2] || "").trim();
    const lastColon = isBracketed ? inner.lastIndexOf(":") : -1;
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
  return extractInlineTagRefs(text).map((tag) => tag.objectId);
}

/**
 * Extracts unique Name Tag refs with display names preserved in first-seen order.
 */
export function extractInlineTagRefs(
  text: string,
): Array<{ objectId: string; displayName: string }> {
  const segments = parseInlineTagTokens(text);
  const refs: Array<{ objectId: string; displayName: string }> = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    if (seg.type !== "tag" || !seg.objectId || seen.has(seg.objectId)) continue;
    seen.add(seg.objectId);
    refs.push({
      objectId: seg.objectId,
      displayName: seg.displayName.trim() || seg.objectId,
    });
  }

  return refs;
}

export type InlineTagReferenceRole = "style" | "layout" | "subject" | "reference";

/**
 * Infers how each Name Tag should be used from surrounding clause language
 * (e.g. "จากสไตล์นี้ @A" → style, "Layout จากรูปนี้ @B" → layout).
 */
export function inferInlineTagRoles(
  text: string,
): Map<string, InlineTagReferenceRole> {
  const roles = new Map<string, InlineTagReferenceRole>();
  const segments = parseInlineTagTokens(text);
  let preceding = "";

  for (const seg of segments) {
    if (seg.type === "text") {
      preceding += seg.text;
      continue;
    }
    const window = preceding.slice(-120).toLowerCase();
    let role: InlineTagReferenceRole = "reference";
    if (
      /(?:สไตล์|style|aesthetic|mood|tone|look\s+and\s+feel|visual\s+style|อิงสไตล์|ตามสไตล์)/iu.test(
        window,
      )
    ) {
      role = "style";
    } else if (
      /(?:layout|เลย์เอาต์|เลย์เอาท์|โครง|composition|template|บรีฟ|brief|โครงสร้าง|กราฟิก)/iu.test(
        window,
      )
    ) {
      role = "layout";
    } else if (
      /(?:แก้ไข|แก้รูป|edit|retouch|subject|ตัวแบบ|คนนี้|รูปนี้|ภาพนี้|อิงจาก|จากรูป)/iu.test(window)
    ) {
      role = "subject";
    }
    if (!roles.has(seg.objectId)) {
      roles.set(seg.objectId, role);
    }
    preceding = "";
  }

  return roles;
}

/** Removes raw @[Name:id] / @Name tokens so they never reach image models. */
export function stripInlineTagTokens(text: string): string {
  const segments = parseInlineTagTokens(text || "");
  if (segments.every((seg) => seg.type === "text")) {
    return (text || "").trim();
  }
  return segments
    .map((seg) => (seg.type === "tag" ? "" : seg.text))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function roleInstruction(role: InlineTagReferenceRole): string {
  switch (role) {
    case "style":
      return "ROLE: STYLE reference — match photographic look, lighting, color grade, and subject treatment. Do NOT copy photographic background slogans/signage from this image unless the brief explicitly requests that text.";
    case "layout":
      return "ROLE: LAYOUT / BRIEF reference — follow composition, typography zones, graphic structure, and messaging hierarchy from this image/brief.";
    case "subject":
      return "ROLE: SUBJECT reference — preserve identity, appearance, and key features of the referenced subject.";
    default:
      return "ROLE: GENERAL visual reference — incorporate relevant visual cues without treating this as anonymous filler.";
  }
}

type AnalysisLike = {
  ref?: { objectId?: string; displayName?: string };
  objectId?: string;
  displayName?: string;
  caption?: string;
  objects?: readonly string[];
  visibleText?: string;
  dimensions?: { width: number; height: number; aspectRatio: number };
  appearanceNotes?: readonly string[];
};

function analysisIdentity(item: AnalysisLike): { objectId: string; displayName: string } {
  return {
    objectId: item.ref?.objectId || item.objectId || "",
    displayName: item.ref?.displayName || item.displayName || "",
  };
}

/**
 * Builds an appendix that labels each attached input_image by Name Tag + role.
 * Image providers only receive anonymous data URLs, so the prompt must carry identity.
 */
export function buildReferenceRoleAppendix(
  prompt: string,
  analyses: readonly AnalysisLike[] = [],
): string {
  const tagRefs = extractInlineTagRefs(prompt);
  const roles = inferInlineTagRoles(prompt);
  if (tagRefs.length === 0 && analyses.length === 0) return "";

  const lines = ["=== INPUT REFERENCE IMAGES (attachment order) ==="];
  const usedIds = new Set<string>();

  const pushLine = (
    index: number,
    displayName: string,
    role: InlineTagReferenceRole,
    caption?: string,
  ) => {
    const title = displayName || `Reference ${index}`;
    const captionBit = caption?.trim() ? ` Visual summary: ${caption.trim().slice(0, 180)}.` : "";
    lines.push(`${index}. "${title}" — ${roleInstruction(role)}${captionBit}`);
  };

  if (tagRefs.length > 0) {
    tagRefs.forEach((tag, idx) => {
      usedIds.add(tag.objectId);
      const analysis =
        analyses.find((item) => analysisIdentity(item).objectId === tag.objectId) ||
        analyses.find(
          (item) =>
            analysisIdentity(item).displayName.toLowerCase() === tag.displayName.toLowerCase(),
        ) ||
        analyses[idx];
      pushLine(idx + 1, tag.displayName, roles.get(tag.objectId) || "reference", analysis?.caption);
    });
  } else {
    analyses.forEach((item, idx) => {
      const identity = analysisIdentity(item);
      if (identity.objectId && usedIds.has(identity.objectId)) return;
      if (identity.objectId) usedIds.add(identity.objectId);
      pushLine(
        idx + 1,
        identity.displayName || `Reference ${idx + 1}`,
        (identity.objectId && roles.get(identity.objectId)) || "reference",
        item.caption,
      );
    });
  }

  lines.push(
    "Refer to these images by number and display name only. Never emit raw Name Tag tokens or UUID handles in the image prompt.",
  );
  return lines.join("\n");
}

/**
 * Strips leaked Name Tag tokens from a refined prompt and appends role-labeled
 * reference instructions so input_images are not anonymous blobs.
 */
export function finalizeRefinedPromptWithNameTags(
  refinedPrompt: string,
  originalPrompt: string,
  analyses: readonly AnalysisLike[] = [],
): string {
  const cleaned = stripInlineTagTokens(refinedPrompt || "");
  const appendix = buildReferenceRoleAppendix(originalPrompt || refinedPrompt || "", analyses);
  if (!appendix) return cleaned || (refinedPrompt || "").trim();
  if (cleaned.includes("=== INPUT REFERENCE IMAGES")) return cleaned;
  return `${cleaned}\n\n${appendix}`.trim();
}

/**
 * Formats a clean display prompt where tokens @[displayName:objectId] are simplified to @displayName.
 */
export function formatDisplayPrompt(text: string): string {
  const segments = parseInlineTagTokens(text);
  return segments.map((seg) => (seg.type === "tag" ? `@${seg.displayName}` : seg.text)).join("");
}

/**
 * Builds a prompt string including all referenced image Name Tags suitable for copying.
 * Preserves existing tags in text, and prepends missing tags from imageRefs.
 */
export function buildPromptWithTagsForCopy(
  content: string,
  imageRefs?: readonly { objectId: string; displayName: string }[],
): string {
  let result = content || "";
  if (imageRefs && imageRefs.length > 0) {
    const missingRefs: { objectId: string; displayName: string }[] = [];
    for (const ref of imageRefs) {
      const tagId = ref.objectId;
      const tagName = ref.displayName;
      const hasTag =
        result.includes(`:${tagId}]`) ||
        result.includes(`@[${tagName}`) ||
        result.includes(`@${tagName}`);
      if (!hasTag) {
        missingRefs.push(ref);
      }
    }
    if (missingRefs.length > 0) {
      const prefix = missingRefs
        .map((r) => `@[${r.displayName}:${r.objectId}]`)
        .join(" ");
      result = `${prefix} ${result}`.trim();
    }
  }
  return result;
}


/**
 * Synthesizes inline tags with their full visual analyses, generating:
 * 1. Semantic mapping linking the sentence structure to visual features
 * 2. An expanded prompt for downstream image generation models
 *
 * Accepts both nested ImageReferenceAnalysis (`ref.displayName`) and the flat
 * Creative Director wire shape (`displayName` / `objectId` at the top level).
 */
export function synthesizePromptWithInlineTags(
  prompt: string,
  analyses: readonly AnalysisLike[],
): InlinePromptSynthesis {
  const segments = parseInlineTagTokens(prompt);
  const referencedObjectIds = extractInlineTagObjectIds(prompt);
  const displayPrompt = formatDisplayPrompt(prompt);
  const roles = inferInlineTagRoles(prompt);

  const analysisByObjectId = new Map<string, AnalysisLike>();
  const analysisByDisplayName = new Map<string, AnalysisLike>();

  for (const item of analyses) {
    const identity = analysisIdentity(item);
    if (identity.objectId) {
      analysisByObjectId.set(identity.objectId, item);
    }
    if (identity.displayName) {
      analysisByDisplayName.set(identity.displayName.toLowerCase(), item);
    }
  }

  // Fall back to attachment order when the wire payload dropped objectIds.
  const orderedAnalyses = [...analyses];

  const findAnalysis = (
    objectId: string,
    displayName: string,
    occurrenceIndex: number,
  ): AnalysisLike | undefined => {
    return (
      analysisByObjectId.get(objectId) ||
      analysisByDisplayName.get(displayName.toLowerCase()) ||
      orderedAnalyses[occurrenceIndex]
    );
  };

  // Build semantic mapping text
  const mappingLines: string[] = [];
  const tagOccurrences: Array<{
    displayName: string;
    objectId: string;
    role: InlineTagReferenceRole;
    analysis?: AnalysisLike;
  }> = [];

  let tagIndex = 0;
  for (const seg of segments) {
    if (seg.type === "tag") {
      const analysis = findAnalysis(seg.objectId, seg.displayName, tagIndex);
      tagOccurrences.push({
        displayName: seg.displayName,
        objectId: seg.objectId,
        role: roles.get(seg.objectId) || "reference",
        analysis,
      });
      tagIndex += 1;
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
      const details: string[] = [
        `${idx + 1}. ${title} (Object ID: "${item.objectId}", Role: ${item.role}):`,
      ];

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
      "\nInstruction for Creative Director: Correlate each clause in the user request with the exact image tag referenced in that clause. Honor inferred roles (style vs layout vs subject). Do NOT interchange images or guess intents. Never put raw @[Name:id] or UUID tokens into refinedPrompt — refer to Reference N by display name and role only. The images are also supplied as input_images in the same order.",
    );
  }

  // Build expanded prompt for downstream image models
  let expandIndex = 0;
  const expandedPromptForModel = segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const an = findAnalysis(seg.objectId, seg.displayName, expandIndex);
      expandIndex += 1;
      const role = roles.get(seg.objectId) || "reference";
      if (an?.caption) {
        const keyObjects = an.objects?.length
          ? ` containing ${an.objects.slice(0, 3).join(", ")}`
          : "";
        return `[${role} reference "${seg.displayName}": ${an.caption}${keyObjects}]`;
      }
      return `[${role} reference "${seg.displayName}"]`;
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

/**
 * Cleans internal / technical prefixes and command noise from user-facing prompts or summaries.
 * e.g. "Edit ภาพ @[Cat:id] ด้วย Prompt : สร้างรูปแมว" -> "สร้างรูปแมว"
 */
export function cleanTechnicalPromptText(text: string): string {
  let s = (text || "").trim();
  // Strip common technical prefixes
  s = s.replace(/^(?:Edit|แก้ไข|ปรับแต่ง)\s+(?:ภาพ|รูป|image)?\s*(?:@\[[^\]]+\]|@[^\s]+|[^\s]+)?\s*(?:ด้วย\s*(?:Prompt|คำสั่ง)\s*:\s*|with\s+prompt\s*:\s*)/iu, "");
  s = s.replace(/^Edit\s+image\s+.*?with\s+prompt\s*:\s*/iu, "");
  s = s.replace(/^propose_creative_direction\s*:\s*/iu, "");
  s = s.replace(/^propose_design_plan\s*:\s*/iu, "");
  s = s.replace(/^(?:วางแผน|คำสั่ง|Prompt)\s*:\s*/iu, "");
  // Replace tag format @[name:id] with @name
  s = s.replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "@$1");
  // Remove technical JSON if wrapped
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed.summary) s = parsed.summary;
      else if (parsed.text) s = parsed.text;
    } catch {}
  }
  return s.trim();
}

