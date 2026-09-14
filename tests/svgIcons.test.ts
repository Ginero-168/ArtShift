import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vector SVG Icons & Zero-Emoji Enforcement", () => {
  const rootDir = path.resolve(__dirname, "..");
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it("ensures icons.tsx contains all required vector SVG icon definitions", () => {
    const iconsPath = path.join(rootDir, "components/icons.tsx");
    const content = fs.readFileSync(iconsPath, "utf-8");

    const requiredIcons = [
      "IconZap",
      "IconTierDot",
      "IconGem",
      "IconCrown",
      "IconSearch",
      "IconBrain",
      "IconPalette",
      "IconShieldCheck",
      "IconLayoutGrid",
      "IconPenEdit",
      "IconBot",
      "IconCamera",
      "IconCube",
      "IconFlower",
      "IconDice",
      "IconBuilding",
      "IconScale",
      "IconBulb",
      "IconPenTool",
      "IconContrast",
      "IconClose",
      "IconCheck",
      "IconSpinner",
      "IconScissors",
      "IconLock",
      "IconLockOpen",
    ];

    for (const icon of requiredIcons) {
      expect(content).toContain(`export const ${icon}`);
    }
  });

  it("ensures ChatComposer.tsx has clean quality options and specialized renderQualityIcon", () => {
    const chatComposerPath = path.join(rootDir, "components/AI/ChatComposer.tsx");
    const content = fs.readFileSync(chatComposerPath, "utf-8");

    // Must export renderQualityIcon
    expect(content).toContain("export function renderQualityIcon");

    // Quality badges in QUALITY_OPTIONS must be empty strings (no emojis like ⚡, 🟢, 🔵, 🟣, 💎, 👑)
    const badgeMatches = content.match(/badge:\s*["']([^"']*)["']/g) || [];
    for (const match of badgeMatches) {
      expect(emojiRegex.test(match)).toBe(false);
    }
  });

  it("verifies that AIImageGeneratorModal uses vector SVGs instead of emoji placeholders", () => {
    const modalPath = path.join(rootDir, "components/AI/AIImageGeneratorModal.tsx");
    const content = fs.readFileSync(modalPath, "utf-8");

    expect(content).not.toContain("🎨</div>");
    expect(content).not.toContain("⚠️</div>");
    expect(content).not.toContain("🖼️</div>");
    expect(content).toContain("<IconPalette");
    expect(content).toContain("<IconWarning");
    expect(content).toContain("<IconPolaroid");
  });

  it("verifies that BrandKitModal uses vector SVGs instead of emoji icons", () => {
    const brandKitPath = path.join(rootDir, "components/Brand/BrandKitModal.tsx");
    const content = fs.readFileSync(brandKitPath, "utf-8");

    expect(content).not.toContain("👑 Publisher Brand Kit");
    expect(content).not.toContain("🏢 สำนักพิมพ์");
    expect(content).not.toContain("🎨 ชุดสี");
    expect(content).not.toContain("⚖️ กฎเกณฑ์");
    expect(content).toContain("<IconCrown");
    expect(content).toContain("<IconBuilding");
    expect(content).toContain("<IconScale");
  });
});
