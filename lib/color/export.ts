import { type PaletteColor, rgb } from "./studio";
export type PaletteFormat = "json" | "css" | "scss" | "svg" | "ase" | "tailwind" | "png" | "pdf";
function xml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
}
export function paletteSvg(colors: PaletteColor[], name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420" viewBox="0 0 1000 420"><rect width="1000" height="420" fill="#fff"/><text x="24" y="38" font-family="sans-serif" font-size="24" fill="#222">${xml(name)}</text>${colors.map((c, i) => `<rect x="${(i * 1000) / colors.length}" y="64" width="${1000 / colors.length}" height="290" fill="${c.hex}"/><text x="${((i + 0.5) * 1000) / colors.length}" y="388" text-anchor="middle" font-family="monospace" font-size="18" fill="#222">${c.hex.toUpperCase()}</text>`).join("")}</svg>`;
}
export function paletteCode(
  colors: PaletteColor[],
  format: "json" | "css" | "scss" | "tailwind",
  name: string,
): string {
  if (format === "json") return JSON.stringify({ version: 1, name, colors }, null, 2);
  if (format === "scss") return colors.map((c, i) => `$palette-${i + 1}: ${c.hex};`).join("\n");
  if (format === "tailwind")
    return `/* Tailwind CSS v4 */\n@theme {\n${colors.map((c, i) => `  --color-palette-${i + 1}: ${c.hex};`).join("\n")}\n}`;
  return `:root {\n${colors.map((c, i) => `  --palette-${i + 1}: ${c.hex};`).join("\n")}\n}`;
}
/** Adobe Swatch Exchange 1.0, RGB global color blocks, big-endian UTF-16 names. */
export function paletteAse(colors: PaletteColor[]): Uint8Array {
  const blocks = colors.map((c) => {
    const name = c.hex.toUpperCase(),
      length = 2 + (name.length + 1) * 2 + 4 + 12 + 2;
    const bytes = new Uint8Array(6 + length);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 1);
    view.setUint32(2, length);
    view.setUint16(6, name.length + 1);
    let offset = 8;
    for (const char of name) {
      view.setUint16(offset, char.charCodeAt(0));
      offset += 2;
    }
    offset += 2;
    bytes.set([82, 71, 66, 32], offset);
    offset += 4;
    for (const v of rgb(c.hex)) {
      view.setFloat32(offset, v / 255);
      offset += 4;
    }
    view.setUint16(offset, 0);
    return bytes;
  });
  const out = new Uint8Array(12 + blocks.reduce((s, b) => s + b.length, 0));
  out.set([65, 83, 69, 70]);
  const v = new DataView(out.buffer);
  v.setUint16(4, 1);
  v.setUint16(6, 0);
  v.setUint32(8, blocks.length);
  let offset = 12;
  for (const b of blocks) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPalette(
  colors: PaletteColor[],
  name: string,
  format: PaletteFormat,
): Promise<void> {
  const file = name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 70) || "palette";
  if (format === "ase") {
    downloadBlob(
      new Blob([new Uint8Array(paletteAse(colors))], { type: "application/octet-stream" }),
      `${file}.ase`,
    );
    return;
  }
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text("ArtShift Palette", 14, 20);
    colors.forEach((c, i) => {
      const x = 14 + (i * 269) / colors.length;
      const [r, g, b] = rgb(c.hex);
      doc.setFillColor(r, g, b);
      doc.rect(x, 32, 269 / colors.length, 110, "F");
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text(c.hex.toUpperCase(), x + 2, 151);
    });
    doc.save(`${file}.pdf`);
    return;
  }
  if (format === "png") {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(paletteSvg(colors, name))}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("สร้างภาพไม่ได้");
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export ไม่สำเร็จ"))), "image/png"),
    );
    downloadBlob(blob, `${file}.png`);
    return;
  }
  const text = format === "svg" ? paletteSvg(colors, name) : paletteCode(colors, format, name);
  downloadBlob(
    new Blob([text], {
      type:
        format === "svg" ? "image/svg+xml" : format === "json" ? "application/json" : "text/plain",
    }),
    `${file}.${format === "tailwind" ? "css" : format}`,
  );
}
