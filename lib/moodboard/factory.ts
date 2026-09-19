import type {
  MoodboardCredit,
  MoodboardItem,
  MoodboardItemKind,
  MoodboardRole,
} from "@/lib/engine/types";
import { lightTiltRadians } from "./tilt";

export type CreateMoodboardItemInput = {
  kind: MoodboardItemKind;
  role?: MoodboardRole;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  src?: string;
  fileId?: string;
  text?: string;
  query?: string;
  color?: string;
  credit?: MoodboardCredit;
  placeholder?: boolean;
  tilt?: boolean;
};

const DEFAULT_SIZE: Record<MoodboardItemKind, { width: number; height: number }> = {
  image: { width: 280, height: 210 },
  placeholder: { width: 260, height: 196 },
  note: { width: 200, height: 180 },
  chip: { width: 150, height: 44 },
};

export function createMoodboardItem(input: CreateMoodboardItemInput): MoodboardItem {
  const size = DEFAULT_SIZE[input.kind];
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    role: input.role,
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? size.width,
    height: input.height ?? size.height,
    rotation: input.rotation ?? (input.tilt === false ? 0 : lightTiltRadians()),
    src: input.src,
    fileId: input.fileId,
    text: input.text,
    query: input.query,
    color: input.color,
    credit: input.credit,
    placeholder: input.placeholder ?? input.kind === "placeholder",
  };
}

export function createMoodboardNote(text = "", x = 0, y = 0): MoodboardItem {
  return createMoodboardItem({
    kind: "note",
    text: text || "Note",
    x,
    y,
    color: "#fde68a",
    tilt: true,
  });
}
