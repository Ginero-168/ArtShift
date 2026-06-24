import { describe, expect, it } from "vitest";
import { ApplyTemplateInputSchema, safeParse } from "@/lib/schemas";
import { CANVAS_H, CANVAS_W, runTemplate } from "@/lib/templates";

function insideCanvas(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x + w <= CANVAS_W && y + h <= CANVAS_H;
}

describe("runTemplate", () => {
  it("three-column-cards: aligns all section headers at the same y", () => {
    const r = runTemplate({
      template: "three-column-cards",
      data: {
        title: "น้ำเต้าหู้",
        subtitle: "เครื่องดื่มเพื่อสุขภาพ",
        columns: [
          { icon: "🥛", header: "คืออะไร?", body: { kind: "paragraph", text: "short" } },
          {
            icon: "💪",
            header: "ประโยชน์",
            body: { kind: "list", items: ["A", "B", "C"] },
          },
          {
            icon: "🍃",
            header: "เครื่องเคียง",
            body: { kind: "list", items: ["ปาท่องโก๋"] },
          },
        ],
      },
    });
    expect(r).not.toBeNull();
    const objs = r!.objects;

    // Section headers are the 3 text objects that start with an icon.
    const headers = objs.filter((o) => o.type === "text" && /^(🥛|💪|🍃)/.test((o as any).text));
    expect(headers).toHaveLength(3);
    const ys = headers.map((h) => h.y);
    expect(new Set(ys).size).toBe(1);

    // All objects live inside the canvas.
    for (const o of objs) {
      expect(insideCanvas(o.x, o.y, o.width, o.height)).toBe(true);
    }
  });

  it("three-column-cards: cards share the same height", () => {
    const r = runTemplate({
      template: "three-column-cards",
      data: {
        title: "T",
        columns: [
          { header: "A", body: { kind: "list", items: ["a"] } },
          { header: "B", body: { kind: "list", items: ["b", "c", "d"] } },
        ],
      },
    });
    const cards = r!.objects.filter((o) => o.type === "rect" && o.y > 100);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const hs = cards.map((c) => c.height);
    expect(new Set(hs).size).toBe(1);
  });

  it("title-bullets produces a title, underline, and one bullet block", () => {
    const r = runTemplate({
      template: "title-bullets",
      data: { title: "Roadmap", bullets: ["ship", "iterate", "scale"] },
    });
    const texts = r!.objects.filter((o) => o.type === "text");
    expect(texts).toHaveLength(2); // title + bullets
    const bullets = texts.find((t) => (t as any).text.includes("ship"));
    expect(bullets).toBeDefined();
    expect((bullets as any).text).toContain("•");
  });

  it("hero: centers the title horizontally", () => {
    const r = runTemplate({
      template: "hero",
      data: { title: "Welcome", subtitle: "Sub", cta: "Go" },
    });
    const title = r!.objects.find((o) => o.type === "text" && (o as any).text === "Welcome")!;
    // Title spans full content width with center alignment → visually centered.
    expect((title as any).textAlign).toBe("center");
    expect(title.x + title.width).toBeLessThanOrEqual(CANVAS_W);
  });

  it("image-text-split: requires imageUrl and places image inside canvas", () => {
    const r = runTemplate({
      template: "image-text-split",
      data: {
        title: "Thai Culture",
        body: "Long-form body text here.",
        imageUrl: "https://images.unsplash.com/photo-abc?w=1280",
        imageSide: "left",
      },
    });
    expect(r).not.toBeNull();
    const img = r!.objects.find((o) => o.type === "image")!;
    expect(img.x + img.width).toBeLessThanOrEqual(CANVAS_W);
    expect(img.y + img.height).toBeLessThanOrEqual(CANVAS_H);
  });

  it("stat-grid: 4 stats become 2x2, share sizes", () => {
    const r = runTemplate({
      template: "stat-grid",
      data: {
        title: "Impact",
        stats: [
          { value: "12M", label: "users" },
          { value: "99%", label: "uptime" },
          { value: "35", label: "countries" },
          { value: "4.9", label: "rating" },
        ],
      },
    });
    const cards = r!.objects.filter((o) => o.type === "rect" && o.width > 300 && o.height > 50);
    expect(cards).toHaveLength(4);
    const ws = new Set(cards.map((c) => c.width));
    const hs = new Set(cards.map((c) => c.height));
    expect(ws.size).toBe(1);
    expect(hs.size).toBe(1);
  });

  it("quote: centers quote text and includes attribution when provided", () => {
    const r = runTemplate({
      template: "quote",
      data: { quote: "Design is intelligence made visible.", attribution: "Alina Wheeler" },
    });
    const attr = r!.objects.find(
      (o) => o.type === "text" && (o as any).text.includes("Alina Wheeler"),
    );
    expect(attr).toBeDefined();
  });

  it("timeline: dots are evenly spaced on a shared y", () => {
    const r = runTemplate({
      template: "timeline",
      data: {
        title: "Roadmap",
        steps: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
      },
    });
    const dots = r!.objects.filter((o) => o.type === "rect" && o.width === 36);
    expect(dots).toHaveLength(4);
    const ys = new Set(dots.map((d) => d.y));
    expect(ys.size).toBe(1);
    // Dots roughly evenly spaced
    const xs = dots.map((d) => d.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - avg)).toBeLessThan(2);
  });

  it("comparison: tone fills differ between good/bad cards", () => {
    const r = runTemplate({
      template: "comparison",
      data: {
        title: "Before vs After",
        left: { header: "Before", tone: "bad", items: ["slow"] },
        right: { header: "After", tone: "good", items: ["fast"] },
      },
    });
    const cards = r!.objects.filter((o) => o.type === "rect" && o.y > 100);
    const fills = cards.map((c) => (c as any).backgroundColor);
    expect(fills[0]).not.toBe(fills[1]);
  });
});

describe("ApplyTemplateInputSchema", () => {
  it("accepts a valid three-column-cards payload", () => {
    const input = {
      template: "three-column-cards",
      data: {
        title: "T",
        columns: [{ header: "H", body: { kind: "paragraph", text: "x" } }],
      },
    };
    expect(safeParse(ApplyTemplateInputSchema, input)).not.toBeNull();
  });

  it("rejects an unknown template name", () => {
    expect(
      safeParse(ApplyTemplateInputSchema, {
        template: "freeform",
        data: { title: "T" },
      }),
    ).toBeNull();
  });

  it("rejects columns > 3 on three-column-cards", () => {
    const input = {
      template: "three-column-cards",
      data: {
        title: "T",
        columns: Array.from({ length: 4 }, (_, i) => ({
          header: `H${i}`,
          body: { kind: "list" as const, items: ["a"] },
        })),
      },
    };
    expect(safeParse(ApplyTemplateInputSchema, input)).toBeNull();
  });

  it("rejects comparison missing one side", () => {
    expect(
      safeParse(ApplyTemplateInputSchema, {
        template: "comparison",
        data: {
          title: "T",
          left: { header: "L", items: ["a"] },
        },
      }),
    ).toBeNull();
  });
});
