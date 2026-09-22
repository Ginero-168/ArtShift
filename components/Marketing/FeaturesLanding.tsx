import Link from "next/link";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import { IconBrand } from "@/components/icons";
import styles from "./FeaturesLanding.module.css";

const FEATURES = [
  {
    id: "canvas",
    index: "01",
    english: "Design canvas / Smart Object",
    title: "แคนวาสออกแบบ ที่ภาพเป็น Smart Object",
    body: "วางเลย์เอาต์บนแคนวาสที่คุมตำแหน่งได้ละเอียด ภาพที่วางแล้วเป็น Smart Object — แก้พิกเซลได้โดยไม่ขยับกล่องบนงาน จึงจัดหน้าโฆษณาแล้วรีทัชต่อได้โดยไม่ต้องจัดใหม่",
    visual: "canvas",
  },
  {
    id: "moodboard",
    index: "02",
    english: "Moodboard · Infinite board",
    title: "Moodboard ไร้ขอบ — AI 9, 16 หรือ 25 ภาพ",
    body: "Infinity Canvas คือบอร์ดไม่มีกรอบ สำหรับเก็บแรงบันดาลใจและจัดเรียงเรฟ พิมพ์ไวบ์แล้วให้ Gemini Flash ขยายเป็น 9, 16 หรือ 25 ทิศทาง แล้วสร้างภาพผ่าน Replicate gpt-image-2.5-flare (quality medium) วางเป็นตารางจัตุรัสบนตำแหน่ง Preload",
    visual: "moodboard",
  },
  {
    id: "appearance",
    index: "03",
    english: "Appearance",
    title: "Appearance หลายชั้น: Fill, Stroke, Shadow, Glow",
    body: "Appearance เป็นสแตกที่เรียงได้เอง ใส่ Fill/Stroke ได้หลายชั้น เพิ่ม Shadow, Glow, Text Arc และปรับโทนภาพแบบไม่ทำลายต้นฉบับ จากแผง Appearance ในตัวแก้ไข",
    visual: "appearance",
  },
  {
    id: "text",
    index: "04",
    english: "Illustrator-style text",
    title: "ข้อความแบบ Illustrator — Point กับ Area",
    body: "คลิกเพื่อ Point Text ที่กล่องตามตัวอักษร ลากเพื่อ Area Text ที่ตัดคำในกรอบ ย่อขยายด้วย Selection แล้วตัวอักษรสเกลตามกล่อง เหมือนแปลงรูป ไม่ใช่แค่ยืดกรอบว่าง",
    visual: "text",
  },
  {
    id: "photopea",
    index: "05",
    english: "Edit Raster",
    title: "แก้ Raster ผ่าน Photopea",
    body: "ดับเบิลคลิกภาพ หรือเลือก Edit Raster เพื่อเปิด Photopea เป็นประตูหลักในการแก้พิกเซล กด Apply หรือ File → Save แล้วพิกเซลอัปเดต — ตำแหน่งบนแคนวาสไม่ขยับ",
    visual: "photopea",
  },
  {
    id: "ai",
    index: "06",
    english: "AI Assistance",
    title: "AI Assistance และ Creative Director",
    body: "แชทช่วยงานอยู่ในตัวแก้ไข งานที่ทำในเครื่องได้รันแบบ local-first งานที่ซับซ้อนกว่านั้นส่งต่อ Creative Director เพื่อวางแผนก่อนลงมือ ไม่ได้สุ่มสร้างภาพโดยไม่มีบริบท",
    visual: "ai",
  },
  {
    id: "local",
    index: "07",
    english: "Local-first",
    title: "โปรเจกต์อยู่บนเครื่องคุณ ที่ artshift.io",
    body: "เข้าสู่ระบบเพื่อระบุตัวตน แล้วเปิดโปรเจกต์ในตัวแก้ไข เอกสารเก็บในเครื่อง เริ่มออกแบบได้โดยไม่ต้องย้ายงานขึ้นคลาวด์ก่อน",
    visual: "local",
  },
] as const;

function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]["visual"] }) {
  if (kind === "canvas") {
    return (
      <div className={styles.board}>
        <div className={styles.artboard} />
        <span className={styles.smartBadge}>Smart Object</span>
      </div>
    );
  }
  if (kind === "moodboard") {
    return (
      <div className={styles.board}>
        <div className={styles.polaroid}>
          <div
            className={styles.swatch}
            style={{ background: "linear-gradient(135deg, #7dd3fc, #1d4ed8)" }}
          />
        </div>
        <div className={styles.polaroid}>
          <div
            className={styles.swatch}
            style={{ background: "linear-gradient(135deg, #fde68a, #ea580c)" }}
          />
        </div>
        <span className={styles.searchChip}>9 · 16 · 25</span>
        <span className={styles.searchChip}>Flare medium</span>
      </div>
    );
  }
  if (kind === "appearance") {
    return (
      <div className={styles.stack}>
        <div className={styles.layer}>
          <span>Fill</span>
          <span className={styles.chip} style={{ background: "#6366f1" }} />
        </div>
        <div className={styles.layer}>
          <span>Stroke</span>
          <span
            className={styles.chip}
            style={{ background: "transparent", boxShadow: "inset 0 0 0 2px #f8fafc" }}
          />
        </div>
        <div className={styles.layer}>
          <span>Shadow / Glow</span>
          <span className={styles.chip} style={{ background: "#22d3ee" }} />
        </div>
        <div className={styles.layer}>
          <span>Text Arc · Tones</span>
          <span
            className={styles.chip}
            style={{ background: "linear-gradient(90deg, #64748b, #f8fafc)" }}
          />
        </div>
      </div>
    );
  }
  if (kind === "text") {
    return (
      <div className={styles.textPair}>
        <div className={styles.textCard}>
          Point
          <span className={styles.pointGlyph}>Aa</span>
        </div>
        <div className={styles.textCard}>
          Area
          <span className={styles.areaGlyph}>ข้อความในกรอบ ตัดบรรทัดตามกล่อง</span>
        </div>
      </div>
    );
  }
  if (kind === "photopea") {
    return (
      <div className={styles.rasterFrame}>
        <span className={styles.rasterHint}>ดับเบิลคลิก · Edit Raster</span>
      </div>
    );
  }
  if (kind === "ai") {
    return (
      <div className={styles.chat}>
        <div className={`${styles.bubble} ${styles.bubbleUser}`}>จัดเลย์เอาต์ปกนี้ให้ดูพรีเมียมขึ้น</div>
        <div className={`${styles.bubble} ${styles.bubbleAi}`}>
          Creative Director วางแผนจากแคนวาส แล้วให้ตรวจก่อนลงมือ
        </div>
      </div>
    );
  }
  return (
    <div className={styles.localCard}>
      artshift.io
      <strong>โปรเจกต์ในเครื่อง</strong>
    </div>
  );
}

export default function FeaturesLanding() {
  return (
    <div className={styles.page} data-testid="features-landing">
      <a className={styles.skip} href="#features-main">
        ข้ามไปเนื้อหา
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ArtShift หน้าแรก">
          <span className={styles.mark} aria-hidden="true">
            <IconBrand size={16} />
          </span>
          <ArtShiftLogo size="header" />
        </Link>
        <nav className={styles.nav} aria-label="หน้าฟีเจอร์">
          <Link href="/features" className={styles.navLink} aria-current="page">
            ฟีเจอร์
          </Link>
          <Link href="/" className={styles.navLink}>
            เข้าสู่ระบบ
          </Link>
          <Link href="/projects" className={styles.navLink}>
            เปิดโปรเจกต์
          </Link>
        </nav>
      </header>

      <main id="features-main">
        <section className={`${styles.wrap} ${styles.hero}`}>
          <ArtShiftLogo as="p" size="hero" className={styles.heroLogo} />
          <p className={styles.kicker}>Local-first design tools</p>
          <h1 className={styles.heroTitle}>ออกแบบงานโฆษณาบนแคนวาสที่คิดแบบนักออกแบบ</h1>
          <p className={styles.heroLead}>
            ArtShift รวมแคนวาสออกแบบ Moodboard ไร้ขอบ Appearance หลายชั้น ข้อความแบบ Illustrator การแก้
            Raster ผ่าน Photopea และ AI Assistance ไว้ในตัวแก้ไขโปรเจกต์
            <span className={styles.heroEnglish}>
              Professional artwork tools. Local-first at artshift.io.
            </span>
          </p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.btnPrimary}>
              เข้าสู่ระบบ
            </Link>
            <Link href="/projects" className={styles.btnGhost}>
              เปิดโปรเจกต์
            </Link>
          </div>
        </section>

        <div className={`${styles.wrap} ${styles.catalog}`}>
          {FEATURES.map((feature, index) => (
            <article
              key={feature.id}
              id={feature.id}
              className={`${styles.feature} ${index % 2 === 1 ? styles.featureReverse : ""}`}
            >
              <div className={styles.visual} aria-hidden="true">
                <FeatureVisual kind={feature.visual} />
              </div>
              <div className={styles.copy}>
                <p className={styles.index}>{feature.index}</p>
                <p className={styles.english}>{feature.english}</p>
                <h2 className={styles.title}>{feature.title}</h2>
                <p className={styles.body}>{feature.body}</p>
              </div>
            </article>
          ))}
        </div>

        <section
          className={`${styles.wrap} ${styles.ctaBand}`}
          aria-labelledby="features-cta-title"
        >
          <h2 id="features-cta-title">พร้อมเปิดโปรเจกต์</h2>
          <p>
            เข้าสู่ระบบด้วย Google เพื่อระบุตัวตน แล้วทำงานในตัวแก้ไขบนเครื่องคุณ — หน้าแรกยังเป็นประตูเข้าใช้งานตามเดิม
          </p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.btnPrimary}>
              เข้าสู่ระบบ
            </Link>
            <Link href="/projects" className={styles.btnGhost}>
              เปิดโปรเจกต์
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <span>ArtShift · local-first editor</span>
          <Link href="/">กลับหน้าเข้าสู่ระบบ</Link>
        </div>
      </footer>
    </div>
  );
}
