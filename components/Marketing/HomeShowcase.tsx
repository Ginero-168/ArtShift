"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import styles from "./HomeShowcase.module.css";

type Shot = { src: string; width: number; height: number };

const SHOTS = {
  removeBg: { src: "/landing/remove-bg.webp", width: 778, height: 398 },
  upscale: { src: "/landing/upscale.webp", width: 960, height: 957 },
  extract: { src: "/landing/extract.webp", width: 544, height: 526 },
  vectorize: { src: "/landing/vectorize.webp", width: 828, height: 824 },
  imageAnalysis: { src: "/landing/image-analysis.webp", width: 550, height: 686 },
  multiSize: { src: "/landing/multi-size.webp", width: 960, height: 914 },
  convertBrief: { src: "/landing/convert-brief.webp", width: 960, height: 395 },
  promptHelper: { src: "/landing/prompt-helper.webp", width: 960, height: 919 },
  mix: { src: "/landing/mix.webp", width: 718, height: 480 },
  moodboard: { src: "/landing/moodboard.webp", width: 960, height: 502 },
  multiAngle: { src: "/landing/multi-angle.webp", width: 960, height: 474 },
  layered: { src: "/landing/layered.webp", width: 780, height: 532 },
  bookMockup: { src: "/landing/book-mockup.webp", width: 960, height: 452 },
} satisfies Record<string, Shot>;

const AI_FEATURES: {
  id: string;
  title: string;
  body: string;
  shot: Shot;
  span: "hero" | "wide" | "tall" | "base" | "full";
}[] = [
  {
    id: "multi-size",
    title: "Multi-Size Creation",
    body: "ดีไซน์เดียว แตกเป็นทุกไซส์ที่ต้องใช้ ทั้ง Endcap, Shelf talk และโพสต์โซเชียล — ได้ไฟล์แยกทีละขนาด",
    shot: SHOTS.multiSize,
    span: "hero",
  },
  {
    id: "prompt-helper",
    title: "Prompt Helper",
    body: "เลือกสไตล์ มุมกล้อง และอารมณ์จากภาพตัวอย่าง แล้วประกอบเป็น Prompt ที่ตรงบรีฟตั้งแต่รอบแรก",
    shot: SHOTS.promptHelper,
    span: "tall",
  },
  {
    id: "mix",
    title: "Mix",
    body: "ผสมหลายภาพเป็นฉากใหม่ฉากเดียว เก็บเอกลักษณ์ของแต่ละภาพไว้ครบ",
    shot: SHOTS.mix,
    span: "base",
  },
  {
    id: "image-analysis",
    title: "Image Analysis",
    body: "อ่านข้อความ องค์ประกอบ และโทนของงาน เพื่อใช้เป็นบริบทก่อนสร้างทุกครั้ง",
    shot: SHOTS.imageAnalysis,
    span: "base",
  },
  {
    id: "layered",
    title: "Layered",
    body: "แยกภาพแบนเป็นเลเยอร์ที่ขยับและแก้ต่อได้",
    shot: SHOTS.layered,
    span: "base",
  },
  {
    id: "moodboard",
    title: "Moodboard Batch Image Creation",
    body: "พิมพ์ไอเดียเดียว ได้มู้ดบอร์ด 9, 16 หรือ 25 ภาพวางเรียงบนบอร์ดทันที",
    shot: SHOTS.moodboard,
    span: "wide",
  },
  {
    id: "convert-brief",
    title: "Convert to Brief",
    body: "แปลงงานบนแคนวาสเป็นบรีฟ Layout พร้อมโซนข้อความ ส่งต่อให้ทีมได้ทันที",
    shot: SHOTS.convertBrief,
    span: "wide",
  },
  {
    id: "multi-angle",
    title: "Multi-Angle",
    body: "หมุนมุมกล้องรอบวัตถุ ได้หลายมุมจากภาพเดียว",
    shot: SHOTS.multiAngle,
    span: "full",
  },
];

const BASIC_AI: { title: string; body: string; shot: Shot }[] = [
  { title: "Remove BG", body: "ตัดพื้นหลังคลิกเดียว", shot: SHOTS.removeBg },
  { title: "Upscale", body: "ขยายความละเอียดสำหรับงานพิมพ์", shot: SHOTS.upscale },
  { title: "Extract", body: "แยกวัตถุออกจากภาพเป็นชิ้น", shot: SHOTS.extract },
  { title: "Vectorize", body: "แปลงภาพเป็นเวกเตอร์", shot: SHOTS.vectorize },
];

const EDITOR_TOOLS = [
  "Infinite Canvas",
  "Multi-Size Slide",
  "Text Style",
  "Appearance",
  "Photopea Editor",
  "3D Book Mockup",
];

/** Pointer-driven tilt for every [data-tilt] element inside the root. */
function usePointerTilt<T extends HTMLElement>() {
  const rootRef = useRef<T>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      el.style.setProperty("--tilt-x", `${(-y * 10).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * 12).toFixed(2)}deg`);
      el.style.setProperty("--glare-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      pending = null;
    };

    const onMove = (event: PointerEvent) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tilt]");
      if (!el || !root.contains(el)) return;
      const rect = el.getBoundingClientRect();
      pending = {
        el,
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onLeave = (event: PointerEvent) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tilt]");
      if (!el) return;
      el.style.removeProperty("--tilt-x");
      el.style.removeProperty("--tilt-y");
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerout", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerout", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return rootRef;
}

function ShotImage({ shot, alt, eager = false }: { shot: Shot; alt: string; eager?: boolean }) {
  return (
    // biome-ignore lint/performance/noImgElement: static /public assets must also work in static export
    <img
      src={shot.src}
      width={shot.width}
      height={shot.height}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

/** Floating 3D stack of real AI outputs for the hero. */
export function AiStage() {
  const stageRef = usePointerTilt<HTMLDivElement>();
  return (
    <div className={styles.stageWrap} ref={stageRef} aria-hidden="true">
      <div className={styles.stage} data-tilt>
        <figure className={`${styles.layer} ${styles.layerBack}`}>
          <ShotImage shot={SHOTS.moodboard} alt="" eager />
          <figcaption>Moodboard · 25 ภาพ</figcaption>
        </figure>
        <figure className={`${styles.layer} ${styles.layerLeft}`}>
          <ShotImage shot={SHOTS.multiSize} alt="" eager />
          <figcaption>Multi-Size · 5 ไซส์</figcaption>
        </figure>
        <figure className={`${styles.layer} ${styles.layerRight}`}>
          <ShotImage shot={SHOTS.mix} alt="" eager />
          <figcaption>Mix</figcaption>
        </figure>
        <figure className={`${styles.layer} ${styles.layerFront}`}>
          <ShotImage shot={SHOTS.removeBg} alt="" eager />
          <figcaption>Remove BG</figcaption>
        </figure>
        <div className={`${styles.layer} ${styles.promptChip}`}>
          <span className={styles.promptDot} />
          สร้างรูปนี้ตามไซส์นี้ 5 ขนาด
        </div>
      </div>
    </div>
  );
}

export default function HomeShowcase({ cta }: { cta: ReactNode }) {
  const rootRef = usePointerTilt<HTMLDivElement>();

  return (
    <div className={styles.showcase} ref={rootRef}>
      <section className={styles.ai} aria-labelledby="ai-title">
        <div className={styles.sectionHead}>
          <p className={styles.chapter}>01</p>
          <h2 id="ai-title" className={styles.chapterTitle}>
            AI Assistance
          </h2>
          <p className={styles.chapterLead}>
            ทุกฟีเจอร์อยู่ในแชทเดียวข้างแคนวาส AI อ่านงานที่คุณเลือกก่อน แล้ววางแผนให้ตรงบรีฟ —
            ไม่สุ่มสร้างภาพโดยไม่มีบริบท
          </p>
        </div>

        <div className={styles.bento}>
          {AI_FEATURES.map((feature) => (
            <article
              key={feature.id}
              id={feature.id}
              className={`${styles.aiCard} ${styles[`span-${feature.span}`]}`}
              data-tilt
            >
              <div className={styles.aiShot}>
                <ShotImage shot={feature.shot} alt={feature.title} />
              </div>
              <div className={styles.aiCopy}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
              <span className={styles.glare} aria-hidden="true" />
            </article>
          ))}
        </div>

        <div className={styles.basicHead}>
          <h3>Basic AI Function</h3>
          <p>งานพื้นฐานที่ใช้ทุกวัน ทำได้จากเมนูบนภาพ</p>
        </div>
        <ul className={styles.basicGrid}>
          {BASIC_AI.map((item) => (
            <li key={item.title} className={styles.basicCard} data-tilt>
              <div className={styles.basicShot}>
                <ShotImage shot={item.shot} alt={item.title} />
              </div>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <span className={styles.glare} aria-hidden="true" />
            </li>
          ))}
          <li className={`${styles.basicCard} ${styles.pinterestCard}`} data-tilt>
            <strong>Pinterest Integration</strong>
            <span>เชื่อมบอร์ด Pinterest แล้วลากภาพลงแคนวาสได้ทันที</span>
            <span className={styles.glare} aria-hidden="true" />
          </li>
        </ul>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <p className={styles.eyebrow}>Why</p>
        <h2 id="why-title" className={styles.whyTitle}>
          Why do we have to own it?
        </h2>
        <ol className={styles.whyList}>
          <li>
            <strong>Lower cost</strong>
            <span>จ่ายตามงานจริง ไม่ต้องเหมาจ่าย Subscription หลายเจ้าพร้อมกัน</span>
          </li>
          <li>
            <strong>Custom tools for our workflow</strong>
            <span>เครื่องมือที่ทำมาเพื่องานแคมเปญหนังสือโดยเฉพาะ ไม่ต้องดัดแปลงจากเครื่องมือทั่วไป</span>
          </li>
          <li>
            <strong>Own our data</strong>
            <span>ไฟล์งานและบรีฟอยู่กับทีมเรา ไม่ผูกกับแพลตฟอร์มใด</span>
          </li>
        </ol>
      </section>

      <section className={styles.impact} aria-labelledby="impact-title">
        <div className={styles.sectionHead}>
          <p className={styles.chapter}>02</p>
          <h2 id="impact-title" className={styles.chapterTitle}>
            Cost &amp; Efficiency
          </h2>
        </div>
        <ul className={styles.impactBlocks}>
          <li className={styles.block} data-tilt style={{ "--block": "#cfe1f5" } as CSSProperties}>
            <span className={styles.blockBig}>Save $20–30</span>
            <span>/ user</span>
          </li>
          <li className={styles.block} data-tilt style={{ "--block": "#9fc4ec" } as CSSProperties}>
            <span className={styles.blockBig}>Faster</span>
            <span>from vibe to layout</span>
          </li>
          <li className={styles.block} data-tilt style={{ "--block": "#6aa5e0" } as CSSProperties}>
            <span className={styles.blockBig}>One editor,</span>
            <span>done</span>
          </li>
        </ul>
        <div className={styles.pillars}>
          <article className={styles.pillar}>
            <p className={styles.pillarTag}>On Demand</p>
            <h3>Choose your cost</h3>
            <p>
              Start lean or go premium — match model tier and output quality to each job, without
              locking into one plan.
            </p>
            <span className={styles.pillarNote}>Set spend and quality per job</span>
          </article>
          <article className={styles.pillar}>
            <p className={styles.pillarTag}>Pay as you go</p>
            <h3>No seat sprawl</h3>
            <p>
              No seat sprawl or idle retainers. Usage scales with real campaigns, so spend stays
              tied to work that ships.
            </p>
            <span className={styles.pillarNote}>Usage-based, no wasted seats</span>
          </article>
          <article className={styles.pillar}>
            <p className={styles.pillarTag}>Prompt help</p>
            <h3>On-brief results</h3>
            <p>
              Built-in prompt coaching steers the AI toward your brief, so you get usable layouts
              faster — fewer retries, less rewrite.
            </p>
            <span className={styles.pillarNote}>Guided prompts → results that fit</span>
          </article>
        </div>
      </section>

      <section className={styles.editor} aria-labelledby="editor-title">
        <div className={styles.editorCopy}>
          <p className={styles.chapterSmall}>03 · Editor</p>
          <h2 id="editor-title">Create, edit, ship — one editor</h2>
          <p>
            Canva-like and easy to use, with Illustrator-grade controls when you need them. Layout,
            text, appearance, and raster edits in a single workspace.
          </p>
          <ul className={styles.toolChips}>
            {EDITOR_TOOLS.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </div>
        <div className={styles.editorShot} data-tilt>
          <ShotImage shot={SHOTS.bookMockup} alt="3D Book Mockup" />
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title" className={styles.visuallyHidden}>
          Scalable — save money, with room to become a SaaS
        </h2>
        <div className={styles.mosaic} data-tilt aria-hidden="true">
          <span className={`${styles.tile} ${styles.tileYellow}`}>Scalable</span>
          <span className={`${styles.tile} ${styles.tileBlue}`}>Save Money,</span>
          <span className={`${styles.tile} ${styles.tileCoral}`}>with room to become a SaaS</span>
        </div>
        <div className={styles.closingCta}>{cta}</div>
      </section>
    </div>
  );
}
