import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const featuresPage = readFileSync("app/features/page.tsx", "utf8");
const featuresLanding = readFileSync("components/Marketing/FeaturesLanding.tsx", "utf8");
const landing = readFileSync("app/page.tsx", "utf8");

describe("public /features marketing page", () => {
  it("publishes a dedicated App Router page that is not the default home", () => {
    expect(featuresPage).toContain('canonical: "/features"');
    expect(featuresPage).toContain("ฟีเจอร์ | ArtShift");
    expect(featuresPage).toContain("FeaturesLanding");
    expect(featuresPage).not.toContain("useAuth");
    expect(featuresPage).not.toContain("redirect(");

    expect(landing).toContain('href="/features"');
    expect(landing).toContain("ดูฟีเจอร์");
    expect(landing).toContain('size="hero"');
    expect(landing).not.toContain("AI Powered Design Tools");
    expect(landing).toContain("signInWithGoogle");
    expect(landing).not.toContain("<CanvasEditor");
    expect(landing).not.toContain("<header");
    expect(landing).not.toContain("FeatureCard");
  });

  it("sells real product features with existing auth and project CTAs", () => {
    expect(featuresLanding).toContain('data-testid="features-landing"');
    expect(featuresLanding).toContain("แคนวาสออกแบบ ที่ภาพเป็น Smart Object");
    expect(featuresLanding).toContain("Moodboard ไร้ขอบ");
    expect(featuresLanding).toContain("Appearance หลายชั้น");
    expect(featuresLanding).toContain("Point กับ Area");
    expect(featuresLanding).toContain("แก้ Raster ผ่าน Photopea");
    expect(featuresLanding).toContain("AI Assistance และ Creative Director");
    expect(featuresLanding).toContain("artshift.io");
    expect(featuresLanding).toContain('href="/"');
    expect(featuresLanding).toContain('href="/projects"');
    expect(featuresLanding).toContain("เข้าสู่ระบบ");
    expect(featuresLanding).toContain("เปิดโปรเจกต์");
  });

  it("stays a public marketing route without editor chrome or auth gates", () => {
    expect(featuresLanding).not.toContain("useAuth");
    expect(featuresLanding).not.toContain("CanvasEditor");
    expect(featuresLanding).not.toContain("signInWithGoogle");
    expect(featuresLanding).toContain("<ArtShiftLogo");
  });
});
