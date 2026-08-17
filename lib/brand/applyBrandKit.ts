/**
 * Non-destructive Brand Kit Application Engine.
 * Applies publisher color palette, typography, and logo watermarks to slides.
 */

import { createImage, createText } from "../engine/factory";
import type { EngineSlide, ImageElement, TextElement } from "../engine/types";
import type { BrandKit } from "./brandKit";

export function applyBrandKitToSlide(slide: EngineSlide, brandKit: BrandKit): EngineSlide {
  const updatedSlide = structuredClone(slide);
  const { colors, typography, logo } = brandKit;

  // 1. Update slide background
  updatedSlide.background = colors.background;

  // 2. Update existing elements with brand colors & fonts
  for (const el of updatedSlide.elements) {
    if (el.isDeleted) continue;

    if (el.type === "text") {
      const textEl = el as TextElement;
      // Header vs body heuristic
      if (textEl.fontSize >= 28) {
        textEl.fontFamily = typography.headerFont;
      } else {
        textEl.fontFamily = typography.bodyFont;
      }

      // If text color matches previous primary/dark, re-align with brand text color
      if (
        textEl.strokeColor === "#ffffff" &&
        colors.background !== "#ffffff" &&
        colors.background !== "#fbf8f3"
      ) {
        textEl.strokeColor = colors.text;
      }
    }

    // Update CTA buttons / badge backgrounds
    if (
      el.type === "rect" &&
      (el.backgroundColor === "#ef4444" ||
        el.backgroundColor === "#f59e0b" ||
        el.backgroundColor === "#2563eb" ||
        el.backgroundColor === "#0284c7")
    ) {
      el.backgroundColor = colors.accent;
    }
  }

  // 3. Add or update publisher logo watermark if enabled
  if (brandKit.rules.requireLogo) {
    const W = updatedSlide.width;
    const H = updatedSlide.height;
    const logoW = logo.size;
    const logoH = Math.round(logo.size * 0.3);
    const margin = 28;

    let lx = margin;
    let ly = margin;

    switch (logo.position) {
      case "top-left":
        lx = margin;
        ly = margin;
        break;
      case "top-right":
        lx = W - logoW - margin;
        ly = margin;
        break;
      case "bottom-left":
        lx = margin;
        ly = H - logoH - margin;
        break;
      case "bottom-right":
        lx = W - logoW - margin;
        ly = H - logoH - margin;
        break;
    }

    // Check if existing logo element exists
    const existingLogoIndex = updatedSlide.elements.findIndex(
      (e) => (e as ImageElement).sourceName === "brand-publisher-logo",
    );

    if (existingLogoIndex !== -1) {
      // Update existing
      const existing = updatedSlide.elements[existingLogoIndex];
      existing.x = lx;
      existing.y = ly;
      existing.width = logoW;
      existing.height = logoH;
      existing.opacity = logo.opacity;
    } else {
      // Insert new logo watermark
      let logoEl: ImageElement | TextElement;
      if (logo.dataUrl) {
        logoEl = {
          ...createImage({
            x: lx,
            y: ly,
            width: logoW,
            height: logoH,
            fileId: logo.dataUrl,
            naturalWidth: logoW,
            naturalHeight: logoH,
          }),
          sourceName: "brand-publisher-logo",
          opacity: logo.opacity,
        };
      } else {
        logoEl = {
          ...createText({
            x: lx,
            y: ly,
            text: brandKit.publisherName,
            fontSize: 16,
            fontFamily: typography.headerFont,
          }),
          strokeColor: colors.secondary,
          opacity: logo.opacity,
        };
      }

      // Add to slide
      updatedSlide.elements.push(logoEl);
      if (updatedSlide.layers.length > 0) {
        updatedSlide.layers[0].objectIds.push(logoEl.id);
      }
    }
  }

  return updatedSlide;
}
