import { describe, expect, it } from "vitest";
import {
  buildPromptHelperVariantUserMessage,
  groundPromptHelperRationale,
  PROMPT_HELPER_VARIANT_SYSTEM,
  parsePromptHelperVariantPlan,
} from "@/lib/ai/orchestration/promptHelperVariantPlan";
import { resolveOptionPreview } from "@/lib/ai/orchestration/promptOptionCatalog";
import {
  applyPromptHelperVariantPlan,
  buildRefinedPromptString,
  createPromptRefinement,
  listPromptHelperCatalogAxes,
  listPromptHelperPlanningCatalog,
} from "@/lib/ai/orchestration/promptRefinement";

describe("prompt helper variant plan", () => {
  it("parses Gemini JSON plans and ignores junk", () => {
    const plan = parsePromptHelperVariantPlan(`\`\`\`json
{
  "situation": "theme_broad",
  "rationale": "ธีมกว้าง กระจายขั้วสี",
  "preferBrandAxes": false,
  "axes": [
    { "id": "color", "optionIds": ["vibrant", "pastel", "dark"] },
    { "id": "background", "optionIds": ["studio", "nature"] }
  ]
}
\`\`\``);
    expect(plan).toMatchObject({
      situation: "theme_broad",
      preferBrandAxes: false,
    });
    expect(plan?.axes).toHaveLength(2);
    expect(parsePromptHelperVariantPlan("not json")).toBeNull();
  });

  it("applies a plan by filtering catalog options onto the card", () => {
    const baseline = createPromptRefinement("สร้างภาพ");
    const planned = applyPromptHelperVariantPlan(baseline, {
      situation: "theme_broad",
      rationale: "test",
      preferBrandAxes: false,
      axes: [
        { id: "color", optionIds: ["vibrant", "pastel", "missing-id"] },
        { id: "camera", optionIds: ["front", "closeup"] },
      ],
    });
    expect(planned.dimensions).toHaveLength(2);
    expect(planned.dimensions[0]?.id).toBe("color");
    expect(planned.dimensions[0]?.options.map((o) => o.id)).toEqual(["vibrant", "pastel"]);
    expect(planned.dimensions[1]?.id).toBe("camera");
    expect(planned.dimensions[1]?.options.map((o) => o.id)).toEqual(["front", "closeup"]);
  });

  it("keeps cat สี and สายพันธุ์ when Gemini plans generic palette color", () => {
    const baseline = createPromptRefinement("สร้างรูปแมว");
    const planned = applyPromptHelperVariantPlan(baseline, {
      situation: "subject_explore",
      rationale: "test",
      preferBrandAxes: false,
      axes: [
        { id: "color", optionIds: ["vibrant", "pastel", "dark"] },
        { id: "atmosphere", optionIds: ["atm_epic", "atm_playful"] },
      ],
    });
    const ids = planned.dimensions.map((d) => d.id);
    expect(ids).toContain("color");
    expect(ids).toContain("breed");
    expect(ids[0]).toBe("color");
    const color = planned.dimensions.find((d) => d.id === "color");
    expect(color?.title).toBe("สี");
    expect(color?.options.map((o) => o.id)).toContain("orange");
    expect(color?.options.map((o) => o.id)).not.toContain("vibrant");
    const breed = planned.dimensions.find((d) => d.id === "breed");
    expect(breed?.title).toBe("สายพันธุ์");
    expect(breed?.options.map((o) => o.id)).toContain("scottish");
  });

  it("keeps system prompt free of hardcoded campaign brands", () => {
    expect(PROMPT_HELPER_VARIANT_SYSTEM).not.toMatch(/Welearn|Manifest/i);
    expect(PROMPT_HELPER_VARIANT_SYSTEM).toContain("Shared Anchors");
    expect(PROMPT_HELPER_VARIANT_SYSTEM).toContain("Level 2");
    expect(PROMPT_HELPER_VARIANT_SYSTEM).toContain("ลายเกล็ด");
    expect(PROMPT_HELPER_VARIANT_SYSTEM).not.toContain("prefer atmosphere + creative + lighting");
  });

  it("exposes a catalog snapshot for Gemini planning", () => {
    const axes = listPromptHelperCatalogAxes();
    expect(axes.some((a) => a.axisId === "color")).toBe(true);
    expect(axes.some((a) => a.axisId === "mood")).toBe(true);
  });
});

describe("subject-specific prompt helper plans", () => {
  const dragonPlan = {
    situation: "subject_explore" as const,
    rationale: "เลือกแกนที่ช่วยเสริมความอลังการและจินตนาการของมังกร ทั้งบรรยากาศ สเกล และรายละเอียดของเกล็ด",
    preferBrandAxes: false,
    axes: [
      {
        id: "species",
        title: "ชนิดมังกร",
        hint: "รูปร่างหลักของมังกร",
        optionIds: [],
        options: [
          {
            id: "wyvern",
            label: "ไวเวิร์น",
            modifier: "มังกรไวเวิร์นสองปีก",
            character: "สองปีก",
          },
          {
            id: "eastern",
            label: "มังกรตะวันออก",
            modifier: "มังกรตะวันออกลำตัวยาว",
            character: "ยาว",
          },
        ],
      },
      {
        id: "wings",
        title: "ลักษณะปีก",
        hint: "รูปปีก",
        optionIds: [],
        options: [
          { id: "bat", label: "ปีกค้างคาว", modifier: "ปีกหนังแบบค้างคาว", character: "หนัง" },
          { id: "feather", label: "ปีกขนนก", modifier: "ปีกขนนกกว้าง", character: "ขน" },
        ],
      },
      {
        id: "breath",
        title: "ลมหายใจ",
        hint: "สิ่งที่พ่น",
        optionIds: [],
        options: [
          { id: "fire", label: "ไฟ", modifier: "พ่นเปลวไฟ", character: "ไฟ" },
          { id: "frost", label: "น้ำแข็ง", modifier: "พ่นลมหายใจน้ำแข็ง", character: "เย็น" },
        ],
      },
      {
        id: "scales",
        title: "ลายเกล็ด",
        hint: "ผิวเกล็ด",
        optionIds: [],
        options: [
          {
            id: "obsidian",
            label: "เกล็ดออบซิเดียน",
            modifier: "เกล็ดสีดำออบซิเดียนเงา",
            character: "เข้ม",
          },
          {
            id: "gold",
            label: "เกล็ดทอง",
            modifier: "เกล็ดสีทองแวววาว",
            character: "ทอง",
          },
        ],
      },
    ],
  };

  const sushiPlan = {
    situation: "subject_explore" as const,
    rationale: "เลือกแกนรูปแบบซูชิ ชนิดปลา และการจัดจาน",
    preferBrandAxes: false,
    axes: [
      {
        id: "sushi_style",
        title: "รูปแบบซูชิ",
        optionIds: [],
        options: [
          { id: "nigiri", label: "นิกิริ", modifier: "ซูชินิกิริชิ้นปลาบนข้าว", character: "นิกิริ" },
          { id: "maki", label: "มากิ", modifier: "ซูชิมากิม้วนสาหร่าย", character: "ม้วน" },
        ],
      },
      {
        id: "fish",
        title: "ชนิดปลา",
        optionIds: [],
        options: [
          { id: "salmon", label: "แซลมอน", modifier: "ปลาแซลมอนสด", character: "ส้ม" },
          { id: "tuna", label: "ทูน่า", modifier: "ปลาทูน่าแดง", character: "แดง" },
        ],
      },
      {
        id: "plating",
        title: "การจัดจาน",
        optionIds: [],
        options: [
          { id: "wood", label: "ถาดไม้", modifier: "จัดบนถาดไม้ญี่ปุ่น", character: "ไม้" },
          { id: "slate", label: "จานหิน", modifier: "จัดบนจานหินสเลท", character: "หิน" },
        ],
      },
    ],
  };

  it("plans dragon-relevant axes instead of the generic photography pack", () => {
    const baseline = createPromptRefinement("สร้างรูปมังกร");
    expect(baseline.dimensions.map((dim) => dim.id)).toEqual(
      expect.arrayContaining(["atmosphere", "lighting", "background", "weather"]),
    );

    const planned = applyPromptHelperVariantPlan(baseline, dragonPlan);
    const ids = planned.dimensions.map((dim) => dim.id);
    expect(ids).toEqual(["species", "wings", "breath", "scales"]);
    expect(ids).not.toContain("atmosphere");
    expect(ids).not.toContain("lighting");
    expect(ids).not.toContain("background");
    expect(planned.dimensions.find((dim) => dim.id === "scales")?.title).toBe("ลายเกล็ด");
    expect(
      planned.dimensions.find((dim) => dim.id === "breath")?.options.map((o) => o.label),
    ).toEqual(["ไฟ", "น้ำแข็ง"]);

    const wyvern = planned.dimensions[0]?.options[0];
    expect(wyvern?.id).toBe("species__wyvern");
    const refined = buildRefinedPromptString(planned, { species: wyvern?.id ?? "" });
    expect(refined).toContain("สร้างรูปมังกร");
    expect(refined).toContain("มังกรไวเวิร์นสองปีก");

    const rationale = groundPromptHelperRationale(
      dragonPlan.rationale,
      planned.dimensions,
      "สร้างรูปมังกร",
    );
    expect(rationale).toBe("เลือกแกนให้เข้ากับพรอมป์นี้: ชนิดมังกร, ลักษณะปีก, ลมหายใจ, ลายเกล็ด");
    expect(rationale).not.toContain("อลังการ");
    expect(rationale).toContain("ลายเกล็ด");
  });

  it("keeps a grounded rationale when the model names only the axes it returned", () => {
    const planned = applyPromptHelperVariantPlan(createPromptRefinement("สร้างรูปมังกร"), dragonPlan);
    const rationale = groundPromptHelperRationale(
      "เลือกแกนชนิดมังกร ลักษณะปีก ลมหายใจ และลายเกล็ด",
      planned.dimensions,
      "สร้างรูปมังกร",
    );
    expect(rationale).toBe("เลือกแกนชนิดมังกร ลักษณะปีก ลมหายใจ และลายเกล็ด");
  });

  it("gives an unrelated subject its own axes", () => {
    const dragon = applyPromptHelperVariantPlan(createPromptRefinement("สร้างรูปมังกร"), dragonPlan);
    const sushi = applyPromptHelperVariantPlan(createPromptRefinement("สร้างรูปซูชิ"), sushiPlan);
    const dragonIds = new Set(dragon.dimensions.map((dim) => dim.id));
    expect(sushi.dimensions.map((dim) => dim.id)).toEqual(["sushi_style", "fish", "plating"]);
    expect(sushi.dimensions.every((dim) => !dragonIds.has(dim.id))).toBe(true);
    expect(sushi.dimensions.map((dim) => dim.title)).toEqual(["รูปแบบซูชิ", "ชนิดปลา", "การจัดจาน"]);
  });

  it("uses the generic catalog only when planning fails", () => {
    const baseline = createPromptRefinement("สร้างรูปมังกร");
    expect(applyPromptHelperVariantPlan(baseline, null)).toBe(baseline);
    expect(
      applyPromptHelperVariantPlan(baseline, {
        situation: "subject_explore",
        rationale: "ว่าง",
        preferBrandAxes: false,
        axes: [{ id: "species", title: "ชนิดมังกร", optionIds: ["not-a-real-option"] }],
      }),
    ).toBe(baseline);
    expect(baseline.dimensions.map((dim) => dim.title)).toEqual(
      expect.arrayContaining(["อารมณ์ภาพ", "แสง", "พื้นหลัง"]),
    );
    expect(listPromptHelperPlanningCatalog("สร้างรูปมังกร")).toEqual([]);
    expect(buildPromptHelperVariantUserMessage("สร้างรูปมังกร", [])).toContain("invent every axis");
    expect(buildPromptHelperVariantUserMessage("สร้างรูปมังกร", [])).not.toContain("atm_epic");

    const catCatalog = listPromptHelperPlanningCatalog("สร้างรูปแมว");
    expect(catCatalog.map((axis) => axis.axisId)).toEqual(["color", "breed"]);
    expect(catCatalog.find((axis) => axis.axisId === "color")?.options.map((o) => o.id)).toContain(
      "orange",
    );
    expect(
      catCatalog.find((axis) => axis.axisId === "color")?.options.map((o) => o.id),
    ).not.toContain("vibrant");
  });

  it("parses invented option cards", () => {
    const plan = parsePromptHelperVariantPlan(
      JSON.stringify({
        situation: "subject_explore",
        rationale: "เลือกแกนชนิดมังกร",
        preferBrandAxes: false,
        axes: dragonPlan.axes,
      }),
    );
    expect(plan?.axes[0]?.title).toBe("ชนิดมังกร");
    expect(plan?.axes[0]?.options?.[0]?.modifier).toBe("มังกรไวเวิร์นสองปีก");
    expect(plan?.axes).toHaveLength(4);
  });
});

describe("prompt helper image previews", () => {
  it("falls back to library preview when no VPS thumb exists yet", () => {
    const preview = resolveOptionPreview("vibrant");
    expect(preview?.kind === "swatch" || preview?.kind === "image").toBe(true);
  });
});
