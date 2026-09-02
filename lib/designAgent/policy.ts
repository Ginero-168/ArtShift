export type DesignIntentKind =
  | "answer"
  | "clarification"
  | "local-edit"
  | "destructive"
  | "generation"
  | "complex-design";

export type ExecutionPolicy = {
  kind: DesignIntentKind;
  route: "direct" | "orchestrator";
  requiresApproval: boolean;
  needsVisualAnalysis: boolean;
  mayUseRemote: boolean;
};

const EDIT_WORDS = [
  "เปลี่ยน",
  "แก้",
  "ปรับ",
  "ขยับ",
  "จัด",
  "resize",
  "move",
  "change",
  "edit",
  "update",
  "align",
  "make",
];
const DESTRUCTIVE_WORDS = ["ลบ", "delete", "remove", "แทนที่ทั้งหมด", "replace artwork"];
const COMPLEX_WORDS = [
  "ออกแบบ",
  "design",
  "layout",
  "หลาย",
  "แบบ",
  "ขนาด",
  "variant",
  "campaign",
  "poster",
  "banner",
  "social",
  "จาก reference",
  "from reference",
  "brand",
  "มู้ดบอร์ด",
  "moodboard",
];
const VISUAL_WORDS = [
  "รูป",
  "ภาพ",
  "image",
  "photo",
  "reference",
  "visual",
  "สี",
  "style",
  "background",
  "พื้นหลัง",
  "crop",
  "mask",
];

export function classifyDesignIntent(prompt: string, hasSelection: boolean): DesignIntentKind {
  const value = prompt.trim().toLocaleLowerCase();
  if (!value) return "clarification";
  if (DESTRUCTIVE_WORDS.some((word) => value.includes(word))) return "destructive";

  const hasEditWord = EDIT_WORDS.some((word) => value.includes(word));
  const hasComplexWord = COMPLEX_WORDS.some((word) => value.includes(word));
  const hasVisualWord = VISUAL_WORDS.some((word) => value.includes(word));
  const looksLikeVagueGeneration = /^(สร้าง|ทำ|generate|create)\s*(รูป|ภาพ|image)?\s*$/.test(value);

  if (looksLikeVagueGeneration) return "clarification";
  if (hasSelection && hasEditWord && !hasComplexWord) return "local-edit";
  if (hasComplexWord || (hasVisualWord && !hasSelection && value.length > 35))
    return "complex-design";
  if (
    hasVisualWord &&
    (value.includes("สร้าง") || value.includes("generate") || value.includes("create"))
  ) {
    return "generation";
  }
  if (hasEditWord) return hasSelection ? "local-edit" : "clarification";
  if (
    value.includes("ทำไม") ||
    value.includes("อธิบาย") ||
    value.includes("why") ||
    value.includes("explain")
  ) {
    return "answer";
  }
  return "answer";
}

export function getExecutionPolicy(prompt: string, hasSelection: boolean): ExecutionPolicy {
  const kind = classifyDesignIntent(prompt, hasSelection);
  switch (kind) {
    case "local-edit":
      return {
        kind,
        route: "direct",
        requiresApproval: false,
        needsVisualAnalysis: needsVisualAnalysis(prompt, false),
        mayUseRemote: false,
      };
    case "destructive":
      return {
        kind,
        route: "orchestrator",
        requiresApproval: true,
        needsVisualAnalysis: needsVisualAnalysis(prompt, true),
        mayUseRemote: false,
      };
    case "generation":
      return {
        kind,
        route: "orchestrator",
        requiresApproval: true,
        needsVisualAnalysis: needsVisualAnalysis(prompt, true),
        mayUseRemote: true,
      };
    case "complex-design":
      return {
        kind,
        route: "orchestrator",
        requiresApproval: true,
        needsVisualAnalysis: needsVisualAnalysis(prompt, true),
        mayUseRemote: true,
      };
    case "clarification":
      return {
        kind,
        route: "orchestrator",
        requiresApproval: false,
        needsVisualAnalysis: false,
        mayUseRemote: false,
      };
    default:
      return {
        kind: "answer",
        route: "orchestrator",
        requiresApproval: false,
        needsVisualAnalysis: false,
        mayUseRemote: false,
      };
  }
}

function needsVisualAnalysis(prompt: string, visualOperation: boolean): boolean {
  if (!visualOperation) return false;
  const value = prompt.toLocaleLowerCase();
  return VISUAL_WORDS.some((word) => value.includes(word));
}
