import { normalizeHex, type PaletteColor } from "./studio";

const KEY = "artshift:color-studio:v1";
export type SavedPalette = {
  id: string;
  name: string;
  project: string;
  collection: string;
  colors: PaletteColor[];
  createdAt: number;
};
export function parsePalette(value: unknown): PaletteColor[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10)
    throw new Error("พาเลตต์ต้องมี 2–10 สี");
  return value.map((c) => {
    const hex = normalizeHex(typeof c === "string" ? c : typeof c?.hex === "string" ? c.hex : "");
    if (!hex) throw new Error("พบรหัสสีที่ไม่ถูกต้อง");
    return { hex, locked: typeof c === "object" && c !== null && c.locked === true };
  });
}
export function readLibrary(): SavedPalette[] {
  if (typeof window === "undefined") return [];
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (data?.version !== 1 || !Array.isArray(data.palettes)) return [];
    return data.palettes.slice(0, 500).flatMap((p: SavedPalette) => {
      try {
        if (!p || typeof p.id !== "string" || typeof p.name !== "string") return [];
        return [
          {
            id: p.id,
            name: p.name.slice(0, 100),
            project: typeof p.project === "string" ? p.project.slice(0, 100) : "",
            collection: typeof p.collection === "string" ? p.collection.slice(0, 100) : "",
            createdAt: Number.isFinite(p.createdAt) ? p.createdAt : 0,
            colors: parsePalette(p.colors),
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
export function writeLibrary(palettes: SavedPalette[]): void {
  if (palettes.length > 500) throw new Error("คลังเต็ม (500 พาเลตต์) ส่งออกสำรองแล้วลบรายการที่ไม่ใช้");
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, palettes }));
  } catch {
    throw new Error("บันทึกไม่ได้ พื้นที่เบราว์เซอร์อาจเต็ม กรุณาส่งออก JSON สำรอง");
  }
}
export function paletteFromUrl(search: string): PaletteColor[] | null {
  const raw = new URLSearchParams(search).get("palette");
  if (!raw) return null;
  try {
    return parsePalette(raw.split("-").map((c) => `#${c}`));
  } catch {
    return null;
  }
}
export function importPalette(text: string): PaletteColor[] {
  if (text.length > 100_000) throw new Error("ไฟล์พาเลตต์ใหญ่เกินไป");
  try {
    const parsed = JSON.parse(text);
    return parsePalette(Array.isArray(parsed) ? parsed : parsed.colors);
  } catch {
    throw new Error("นำเข้า JSON ที่มี colors เป็น HEX 2–10 สีเท่านั้น");
  }
}
