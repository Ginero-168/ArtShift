import Link from "next/link";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import styles from "./PrivacyPolicy.module.css";

export default function PrivacyPolicy() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#privacy-main">
        ข้ามไปที่เนื้อหา
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <ArtShiftLogo size="header" />
        </Link>
        <nav className={styles.nav} aria-label="Site">
          <Link href="/features">ฟีเจอร์</Link>
          <Link href="/projects">โปรเจกต์</Link>
        </nav>
      </header>
      <main id="privacy-main" className={styles.main}>
        <p className={styles.kicker}>artshift.io/privacy</p>
        <h1>Privacy</h1>
        <p className={styles.lead}>
          ArtShift เป็นตัวแก้ไขงานออกแบบแบบ local-first ที่ artshift.io เอกสารงานออกแบบอยู่บนเครื่องของคุณ
          หน้านี้อธิบายข้อมูลบัญชีที่เซิร์ฟเวอร์เห็นเมื่อคุณเลือกเข้าสู่ระบบหรือเชื่อมต่อ Pinterest
        </p>
        <p className={styles.english}>
          ArtShift is a local-first artwork editor. Project files stay in your browser. This page
          covers the account data the server sees when you sign in with Google or connect Pinterest.
        </p>

        <section>
          <h2>Google sign-in</h2>
          <p>
            การเข้าสู่ระบบใช้ Google OAuth เพื่อยืนยันอีเมลและสร้างบัญชี ArtShift เราเก็บบัญชีที่จำเป็น (อีเมล ชื่อ
            รูปโปรไฟล์) และเซสชันในคุกกี้ httpOnly ที่เข้ารหัส เราไม่เก็บ Google access token หลังยืนยันตัวตนแล้ว
          </p>
          <p className={styles.english}>
            Sign-in uses Google OAuth to verify your email and create an ArtShift account. We store
            the account profile needed to recognize you and an encrypted httpOnly session cookie.
            Google access tokens are not kept after the profile is verified.
          </p>
        </section>

        <section>
          <h2>Pinterest</h2>
          <p>
            การเชื่อมต่อ Pinterest เป็นทางเลือกแยกจากบัญชี Google คุณกด Connect ในแท็บ Pinterest ของแผง
            ไลบรารี แล้วอนุญาตสิทธิ์อ่านอย่างเดียว: user_accounts:read, boards:read, boards:read_secret,
            pins:read, pins:read_secret โทเค็นถูกเก็บในคุกกี้ httpOnly ที่เข้ารหัสแยกจากเซสชัน Google ใช้เพื่อแสดง
            Pins และ Boards ของคุณ และดาวน์โหลดรูปที่คุณคลิกหรือลากไปวางบนงานเท่านั้น
          </p>
          <p>
            กด Disconnect ในแท็บเดียวกันเพื่อลบเซสชัน Pinterest ของ ArtShift หรือเพิกถอนแอปจากตั้งค่า Pinterest
            ของคุณได้ตลอดเวลา
          </p>
          <p className={styles.english}>
            Pinterest connect is optional and separate from Google login. ArtShift requests
            read-only scopes (user_accounts:read, boards:read, boards:read_secret, pins:read,
            pins:read_secret). Tokens live in their own encrypted httpOnly cookie and are used only
            to list your Pins and Boards and to download an image you place on the canvas.
            Disconnect in the Pinterest tab clears that session. You can also revoke ArtShift from
            your Pinterest settings.
          </p>
        </section>

        <section>
          <h2>Artwork on your device</h2>
          <p>
            ไฟล์โปรเจกต์ ภาพ และเลเยอร์ถูกเก็บในเบราว์เซอร์ของคุณ ArtShift ไม่ได้อัปโหลดเอกสารงานออกแบบ
            เป็นส่วนหนึ่งของการเชื่อมต่อ Pinterest
          </p>
          <p className={styles.english}>
            Projects, images, and layers stay in your browser. Connecting Pinterest does not upload
            your artwork.
          </p>
        </section>

        <section>
          <h2>What we do not do</h2>
          <p>เราไม่ขายข้อมูลส่วนบุคคล และไม่ดึง Pins ของคุณมาแสดงถ้าคุณยังไม่ได้เชื่อมต่อและไม่ได้เปิดแท็บ Pinterest</p>
          <p className={styles.english}>
            We do not sell personal information, and we do not read your Pins unless you connect
            Pinterest and open that library.
          </p>
        </section>
      </main>
    </div>
  );
}
