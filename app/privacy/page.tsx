import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว | ArtShift",
  description:
    "นโยบายความเป็นส่วนตัวของ ArtShift — โปรแกรมแก้ไขงานศิลป์และมูดบอร์ดแบบ local-first ที่ artshift.io",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function PrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          maxWidth: 880,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <BrandMark />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>ArtShift</span>
        </Link>
        <Link
          href="/"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#4f46e5",
            textDecoration: "none",
          }}
        >
          กลับหน้าแรก
        </Link>
      </header>

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 880,
          margin: "0 auto",
          padding: "12px 32px 80px",
          boxSizing: "border-box",
        }}
      >
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#6366f1",
          }}
        >
          Legal
        </p>
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          นโยบายความเป็นส่วนตัว
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600, color: "#334155" }}>
          Privacy Policy
        </p>
        <p style={{ margin: "0 0 36px", fontSize: 14, color: "#64748b" }}>
          อัปเดตล่าสุด: 19 กันยายน 2026 · Last updated: September 19, 2026
        </p>

        <article style={{ fontSize: 16, lineHeight: 1.75, color: "#1e293b" }}>
          <Section title="ArtShift คืออะไร" englishTitle="What ArtShift is">
            <p>
              ArtShift เป็นโปรแกรมแก้ไขงานศิลป์ มูดบอร์ด และแคมเปญโปรโมตแบบ local-first ทำงานบนเบราว์เซอร์ที่{" "}
              <a href="https://www.artshift.io" style={linkStyle}>
                www.artshift.io
              </a>{" "}
              ผู้ใช้สามารถจัดวางภาพ ข้อความ และเลเยอร์บนผืนงาน แล้วส่งออกเป็นไฟล์ได้
              โดยงานส่วนใหญ่ถูกเก็บและประมวลผลในเครื่องของคุณ
            </p>
            <p style={enStyle}>
              ArtShift is a local-first artwork, moodboard, and campaign editor. Most of your
              projects stay on your device in the browser. Cloud features run only when you choose
              to use them.
            </p>
          </Section>

          <Section title="ข้อมูลที่เราเก็บรวบรวม" englishTitle="Data we collect">
            <p>
              <strong>บัญชีและการยืนยันตัวตน:</strong> หากคุณเข้าสู่ระบบด้วย Google เราเก็บข้อมูลบัญชีที่จำเป็น เช่น
              อีเมล ชื่อ และรูปโปรไฟล์ รวมถึงคุกกี้เซสชันที่เข้ารหัสเพื่อให้คุณอยู่ในระบบ เราไม่เก็บรหัสผ่านของ Google
            </p>
            <p>
              <strong>คีย์ AI ของคุณ (BYOK):</strong> ฟีเจอร์ AI บนคลาวด์ใช้คีย์ที่คุณนำมาเอง หากคุณบันทึกคีย์ไว้ในบัญชี
              คีย์จะถูกเข้ารหัสและถอดรหัสเฉพาะตอนเรียกผู้ให้บริการที่คุณเลือก ArtShift ไม่ขายคีย์เหล่านี้
            </p>
            <p>
              <strong>Pinterest:</strong> หากคุณเชื่อมต่อบัญชี Pinterest เราจะเก็บโทเค็น OAuth
              ที่จำเป็นเพื่อดึงพินและบอร์ดของคุณมาใช้ในตัวแก้ไข เราไม่ขายโทเค็นหรือข้อมูล Pinterest ของคุณ
            </p>
            <p>
              <strong>งานในตัวแก้ไข:</strong> โปรเจกต์ ภาพ และสถานะการแก้ไขโดยทั่วไปอยู่ใน IndexedDB
              หรือที่เก็บข้อมูลในเบราว์เซอร์บนเครื่องคุณ ไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์โดยอัตโนมัติ
            </p>
            <p style={enStyle}>
              We collect account details if you sign in, encrypted session cookies, and — only if
              you opt in — your AI provider keys and Pinterest OAuth tokens. Editor documents
              usually remain on your device. We do not sell this data.
            </p>
          </Section>

          <Section title="คุกกี้และที่เก็บข้อมูลในเครื่อง" englishTitle="Cookies and local storage">
            <p>
              ArtShift ใช้คุกกี้เซสชันเพื่อยืนยันตัวตน และใช้ local storage, session storage และ IndexedDB
              เพื่อจำสถานะตัวแก้ไข ความยินยอมใช้ AI คลาวด์ ค่าตั้งค่า และโปรเจกต์ในเครื่อง
              คุณสามารถล้างข้อมูลเบราว์เซอร์หรือออกจากระบบได้ทุกเมื่อ
            </p>
            <p style={enStyle}>
              Session cookies keep you signed in. Local storage and IndexedDB remember editor state,
              preferences, and local projects. Clearing site data or signing out removes this
              browser state.
            </p>
          </Section>

          <Section title="บริการของบุคคลที่สาม" englishTitle="Third parties">
            <p>
              <strong>Pinterest:</strong> เมื่อคุณเชื่อมต่อ Pinterest
              ข้อมูลการอนุญาตและคำขอที่เกี่ยวข้องจะถูกส่งไปยัง Pinterest ตามนโยบายของ Pinterest
              เพื่อให้ดึงพินและบอร์ดของคุณได้
            </p>
            <p>
              <strong>ผู้ให้บริการ AI:</strong> เมื่อคุณเลือกใช้ AI บนคลาวด์
              คำสั่งและสื่อที่จำเป็นอาจถูกส่งไปยังผู้ให้บริการที่คุณเลือกหรือนำคีย์ไปใช้ เช่น ผู้ให้บริการโมเดลภาพหรือข้อความ
              เราไม่ส่งงานเหล่านี้โดยไม่ได้รับความยินยอมจากคุณ
            </p>
            <p>
              <strong>Google:</strong> การเข้าสู่ระบบใช้ Google OAuth Google
              จะประมวลผลข้อมูลตามนโยบายของตนเอง
            </p>
            <p>
              <strong>คลังภาพสต็อก:</strong> หากคุณค้นหารูปจาก Unsplash หรือ Pexels
              คำค้นหาจะถูกส่งไปยังบริการนั้น
            </p>
            <p style={enStyle}>
              Third parties we may use when you opt in include Pinterest (connected pins and
              boards), AI providers (prompts and needed media), Google (sign-in), and stock photo
              services you search. We do not sell your data to them.
            </p>
          </Section>

          <Section title="วิธีที่เราใช้ข้อมูล" englishTitle="How we use data">
            <p>เราใช้ข้อมูลเพื่อให้บริการ ArtShift เท่านั้น ได้แก่</p>
            <ul style={{ paddingLeft: 22, margin: "0 0 16px" }}>
              <li>ยืนยันตัวตนและดูแลเซสชันบัญชี</li>
              <li>ดึงพินหรือบอร์ดเมื่อคุณเชื่อมต่อ Pinterest</li>
              <li>เรียกผู้ให้บริการ AI ด้วยคีย์ที่คุณให้ เมื่อคุณเลือกใช้ฟีเจอร์นั้น</li>
              <li>จดจำสถานะตัวแก้ไขและค่าตั้งค่าในเบราว์เซอร์ของคุณ</li>
              <li>รักษาความปลอดภัยของบริการและป้องกันการใช้งานในทางที่ผิด</li>
            </ul>
            <p style={enStyle}>
              We use data only to run ArtShift: sign-in, optional Pinterest import, optional AI
              calls you start, local editor preferences, and basic security.
            </p>
          </Section>

          <Section title="การแบ่งปันและการขายข้อมูล" englishTitle="Sharing and sale">
            <p>
              เราไม่ขายข้อมูลส่วนบุคคล โทเค็น OAuth หรือคีย์ API
              เราแบ่งปันข้อมูลกับบุคคลที่สามเฉพาะเมื่อจำเป็นต่อการให้บริการที่คุณขอ หรือเมื่อกฎหมายกำหนด
            </p>
            <p style={enStyle}>
              We do not sell personal data, OAuth tokens, or API keys. We share data with a third
              party only to fulfill a feature you requested or when required by law.
            </p>
          </Section>

          <Section title="การเก็บรักษาและสิทธิของคุณ" englishTitle="Retention and your rights">
            <p>
              ข้อมูลบัญชีและโทเค็นที่เชื่อมต่อจะถูกเก็บตราบเท่าที่บัญชียังใช้งานอยู่ คุณสามารถออกจากระบบ ตัดการเชื่อมต่อ
              Pinterest ลบคีย์ AI หรือล้างข้อมูลในเบราว์เซอร์ได้ หากต้องการลบบัญชีหรือสอบถามเรื่องข้อมูลส่วนบุคคล
              กรุณาติดต่อเราตามช่องทางด้านล่าง
            </p>
            <p style={enStyle}>
              Account and connected-token data is kept while your account is active. You can sign
              out, disconnect Pinterest, remove stored AI keys, or clear browser data. Contact us to
              request account deletion.
            </p>
          </Section>

          <Section title="ติดต่อเรา" englishTitle="Contact">
            <p>
              หากมีคำถามเกี่ยวกับนโยบายนี้ หรือต้องการใช้สิทธิเกี่ยวกับข้อมูลส่วนบุคคล ติดต่อได้ที่{" "}
              <a href="mailto:support@artshift.io" style={linkStyle}>
                support@artshift.io
              </a>
            </p>
            <p style={enStyle}>
              Questions about this policy:{" "}
              <a href="mailto:support@artshift.io" style={linkStyle}>
                support@artshift.io
              </a>
            </p>
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({
  title,
  englishTitle,
  children,
}: {
  title: string;
  englishTitle: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          margin: "0 0 4px",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 14,
          fontWeight: 600,
          color: "#64748b",
        }}
      >
        {englishTitle}
      </p>
      {children}
    </section>
  );
}

function BrandMark() {
  return (
    <span
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        boxShadow: "0 4px 16px rgba(99, 102, 241, 0.35)",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 20V6l4 8 4-8 4 8 4-8v14" />
      </svg>
    </span>
  );
}

const linkStyle = {
  color: "#4f46e5",
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
} as const;

const enStyle = {
  color: "#475569",
  fontSize: 15,
} as const;
