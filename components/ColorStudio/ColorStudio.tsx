"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { requestCoPilotExternalTurn } from "@/lib/ai/coPilotRequestBus";
import { artworkColors, recolorArtwork } from "@/lib/color/artwork";
import { exportPalette, type PaletteFormat, paletteCode } from "@/lib/color/export";
import {
  importPalette,
  paletteFromUrl,
  readLibrary,
  type SavedPalette,
  writeLibrary,
} from "@/lib/color/library";
import {
  adjustPalette,
  CURATED_PALETTES,
  colorInfo,
  contrast,
  fromHsl,
  generatePalette,
  gradientPalette,
  type Harmony,
  normalizeHex,
  type PaletteColor,
  readableInk,
  simulateVision,
  toHsl,
  type Vision,
} from "@/lib/color/studio";
import { openEyedropper, supportsEyedropper } from "@/lib/color/swatches";
import { serializeSlideToSVG } from "@/lib/engine/exportSVG";
import { useEngine } from "@/lib/engine/store";
import { THAI_FONTS } from "@/lib/fonts";
import styles from "./ColorStudio.module.css";
import ImageTools from "./ImageTools";

const TABS = [
  { id: "generate", label: "สร้างชุดสี" },
  { id: "explore", label: "สำรวจ / คลัง" },
  { id: "image", label: "สีจากภาพ" },
  { id: "preview", label: "ทดลอง / Recolor" },
  { id: "check", label: "ตรวจสี" },
  { id: "gradient", label: "Gradient" },
  { id: "fonts", label: "ตัวอักษร" },
  { id: "export", label: "ส่งออก" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const DEFAULT: PaletteColor[] = CURATED_PALETTES[0].colors.map((hex) => ({ hex, locked: false }));
const HARMONIES: { value: Harmony; label: string }[] = [
  { value: "balanced", label: "สมดุล" },
  { value: "analogous", label: "สีใกล้เคียง" },
  { value: "complementary", label: "สีคู่ตรงข้าม" },
  { value: "triadic", label: "สามเส้า" },
  { value: "monochrome", label: "สีเดียวหลายเฉด" },
];
const VISION: { value: Vision; label: string }[] = [
  { value: "normal", label: "ปกติ" },
  { value: "protanopia", label: "Protanopia" },
  { value: "deuteranopia", label: "Deuteranopia" },
  { value: "tritanopia", label: "Tritanopia" },
  { value: "grayscale", label: "ขาวดำ" },
];

function HexField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = !normalizeHex(draft);
  const apply = () => {
    const next = normalizeHex(draft);
    if (next) onChange(next);
  };
  return (
    <input
      aria-label={label}
      aria-invalid={invalid}
      value={draft}
      maxLength={7}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}
function Swatches({ colors, onClick }: { colors: readonly string[]; onClick?: () => void }) {
  const content = (
    <>
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} title={c} />
      ))}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={styles.swatches}
      onClick={onClick}
      aria-label={`ใช้พาเลตต์ ${colors.join(" ")}`}
    >
      {content}
    </button>
  ) : (
    <div className={styles.swatches}>{content}</div>
  );
}

function LocalSvgPreview({ src, alt }: { src: string; alt: string }) {
  // biome-ignore lint/performance/noImgElement: this is a generated local SVG preview, not a network image.
  return <img className={styles.artwork} src={src} alt={alt} />;
}

export default function ColorStudio({
  modal = false,
  onClose,
}: {
  modal?: boolean;
  onClose?: () => void;
}) {
  const [source] = useState(() => (modal ? useEngine.getState().currentSlide() : undefined));
  const [selected] = useState(() =>
    modal ? new Set(useEngine.getState().selectedIds) : new Set<string>(),
  );
  const [history, setHistory] = useState<{
    past: PaletteColor[][];
    present: PaletteColor[];
    future: PaletteColor[][];
  }>(() => ({
    past: [],
    present: paletteFromUrl(typeof location === "undefined" ? "" : location.search) ?? DEFAULT,
    future: [],
  }));
  const colors = history.present;
  const [tab, setTab] = useState<Tab>("generate"),
    [harmony, setHarmony] = useState<Harmony>("balanced"),
    [active, setActive] = useState(0),
    [message, setMessage] = useState("ล็อกสีที่ต้องการเก็บ แล้วสร้างชุดสีใหม่ได้ด้วย Space");
  const [library, setLibrary] = useState(readLibrary),
    [name, setName] = useState("My palette"),
    [project, setProject] = useState(() => (modal ? useEngine.getState().doc.title : "")),
    [collection, setCollection] = useState("Brand"),
    [query, setQuery] = useState("");
  const [vision, setVision] = useState<Vision>("normal"),
    [foreground, setForeground] = useState("#232529"),
    [background, setBackground] = useState("#f8f4e9");
  const [hue, setHue] = useState(0),
    [saturation, setSaturation] = useState(0),
    [lightness, setLightness] = useState(0),
    [temperature, setTemperature] = useState(0);
  const [gradientStart, setGradientStart] = useState("#d64418"),
    [gradientEnd, setGradientEnd] = useState("#403c99"),
    [gradientCount, setGradientCount] = useState(5),
    [angle, setAngle] = useState(90),
    [gradientType, setGradientType] = useState("linear");
  const [format, setFormat] = useState<PaletteFormat>("svg"),
    [exportBusy, setExportBusy] = useState(false);
  const [scope, setScope] = useState(selected.size ? "selection" : "artwork"),
    [includeBackground, setIncludeBackground] = useState(false),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [original, setOriginal] = useState(false);
  const [font, setFont] = useState(THAI_FONTS[0].cssFamily),
    [sample, setSample] = useState("สีที่ใช่ ให้เรื่องราวของคุณ\nMake something meaningful."),
    [prompt, setPrompt] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeIndex = Math.min(active, colors.length - 1),
    activeColor = colors[activeIndex];
  const info = colorInfo(activeColor.hex),
    ratio = contrast(foreground, background);
  const scopedIds = scope === "selection" ? selected : undefined;
  const sourceColors = useMemo(
    () => (source ? artworkColors(source, scopedIds) : []),
    [source, scopedIds],
  );
  const deferredMap = useDeferredValue(mapping);
  const result = useMemo(
    () => (source ? recolorArtwork(source, deferredMap, scopedIds, includeBackground) : null),
    [source, deferredMap, scopedIds, includeBackground],
  );
  const artworkPreview = useMemo(() => {
    if (!source || !result || tab !== "preview") return "";
    try {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSlideToSVG(original ? source : result.slide))}`;
    } catch {
      return "";
    }
  }, [source, result, original, tab]);
  const gradient = gradientPalette(gradientStart, gradientEnd, gradientCount);
  const gradientCss =
    gradientType === "linear"
      ? `linear-gradient(${angle}deg, ${colors.map((c) => c.hex).join(", ")})`
      : `radial-gradient(circle, ${colors.map((c) => c.hex).join(", ")})`;
  const selectedImage = source?.elements.find((el) => selected.has(el.id) && el.type === "image");
  const previewColors = colors.map((c) => simulateVision(c.hex, vision));
  const search = query.toLowerCase().trim();
  const palettes = CURATED_PALETTES.filter((p) =>
    `${p.name} ${p.tags} ${p.colors.join(" ")}`.toLowerCase().includes(search),
  );
  const saved = library.filter((p) =>
    `${p.name} ${p.project} ${p.collection} ${p.colors.map((c) => c.hex).join(" ")}`
      .toLowerCase()
      .includes(search),
  );

  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [modal]);
  useEffect(() => {
    const listener = () => setLibrary(readLibrary());
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  function commit(next: PaletteColor[]) {
    setHistory((h) => ({ past: [...h.past, h.present].slice(-40), present: next, future: [] }));
  }
  function undo() {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
        : h,
    );
  }
  function redo() {
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );
  }
  function generate() {
    commit(generatePalette(colors, harmony));
    setMessage("สร้างชุดสีใหม่แล้ว สีที่ล็อกไว้ยังคงเดิม");
  }
  function setColor(index: number, hex: string) {
    commit(colors.map((c, i) => (i === index ? { ...c, hex } : c)));
  }
  function loadPalette(values: readonly string[]) {
    const next = values.slice(0, 10).map((hex) => ({ hex, locked: false }));
    while (next.length < 2) next.push({ hex: next[0]?.hex ?? "#ffffff", locked: false });
    commit(next);
    setMessage("โหลดพาเลตต์แล้ว ปรับและล็อกสีได้ตามต้องการ");
  }
  function move(index: number, to: number) {
    if (to < 0 || to >= colors.length) return;
    const next = [...colors];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    commit(next);
    setActive(to);
  }
  function save() {
    try {
      const current = readLibrary();
      const entry: SavedPalette = {
        id: crypto.randomUUID(),
        name: name.trim() || "Untitled palette",
        project: project.trim(),
        collection: collection.trim(),
        colors: colors.map((c) => ({ ...c })),
        createdAt: Date.now(),
      };
      const next = [entry, ...current];
      writeLibrary(next);
      setLibrary(next);
      setMessage("บันทึกลงคลังสีในเบราว์เซอร์นี้แล้ว");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }
  function removeSaved(id: string) {
    try {
      const next = readLibrary().filter((p) => p.id !== id);
      writeLibrary(next);
      setLibrary(next);
      setMessage("ลบพาเลตต์ออกจากคลังแล้ว");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ลบไม่ได้");
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("คัดลอกแล้ว");
    } catch {
      setMessage("คัดลอกอัตโนมัติไม่ได้ เลือกข้อความหรือส่งออกไฟล์แทน");
    }
  }
  function suggestMapping() {
    const next: Record<string, string> = {};
    sourceColors.forEach((hex, i) => {
      next[hex] = colors[i % colors.length].hex;
    });
    setMapping(next);
    setMessage("จัดสีตามลำดับแล้ว ตรวจตัวอย่างและคู่สีข้อความก่อนกดใช้");
  }
  function applyArtwork() {
    if (!source || !result) return;
    const fresh = recolorArtwork(source, mapping, scopedIds, includeBackground);
    if (!fresh.changed) {
      setMessage("ยังไม่มีสีที่เปลี่ยน");
      return;
    }
    if (!useEngine.getState().commitColorStudio(source, fresh.slide)) {
      setMessage("Artwork เปลี่ยนระหว่างเปิด Studio กรุณาปิดแล้วเปิดใหม่เพื่อใช้ข้อมูลล่าสุด");
      return;
    }
    onClose?.();
  }
  function askAssistant() {
    if (!modal) return;
    const text = prompt.trim();
    if (!text) {
      setMessage("บอกแนวทางสีที่ต้องการก่อน");
      return;
    }
    requestCoPilotExternalTurn({
      prompt: `ช่วยแนะนำชุดสีสำหรับงานออกแบบ ตอบเป็นคำแนะนำและรหัส HEX เท่านั้น ไม่สร้างภาพหรือแก้ Artwork โดยอัตโนมัติ\nพาเลตต์ปัจจุบัน: ${colors.map((c) => c.hex + (c.locked ? " (ล็อก)" : "")).join(", ")}\nคำขอ: ${text}`,
      imageObjectIds: [],
      openAssistant: true,
    });
    onClose?.();
  }

  const content = (
    <div
      className={styles.studio}
      data-testid="color-studio"
      onKeyDown={(e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        const typing = target.matches("input,textarea,select") || target.isContentEditable;
        if (e.key === "Escape" && !typing && modal) {
          e.preventDefault();
          onClose?.();
        }
        if (!typing && e.code === "Space" && !target.closest("button,a,label")) {
          e.preventDefault();
          generate();
        }
        if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ARTSHIFT / COLOR STUDIO</span>
          <h1>สีที่ใช่ เริ่มตรงนี้</h1>
        </div>
        <div className={styles.row}>
          <button
            type="button"
            disabled={!history.past.length}
            onClick={undo}
            aria-label="Undo palette"
          >
            ↶
          </button>
          <button
            type="button"
            disabled={!history.future.length}
            onClick={redo}
            aria-label="Redo palette"
          >
            ↷
          </button>
          <button type="button" onClick={save}>
            บันทึกพาเลตต์
          </button>
          {modal ? (
            <button type="button" onClick={onClose} aria-label="Close Color Studio">
              ปิด ×
            </button>
          ) : (
            <a href="/projects">กลับโปรเจกต์ ↗</a>
          )}
        </div>
      </header>
      <div
        className={styles.palette}
        style={{ gridTemplateColumns: `repeat(${colors.length},minmax(0,1fr))` }}
      >
        {colors.map((c, i) => (
          <div
            key={i}
            className={styles.color}
            draggable
            onDragStart={() => setDragged(i)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged !== null) move(dragged, i);
              setDragged(null);
            }}
            style={{
              background: simulateVision(c.hex, vision),
              color: readableInk(simulateVision(c.hex, vision)),
            }}
          >
            <div className={styles.colorActions}>
              <button
                type="button"
                aria-label={`ล็อกสี ${i + 1}`}
                aria-pressed={c.locked}
                onClick={() =>
                  commit(colors.map((v, j) => (i === j ? { ...v, locked: !v.locked } : v)))
                }
              >
                {c.locked ? "ล็อกแล้ว" : "ล็อก"}
              </button>
              <button
                type="button"
                aria-label={`ลบสี ${i + 1}`}
                disabled={colors.length <= 2}
                onClick={() => commit(colors.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <button
              type="button"
              className={styles.colorSelect}
              aria-label={`เลือกสี ${i + 1} ${c.hex}`}
              aria-pressed={activeIndex === i}
              onClick={() => setActive(i)}
            >
              {c.hex.toUpperCase()}
              <small>{colorInfo(c.hex).name}</small>
            </button>
            <div className={styles.colorActions}>
              <button
                type="button"
                disabled={i === 0}
                aria-label={`ย้ายสี ${i + 1} ไปซ้าย`}
                onClick={() => move(i, i - 1)}
              >
                ←
              </button>
              <input
                aria-label={`แก้สี ${i + 1}`}
                type="color"
                value={c.hex}
                onChange={(e) => setColor(i, e.target.value)}
              />
              <button
                type="button"
                disabled={i === colors.length - 1}
                aria-label={`ย้ายสี ${i + 1} ไปขวา`}
                onClick={() => move(i, i + 1)}
              >
                →
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={generate}>
            สร้างชุดสีใหม่ <kbd>Space</kbd>
          </button>
          <select
            aria-label="กฎการจับคู่สี"
            value={harmony}
            onChange={(e) => setHarmony(e.target.value as Harmony)}
          >
            {HARMONIES.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={colors.length >= 10}
            onClick={() =>
              commit([...colors, { hex: fromHsl(Math.random() * 360, 0.5, 0.65), locked: false }])
            }
          >
            + สี
          </button>
          <span className={styles.muted}>{colors.length}/10 สี</span>
        </div>
        <HexField
          value={activeColor.hex}
          label="HEX สีที่เลือก"
          onChange={(hex) => setColor(activeIndex, hex)}
        />
      </div>
      <nav className={styles.tabs} aria-label="Color Studio tools">
        {TABS.map((t) => (
          <button type="button" key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className={styles.main}>
        {tab === "generate" ? (
          <div className={styles.twoColumns}>
            <section className={styles.panel}>
              <h2>ปรับอารมณ์ทั้งชุด</h2>
              <p className={styles.muted}>การปรับจะเว้นสีที่ล็อกไว้</p>
              {[
                { label: "Hue", value: hue, min: -180, max: 180, set: setHue },
                { label: "ความอิ่มสี", value: saturation, min: -50, max: 50, set: setSaturation },
                { label: "ความสว่าง", value: lightness, min: -40, max: 40, set: setLightness },
                { label: "อุณหภูมิสี", value: temperature, min: -50, max: 50, set: setTemperature },
              ].map((a) => (
                <label className={styles.range} key={a.label}>
                  <span>
                    {a.label}
                    <output>{a.value}</output>
                  </span>
                  <input
                    type="range"
                    min={a.min}
                    max={a.max}
                    value={a.value}
                    onChange={(e) => a.set(Number(e.target.value))}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => {
                  commit(
                    adjustPalette(colors, hue, saturation / 100, lightness / 100, temperature),
                  );
                  setHue(0);
                  setSaturation(0);
                  setLightness(0);
                  setTemperature(0);
                }}
              >
                ใช้การปรับสี
              </button>
            </section>
            <section className={styles.panel}>
              <h2>
                {info.name} <span className={styles.muted}>{activeColor.hex}</span>
              </h2>
              <dl className={styles.info}>
                <dt>RGB</dt>
                <dd>{info.rgb.join(", ")}</dd>
                <dt>HSL</dt>
                <dd>{info.hsl.join(", ")}</dd>
                <dt>CMYK*</dt>
                <dd>{info.cmyk.join(", ")}</dd>
              </dl>
              <p className={styles.muted}>*ค่าประมาณจาก RGB ไม่ผ่านโปรไฟล์สีสำหรับโรงพิมพ์</p>
              <div className={styles.row}>
                <button type="button" onClick={() => void copy(activeColor.hex)}>
                  คัดลอก HEX
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!supportsEyedropper()) {
                      setMessage("เบราว์เซอร์นี้ยังไม่รองรับเครื่องมือดูดสีจากหน้าจอ");
                      return;
                    }
                    const picked = await openEyedropper();
                    if (picked) setColor(activeIndex, picked);
                  }}
                >
                  ดูดสีจากหน้าจอ
                </button>
              </div>
              <h3>เฉดสว่าง–เข้ม</h3>
              <Swatches
                colors={Array.from({ length: 9 }, (_, i) => {
                  const [h, s] = toHsl(activeColor.hex);
                  return fromHsl(h, s, 0.1 + i * 0.1);
                })}
              />
              <div className={styles.row}>
                <button
                  type="button"
                  onClick={() => loadPalette(gradientPalette("#ffffff", activeColor.hex, 5))}
                >
                  ใช้ Tints
                </button>
                <button
                  type="button"
                  onClick={() => loadPalette(gradientPalette(activeColor.hex, "#000000", 5))}
                >
                  ใช้ Shades
                </button>
              </div>
            </section>
            <section className={`${styles.panel} ${styles.full}`}>
              <h2>Color Assistant</h2>
              {modal ? (
                <>
                  <p className={styles.muted}>
                    ส่งพาเลตต์และคำถามไปยัง AI Assistance ที่ตั้งค่าไว้ใน ArtShift
                  </p>
                  <div className={styles.row}>
                    <input
                      className={styles.grow}
                      value={prompt}
                      maxLength={2000}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="เช่น สีสำหรับสำนักพิมพ์ที่อบอุ่นแต่ร่วมสมัย"
                      aria-label="คำถามเรื่องสี"
                    />
                    <button type="button" onClick={askAssistant}>
                      ถาม AI Assistance ↗
                    </button>
                  </div>
                </>
              ) : (
                <p>เปิด Color Studio จาก Editor เพื่อใช้ AI Assistance ของโปรเจกต์</p>
              )}
            </section>
          </div>
        ) : null}
        {tab === "explore" ? (
          <div className={styles.stack}>
            <div className={styles.row}>
              <input
                className={styles.grow}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="ค้นหาพาเลตต์"
                placeholder="ค้นชื่อ สี สไตล์ โปรเจกต์ หรือ Collection"
              />
              <label className={styles.file}>
                นำเข้า JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      if (f.size > 100_000) throw new Error("ไฟล์ใหญ่เกินไป");
                      commit(importPalette(await f.text()));
                      setMessage("นำเข้าพาเลตต์แล้ว");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "นำเข้าไม่ได้");
                    }
                  }}
                />
              </label>
            </div>
            <h2>คัดสรรสำหรับ ArtShift</h2>
            <div className={styles.cards}>
              {palettes.map((p) => (
                <article className={styles.paletteCard} key={p.name}>
                  <Swatches colors={p.colors} onClick={() => loadPalette(p.colors)} />
                  <strong>{p.name}</strong>
                  <span className={styles.muted}>{p.tags}</span>
                </article>
              ))}
            </div>
            {!palettes.length ? <p>ไม่พบพาเลตต์ที่ตรงกับคำค้น</p> : null}
            <h2>
              คลังของคุณ <span className={styles.muted}>ในเบราว์เซอร์นี้</span>
            </h2>
            <div className={styles.row}>
              <label>
                ชื่อ
                <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Project
                <input
                  value={project}
                  maxLength={100}
                  onChange={(e) => setProject(e.target.value)}
                />
              </label>
              <label>
                Collection
                <input
                  value={collection}
                  maxLength={100}
                  onChange={(e) => setCollection(e.target.value)}
                />
              </label>
              <button type="button" onClick={save}>
                บันทึกชุดสีนี้
              </button>
            </div>
            <div className={styles.cards}>
              {saved.map((p) => (
                <article key={p.id} className={styles.paletteCard}>
                  <Swatches
                    colors={p.colors.map((c) => c.hex)}
                    onClick={() => {
                      commit(p.colors);
                      setName(p.name);
                      setProject(p.project);
                      setCollection(p.collection);
                      setMessage(`โหลด ${p.name}`);
                    }}
                  />
                  <strong>{p.name}</strong>
                  <span className={styles.muted}>
                    {[p.project, p.collection].filter(Boolean).join(" / ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSaved(p.id)}
                    aria-label={`ลบ ${p.name}`}
                  >
                    ลบ
                  </button>
                </article>
              ))}
            </div>
            {!saved.length ? (
              <p className={styles.muted}>ยังไม่มีพาเลตต์ที่ตรงกับคำค้น บันทึกชุดแรกได้จากปุ่มด้านบน</p>
            ) : null}
          </div>
        ) : null}
        {tab === "image" ? (
          <ImageTools
            colors={colors}
            onExtract={loadPalette}
            onPick={(hex) => {
              setColor(activeIndex, hex);
              setMessage(`เลือก ${hex} ให้สีช่อง ${activeIndex + 1}`);
            }}
            selectedFileId={selectedImage?.type === "image" ? selectedImage.fileId : undefined}
            onMessage={setMessage}
          />
        ) : null}
        {tab === "preview" ? (
          <div className={styles.stack}>
            <div className={styles.row}>
              <label>
                จำลองการมองเห็น
                <select value={vision} onChange={(e) => setVision(e.target.value as Vision)}>
                  {VISION.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.muted}>การจำลองมีผลกับแถบสีและตัวอย่าง UI ไม่เปลี่ยนสีที่บันทึก</span>
            </div>
            <div
              className={styles.designPreview}
              style={{
                background: previewColors[previewColors.length - 1],
                color: readableInk(previewColors[previewColors.length - 1]),
              }}
            >
              <div>
                <span className={styles.eyebrow}>YOUR NEXT CHAPTER</span>
                <h2 style={{ fontFamily: font }}>ทุกสี มีเรื่องราว</h2>
                <p>ทดลองพาเลตต์กับพื้นหลัง หัวเรื่อง และปุ่มก่อนนำไปใช้</p>
                <span
                  className={styles.sampleButton}
                  style={{ background: previewColors[0], color: readableInk(previewColors[0]) }}
                >
                  Discover the collection →
                </span>
              </div>
              <div
                className={styles.poster}
                style={{ background: `linear-gradient(145deg,${previewColors.join(",")})` }}
              >
                <span
                  style={{ background: previewColors[1], color: readableInk(previewColors[1]) }}
                >
                  Art
                  <br />
                  Shift.
                </span>
              </div>
            </div>
            {source && result ? (
              <>
                <h2>Recolor Artwork จริง</h2>
                <p className={styles.muted}>
                  เปลี่ยนสีของข้อความ รูปทรง Appearance และ SVG ที่รองรับ โดยเก็บ geometry และเว้น
                  Objects/Layers ที่ล็อกไว้ ภาพ raster ไม่ถูกเปลี่ยนในขั้นตอนนี้
                </p>
                <div className={styles.row}>
                  <select
                    aria-label="ขอบเขต Recolor"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                      setMapping({});
                    }}
                  >
                    <option value="artwork">ทั้ง Artwork</option>
                    <option value="selection" disabled={!selected.size}>
                      Objects ที่เลือก ({selected.size})
                    </option>
                  </select>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeBackground}
                      onChange={(e) => setIncludeBackground(e.target.checked)}
                    />{" "}
                    รวมพื้นหลัง Artwork
                  </label>
                  <button type="button" onClick={suggestMapping}>
                    จัดสีจากพาเลตต์
                  </button>
                  <button type="button" onClick={() => setMapping({})}>
                    คืนสีต้นฉบับ
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={original}
                      onChange={(e) => setOriginal(e.target.checked)}
                    />{" "}
                    ดูต้นฉบับ
                  </label>
                </div>
                <div className={styles.mapping}>
                  {[
                    ...new Set([
                      ...sourceColors,
                      ...(includeBackground && normalizeHex(source.background)
                        ? [normalizeHex(source.background)!]
                        : []),
                    ]),
                  ].map((hex) => (
                    <label key={hex}>
                      <span style={{ background: hex }} />
                      {hex}
                      <span>→</span>
                      <input
                        type="color"
                        aria-label={`แทนสี ${hex}`}
                        value={mapping[hex] ?? hex}
                        onChange={(e) => setMapping((m) => ({ ...m, [hex]: e.target.value }))}
                      />
                      <select
                        aria-label={`เลือกสีพาเลตต์แทน ${hex}`}
                        value={
                          colors.some((c) => c.hex === (mapping[hex] ?? hex))
                            ? (mapping[hex] ?? hex)
                            : ""
                        }
                        onChange={(e) => {
                          if (e.target.value) setMapping((m) => ({ ...m, [hex]: e.target.value }));
                        }}
                      >
                        <option value="">กำหนดเอง</option>
                        {colors.map((c, i) => (
                          <option key={i} value={c.hex}>
                            {c.hex}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {artworkPreview ? (
                  <LocalSvgPreview
                    src={artworkPreview}
                    alt={original ? "Artwork ต้นฉบับ" : "ตัวอย่าง Artwork หลังเปลี่ยนสี"}
                  />
                ) : (
                  <p>ไม่สามารถแสดงตัวอย่าง SVG ของ Artwork นี้ได้</p>
                )}
                {result.warnings.map((w) => (
                  <p key={w} className={styles.warning}>
                    {w}
                  </p>
                ))}
                <div className={styles.row}>
                  <span>{result.changed} รายการเปลี่ยนสี</span>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={!result.changed || mapping !== deferredMap}
                    onClick={applyArtwork}
                  >
                    ใช้กับ Artwork · Undo ได้
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.muted}>เปิดจาก Editor เพื่อทดลองและใช้สีกับ Artwork ของคุณ</p>
            )}
          </div>
        ) : null}
        {tab === "check" ? (
          <div className={styles.stack}>
            <div className={styles.twoColumns}>
              <section className={styles.panel}>
                <h2>Contrast checker</h2>
                <div className={styles.row}>
                  <label>
                    ข้อความ
                    <input
                      type="color"
                      value={foreground}
                      onChange={(e) => setForeground(e.target.value)}
                    />
                  </label>
                  <HexField label="HEX ข้อความ" value={foreground} onChange={setForeground} />
                  <label>
                    พื้นหลัง
                    <input
                      type="color"
                      value={background}
                      onChange={(e) => setBackground(e.target.value)}
                    />
                  </label>
                  <HexField label="HEX พื้นหลัง" value={background} onChange={setBackground} />
                </div>
                <div className={styles.contrastSample} style={{ color: foreground, background }}>
                  <strong>อ่านง่าย เห็นชัด</strong>
                  <p>The quick brown fox • ภาษาไทย</p>
                </div>
                <div className={styles.ratio}>{ratio.toFixed(2)} : 1</div>
                <p>
                  AA ข้อความปกติ: <strong>{ratio >= 4.5 ? "ผ่าน" : "ไม่ผ่าน"}</strong> · ข้อความใหญ่:{" "}
                  <strong>{ratio >= 3 ? "ผ่าน" : "ไม่ผ่าน"}</strong> · AAA ปกติ:{" "}
                  <strong>{ratio >= 7 ? "ผ่าน" : "ไม่ผ่าน"}</strong>
                </p>
                <p className={styles.muted}>
                  คำนวณสีทึบ sRGB ตาม WCAG ไม่ครอบคลุมภาพหรือ gradient ด้านหลัง และไม่ใช้ค่าที่ปัดเศษตัดสินผล
                </p>
                <button type="button" onClick={() => setForeground(readableInk(background))}>
                  ใช้ข้อความดำ/ขาวที่อ่านชัดกว่า
                </button>
              </section>
              <section className={styles.panel}>
                <h2>จำลองการมองเห็น</h2>
                <select
                  aria-label="ประเภทการจำลองสี"
                  value={vision}
                  onChange={(e) => setVision(e.target.value as Vision)}
                >
                  {VISION.map((v) => (
                    <option value={v.value} key={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <p>ต้นฉบับ</p>
                <Swatches colors={colors.map((c) => c.hex)} />
                <p>ภาพจำลอง</p>
                <Swatches colors={colors.map((c) => simulateVision(c.hex, vision))} />
                <p className={styles.muted}>ภาพจำลองเพื่อช่วยออกแบบ ใช้รูปทรงและข้อความประกอบสีเสมอ</p>
              </section>
            </div>
            <h2>คู่สีทั้งหมดในพาเลตต์</h2>
            <div className={styles.cards}>
              {colors.flatMap((a, i) =>
                colors.slice(i + 1).map((b, j) => {
                  const r = contrast(a.hex, b.hex);
                  return (
                    <button
                      type="button"
                      className={styles.pair}
                      key={`${i}-${j}`}
                      onClick={() => {
                        setForeground(a.hex);
                        setBackground(b.hex);
                      }}
                      style={{ background: b.hex, color: a.hex }}
                    >
                      <strong>Aa</strong>
                      <span style={{ background: "#fff", color: "#222" }}>
                        {r.toFixed(2)}:1 · {r >= 4.5 ? "AA" : "ไม่ผ่าน AA"}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        ) : null}
        {tab === "gradient" ? (
          <div className={styles.stack}>
            <h2>Gradient maker</h2>
            <div className={styles.gradientPreview} style={{ background: gradientCss }} />
            <div className={styles.row}>
              <label>
                ชนิด
                <select value={gradientType} onChange={(e) => setGradientType(e.target.value)}>
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </label>
              <label>
                มุม {angle}°
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                />
              </label>
              <button type="button" onClick={() => void copy(`background: ${gradientCss};`)}>
                คัดลอก CSS Gradient
              </button>
            </div>
            <code className={styles.code}>{gradientCss}</code>
            <h2>สร้างพาเลตต์ระหว่างสองสี</h2>
            <div className={styles.row}>
              <label>
                เริ่ม
                <input
                  type="color"
                  value={gradientStart}
                  onChange={(e) => setGradientStart(e.target.value)}
                />
              </label>
              <label>
                ปลาย
                <input
                  type="color"
                  value={gradientEnd}
                  onChange={(e) => setGradientEnd(e.target.value)}
                />
              </label>
              <label>
                จำนวนสี
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={gradientCount}
                  onChange={(e) =>
                    setGradientCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))
                  }
                />
              </label>
              <button type="button" onClick={() => loadPalette(gradient)}>
                ใช้พาเลตต์นี้
              </button>
            </div>
            <Swatches colors={gradient} />
            <h3>แรงบันดาลใจ Gradient</h3>
            <div className={styles.cards}>
              {CURATED_PALETTES.slice(0, 6).map((p) => (
                <button
                  type="button"
                  className={styles.gradientTile}
                  key={p.name}
                  style={{
                    background: `linear-gradient(120deg,${p.colors.join(",")})`,
                    color: readableInk(p.colors[2]),
                  }}
                  onClick={() => loadPalette(p.colors)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "fonts" ? (
          <div className={styles.stack}>
            <h2>สีและตัวอักษร</h2>
            <div className={styles.row}>
              <label>
                ฟอนต์
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  {THAI_FONTS.map((f) => (
                    <option value={f.cssFamily} key={f.family}>
                      {f.family}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className={styles.grow}
                aria-label="ข้อความทดลองฟอนต์"
                value={sample}
                maxLength={1000}
                onChange={(e) => setSample(e.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  setFont(
                    THAI_FONTS[
                      (THAI_FONTS.findIndex((f) => f.cssFamily === font) + 1) % THAI_FONTS.length
                    ].cssFamily,
                  )
                }
              >
                ลองฟอนต์ถัดไป
              </button>
            </div>
            <div
              className={styles.fontPreview}
              style={{
                fontFamily: font,
                background: colors[colors.length - 1].hex,
                color: colors[0].hex,
              }}
            >
              {sample}
            </div>
            <button
              type="button"
              onClick={() =>
                void copy(
                  `font-family: ${font};\ncolor: ${colors[0].hex};\nbackground-color: ${colors[colors.length - 1].hex};`,
                )
              }
            >
              คัดลอกสไตล์ตัวอักษร
            </button>
            <p className={styles.muted}>ใช้คลังฟอนต์ไทยของ ArtShift เพื่อทดลองคู่สีและรูปแบบตัวอักษร</p>
          </div>
        ) : null}
        {tab === "export" ? (
          <div className={styles.stack}>
            <h2>พร้อมนำไปใช้ต่อ</h2>
            <div className={styles.row}>
              <label>
                ชื่อพาเลตต์
                <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                รูปแบบ
                <select value={format} onChange={(e) => setFormat(e.target.value as PaletteFormat)}>
                  {["svg", "png", "pdf", "css", "scss", "json", "ase", "tailwind"].map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                      {f === "tailwind" ? " v4 CSS" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.primary}
                disabled={exportBusy}
                onClick={async () => {
                  setExportBusy(true);
                  try {
                    await exportPalette(colors, name, format);
                    setMessage("ส่งออกพาเลตต์แล้ว");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
                  } finally {
                    setExportBusy(false);
                  }
                }}
              >
                {exportBusy ? "กำลังส่งออก…" : "ดาวน์โหลด"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void copy(
                    `${location.origin}/colors?palette=${colors.map((c) => c.hex.slice(1)).join("-")}`,
                  )
                }
              >
                คัดลอกลิงก์แชร์
              </button>
            </div>
            <p className={styles.muted}>
              ลิงก์แชร์มีเฉพาะสี ไม่มีชื่อโปรเจกต์หรือภาพต้นฉบับ · ASE สำหรับนำเข้าชุดสีใน Adobe · JSON
              สำหรับสำรองและนำกลับเข้า ArtShift
            </p>
            <pre className={styles.code}>
              {paletteCode(
                colors,
                format === "scss" || format === "json" || format === "tailwind" ? format : "css",
                name,
              )}
            </pre>
            <button type="button" onClick={() => void copy(paletteCode(colors, "css", name))}>
              คัดลอก CSS variables
            </button>
          </div>
        ) : null}
      </main>
      <footer className={styles.footer}>
        <span role="status" aria-live="polite">
          {message}
        </span>
        <span className={styles.muted}>Color Studio · Local first</span>
      </footer>
    </div>
  );
  return modal ? (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Color Studio"
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      {content}
    </dialog>
  ) : (
    content
  );
}
