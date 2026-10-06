"use client";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/color/export";
import { extractPalette, fromRgb, type PaletteColor, rgb } from "@/lib/color/studio";
import { getCached } from "@/lib/engine/imageCache";
import styles from "./ColorStudio.module.css";

type Props = {
  colors: PaletteColor[];
  onExtract: (colors: string[]) => void;
  onPick: (color: string) => void;
  selectedFileId?: string;
  onMessage: (message: string) => void;
};
export default function ImageTools({
  colors,
  onExtract,
  onPick,
  selectedFileId,
  onMessage,
}: Props) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [brightness, setBrightness] = useState(100),
    [saturation, setSaturation] = useState(100),
    [grayscale, setGrayscale] = useState(false),
    [recolor, setRecolor] = useState(false),
    [collage, setCollage] = useState(false);
  const [format, setFormat] = useState("image/png"),
    [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    request = useRef(0);
  const [version, setVersion] = useState(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function load(url: string) {
    const id = ++request.current;
    setBusy(true);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (img.width * img.height > 40_000_000) throw new Error("เลือกภาพไม่เกิน 40 ล้านพิกเซล");
      if (id !== request.current) return;
      setSource(img);
      setBrightness(100);
      setSaturation(100);
      setGrayscale(false);
      setRecolor(false);
      setVersion((v) => v + 1);
      onMessage("เปิดภาพในเครื่องแล้ว คลิกบนภาพเพื่อเลือกสี");
    } catch (e) {
      if (id === request.current) onMessage(e instanceof Error ? e.message : "เปิดภาพไม่ได้");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  // Explicit refresh prevents expensive image quantization while dragging palette controls.
  // biome-ignore lint/correctness/useExhaustiveDependencies: controls are captured only after explicit Refresh
  useEffect(() => {
    const target = canvas.current;
    if (!target || !source) return;
    const ctx = target.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale)),
      height = Math.max(1, Math.round(source.height * scale));
    target.width = width;
    target.height = height + (collage ? Math.max(60, Math.round(width * 0.12)) : 0);
    ctx.filter = `brightness(${brightness}%) saturate(${saturation}%) grayscale(${grayscale ? 1 : 0})`;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = "none";
    if (recolor) {
      const pixels = ctx.getImageData(0, 0, width, height),
        palette = colors.map((c) => rgb(c.hex));
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (!pixels.data[i + 3]) continue;
        let best = Infinity,
          index = 0;
        for (let j = 0; j < palette.length; j++) {
          const p = palette[j];
          const d =
            (pixels.data[i] - p[0]) ** 2 +
            (pixels.data[i + 1] - p[1]) ** 2 +
            (pixels.data[i + 2] - p[2]) ** 2;
          if (d < best) {
            best = d;
            index = j;
          }
        }
        pixels.data.set(palette[index], i);
      }
      ctx.putImageData(pixels, 0, 0);
    }
    if (collage)
      colors.forEach((c, i) => {
        ctx.fillStyle = c.hex;
        ctx.fillRect(
          (i * width) / colors.length,
          height,
          width / colors.length + 1,
          target.height - height,
        );
      });
    // Colors and adjustments are captured only on Refresh. The controls expose this explicitly.
    void version;
  }, [source, version]);
  function extract() {
    const target = canvas.current;
    if (!target || !source) return;
    const scratch = document.createElement("canvas");
    const scale = Math.min(1, 192 / Math.max(source.width, source.height));
    scratch.width = Math.max(1, Math.round(source.width * scale));
    scratch.height = Math.max(1, Math.round(source.height * scale));
    const ctx = scratch.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source, 0, 0, scratch.width, scratch.height);
    const found = extractPalette(
      ctx.getImageData(0, 0, scratch.width, scratch.height).data,
      colors.length,
    );
    if (!found.length) {
      onMessage("ภาพนี้ไม่มีสีที่มองเห็น");
      return;
    }
    onExtract(found);
  }
  async function save() {
    const target = canvas.current;
    if (!target) return;
    try {
      let output = target;
      if (format === "image/jpeg") {
        output = document.createElement("canvas");
        output.width = target.width;
        output.height = target.height;
        const ctx = output.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, output.width, output.height);
        ctx.drawImage(target, 0, 0);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob((b) => (b ? resolve(b) : reject(new Error("ส่งออกไม่ได้"))), format, 0.92),
      );
      if (blob.type !== format) throw new Error("เบราว์เซอร์ไม่รองรับไฟล์รูปแบบนี้");
      downloadBlob(blob, `artshift-${collage ? "collage" : "image"}.${format.split("/")[1]}`);
      onMessage("ส่งออกภาพที่แสดงในตัวอย่างแล้ว");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "ส่งออกไม่ได้");
    }
  }
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <label className={styles.file}>
          เปิดภาพ
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 20_000_000) {
                onMessage("เลือกไฟล์ไม่เกิน 20 MB");
                return;
              }
              const url = URL.createObjectURL(f);
              try {
                await load(url);
              } finally {
                URL.revokeObjectURL(url);
              }
            }}
          />
        </label>
        {selectedFileId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const cached = getCached(selectedFileId);
              if (cached) void load(cached.dataURL);
              else onMessage("ไม่พบภาพที่เลือกใน cache");
            }}
          >
            ใช้ภาพที่เลือกใน Artwork
          </button>
        ) : null}
        <span className={styles.muted}>ประมวลผลในเครื่อง • ตัวอย่าง/ส่งออกด้านยาวสูงสุด 1,024 px</span>
      </div>
      {source ? (
        <>
          <div className={styles.row}>
            <label>
              ความสว่าง{" "}
              <input
                type="range"
                min="30"
                max="180"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
              />
            </label>
            <label>
              ความอิ่มสี{" "}
              <input
                type="range"
                min="0"
                max="200"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={grayscale}
                onChange={(e) => setGrayscale(e.target.checked)}
              />{" "}
              ขาวดำ
            </label>
            <label>
              <input
                type="checkbox"
                checked={recolor}
                onChange={(e) => setRecolor(e.target.checked)}
              />{" "}
              ลดสีตามพาเลตต์
            </label>
            <label>
              <input
                type="checkbox"
                checked={collage}
                onChange={(e) => setCollage(e.target.checked)}
              />{" "}
              Collage + แถบสี
            </label>
          </div>
          <div className={styles.row}>
            <button type="button" onClick={() => setVersion((v) => v + 1)}>
              อัปเดตตัวอย่าง
            </button>
            <button type="button" onClick={extract}>
              ดึงพาเลตต์จากต้นฉบับ
            </button>
            <select
              aria-label="ชนิดไฟล์ภาพ"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG (พื้นขาว)</option>
              <option value="image/webp">WebP</option>
            </select>
            <button type="button" onClick={() => void save()}>
              ดาวน์โหลดภาพตัวอย่าง
            </button>
          </div>
        </>
      ) : (
        <div className={styles.empty}>เปิดภาพเพื่อดึงชุดสี ปรับภาพ เปลี่ยนสี หรือสร้าง Collage</div>
      )}
      <canvas
        ref={canvas}
        hidden={!source}
        className={styles.imageCanvas}
        aria-label="ภาพตัวอย่าง คลิกเพื่อเลือกสี"
        onClick={(e) => {
          const target = canvas.current;
          if (!target) return;
          const bounds = target.getBoundingClientRect();
          const x = Math.min(
              target.width - 1,
              Math.floor(((e.clientX - bounds.left) / bounds.width) * target.width),
            ),
            y = Math.min(
              target.height - 1,
              Math.floor(((e.clientY - bounds.top) / bounds.height) * target.height),
            );
          const data = target.getContext("2d")?.getImageData(x, y, 1, 1).data;
          if (data?.[3]) onPick(fromRgb([data[0], data[1], data[2]]));
        }}
      />
    </div>
  );
}
