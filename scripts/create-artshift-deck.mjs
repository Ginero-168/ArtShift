import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "OpenAI Codex";
pptx.company = "ArtShift";
pptx.subject = "ArtShift product and marketing impact assessment";
pptx.title = "ArtShift — From Design Tool to Creative Operations";
pptx.lang = "th-TH";
pptx.theme = {
  headFontFace: "Noto Sans Thai",
  bodyFontFace: "Noto Sans Thai",
  lang: "th-TH",
};
pptx.defineSlideMaster({
  title: "BASE",
  background: { color: "F7F8FA" },
  objects: [
    { rect: { x: 0, y: 7.23, w: 13.333, h: 0.27, fill: { color: "0E1B2D" }, line: { color: "0E1B2D" } } },
  ],
  slideNumber: { x: 12.58, y: 7.27, color: "FFFFFF", fontFace: "Aptos", fontSize: 8 },
});

const W = 13.333;
const H = 7.5;
const C = {
  bg: "F7F8FA",
  navy: "0E1B2D",
  ink: "172033",
  muted: "667085",
  line: "D8E0EA",
  blue: "087FE5",
  cyan: "5ED7C4",
  coral: "FF6B5E",
  yellow: "F6C75A",
  purple: "7567E8",
  white: "FFFFFF",
  green: "25A77A",
  paleBlue: "EAF4FF",
  paleCyan: "E8FBF7",
  paleCoral: "FFF0EE",
  paleYellow: "FFF8E6",
  palePurple: "F0EEFF",
};
const FONT = "Noto Sans Thai";
const MONO = "Aptos Mono";
const iconPath = "/opt/artshift/public/icon.svg";

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: opts.fontFace ?? FONT,
    fontSize: opts.fontSize ?? 16,
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    margin: opts.margin ?? 0,
    breakLine: false,
    fit: "shrink",
    valign: opts.valign ?? "mid",
    align: opts.align ?? "left",
    paraSpaceAfterPt: opts.paraSpaceAfterPt,
    bullet: opts.bullet,
    transparency: opts.transparency,
  });
}

function box(slide, x, y, w, h, fill, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: fill, transparency: opts.transparency ?? 0 },
    line: { color: opts.line ?? fill, transparency: opts.lineTransparency ?? 0, width: opts.lineWidth ?? 0.8 },
    radius: opts.radius,
    shadow: opts.shadow,
  });
}

function line(slide, x, y, w, color = C.line, width = 1, opts = {}) {
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h: opts.h ?? 0,
    line: { color, width, beginArrowType: opts.beginArrowType, endArrowType: opts.endArrowType, transparency: opts.transparency ?? 0 },
  });
}

function pill(slide, text, x, y, w, fill = C.paleBlue, color = C.blue) {
  box(slide, x, y, w, 0.32, fill, { line: fill });
  addText(slide, text, x, y + 0.01, w, 0.26, { fontSize: 9.5, color, bold: true, align: "center" });
}

function footer(slide, label = "ArtShift · Product review · 14 Sep 2026") {
  addText(slide, label, 0.58, 7.24, 5.6, 0.2, { fontSize: 8, color: C.white, valign: "mid" });
}

function header(slide, kicker, title, page) {
  addText(slide, kicker.toUpperCase(), 0.58, 0.36, 4.5, 0.22, { fontSize: 9.5, color: C.blue, bold: true });
  addText(slide, title, 0.58, 0.62, 11.8, 0.56, { fontSize: 27, color: C.navy, bold: true });
  line(slide, 0.58, 1.34, 12.15, C.line, 1);
  addText(slide, String(page).padStart(2, "0"), 12.24, 0.42, 0.5, 0.25, { fontSize: 11, color: C.muted, bold: true, align: "right" });
}

function cardTitle(slide, title, subtitle, x, y, w, color = C.ink) {
  addText(slide, title, x, y, w, 0.3, { fontSize: 15, color, bold: true });
  if (subtitle) addText(slide, subtitle, x, y + 0.32, w, 0.38, { fontSize: 10.5, color: C.muted, valign: "top" });
}

function arrow(slide, x1, y1, x2, y2, color = C.blue, width = 1.8) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width, endArrowType: "triangle" },
  });
}

function dot(slide, x, y, r, fill) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: r, h: r, fill: { color: fill }, line: { color: fill } });
}

function addMetric(slide, x, y, w, value, label, fill, valueColor = C.navy) {
  box(slide, x, y, w, 0.9, fill, { line: fill });
  addText(slide, value, x + 0.12, y + 0.12, w - 0.24, 0.34, { fontSize: 22, color: valueColor, bold: true });
  addText(slide, label, x + 0.12, y + 0.52, w - 0.24, 0.2, { fontSize: 9.5, color: C.muted });
}

function addStage(slide, x, y, w, title, body, fill, accent = C.blue) {
  box(slide, x, y, w, 1.02, fill, { line: fill });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h: 1.02, fill: { color: accent }, line: { color: accent } });
  addText(slide, title, x + 0.18, y + 0.14, w - 0.3, 0.27, { fontSize: 13, bold: true, color: C.navy });
  addText(slide, body, x + 0.18, y + 0.48, w - 0.3, 0.38, { fontSize: 9.5, color: C.muted, valign: "top" });
}

// 01 — Cover
{
  const s = pptx.addSlide();
  s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 5.25, h: H, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(pptx.ShapeType.arc, { x: 3.75, y: -0.85, w: 4.3, h: 4.3, adjustPoint: 0.2, fill: { color: C.cyan, transparency: 10 }, line: { color: C.cyan, transparency: 100 } });
  s.addShape(pptx.ShapeType.arc, { x: 9.35, y: 5.55, w: 4.1, h: 4.1, adjustPoint: 0.2, fill: { color: C.coral, transparency: 8 }, line: { color: C.coral, transparency: 100 } });
  s.addImage({ path: iconPath, x: 0.62, y: 0.58, w: 0.58, h: 0.58 });
  addText(s, "ARTSHIFT", 1.34, 0.64, 2.6, 0.34, { fontSize: 18, color: C.white, bold: true });
  addText(s, "จากเครื่องมือออกแบบ\nสู่ Creative Operations\nสำหรับ Book Commerce", 0.7, 2.05, 11.6, 1.7, { fontSize: 31, color: C.white, bold: true, valign: "top" });
  addText(s, "นำข้อมูลหนังสือ + asset ที่อนุมัติแล้ว\nไปสร้าง creative pack หลายช่องทางที่แก้ไขต่อได้ ตรวจสอบได้ และ scale ได้", 0.72, 4.33, 7.2, 0.75, { fontSize: 16, color: "DDEBFF", valign: "top" });
  pill(s, "EXECUTIVE PRODUCT NARRATIVE", 0.72, 6.25, 2.38, C.white, C.blue);
  addText(s, "Product review · Current state · Future operating model", 8.05, 6.31, 4.55, 0.22, { fontSize: 10, color: "B6C6D9", align: "right" });
  addText(s, "14 กันยายน 2026", 10.35, 6.66, 2.25, 0.22, { fontSize: 10, color: "B6C6D9", align: "right" });
}

// 02 — Thesis
{
  const s = pptx.addSlide("BASE");
  header(s, "The thesis", "ไฟล์งาน 1 ชุด ไม่ควรกลายเป็น 10 เวอร์ชันที่ต้องแก้มือ", 2);
  addText(s, "ArtShift เปลี่ยนงาน creative จากการผลิตทีละชิ้น\nเป็นระบบที่ผลิตซ้ำได้ ปลอดภัยต่อข้อมูล และวัดผลได้", 0.6, 1.7, 7.3, 1.05, { fontSize: 24, color: C.navy, bold: true, valign: "top" });
  box(s, 0.6, 3.08, 7.3, 1.12, C.navy, { line: C.navy });
  addText(s, "1 book SKU", 0.88, 3.31, 1.55, 0.38, { fontSize: 23, color: C.white, bold: true });
  arrow(s, 2.48, 3.5, 3.27, 3.5, C.cyan, 2.4);
  addText(s, "1 approved\ncreative pack", 3.5, 3.23, 1.6, 0.56, { fontSize: 17, color: C.cyan, bold: true, valign: "top" });
  arrow(s, 5.3, 3.5, 6.1, 3.5, C.cyan, 2.4);
  addText(s, "ทุกช่องทาง", 6.28, 3.31, 1.25, 0.38, { fontSize: 18, color: C.white, bold: true });
  addMetric(s, 8.48, 1.85, 1.35, "↓", "เวลาผลิต", C.paleBlue, C.blue);
  addMetric(s, 9.98, 1.85, 1.35, "↓", "rework", C.paleCoral, C.coral);
  addMetric(s, 11.48, 1.85, 1.35, "↑", "capacity", C.paleCyan, C.green);
  cardTitle(s, "Product promise", "ความเร็ว + ความถูกต้อง + ความสามารถในการนำกลับมาใช้ซ้ำ", 8.48, 3.25, 4.4);
  addText(s, "บริษัทไม่ได้ซื้อแค่ editor\nแต่ซื้อ operating leverage ของทีม marketing/design", 8.48, 4.18, 4.1, 0.78, { fontSize: 18, color: C.navy, bold: true, valign: "top" });
  footer(s);
}

// 03 — Pain
{
  const s = pptx.addSlide("BASE");
  header(s, "The problem", "งานโฆษณาหนังสือโตตามจำนวน SKU — แต่กระบวนการผลิตยังโตตามจำนวนคน", 3);
  const steps = [
    ["Brief", "รับข้อมูลจากหลายแหล่ง", C.paleBlue, C.blue],
    ["Design", "ทำชิ้นแรกด้วยมือ", C.palePurple, C.purple],
    ["Resize", "สร้างหลาย format", C.paleYellow, "C08A00"],
    ["Revise", "แก้ราคา/ข้อความ/ปก", C.paleCoral, C.coral],
    ["Export", "ตั้งชื่อและแยกไฟล์", C.paleBlue, C.blue],
    ["Handoff", "ส่งต่อหลายทีม", C.paleCyan, C.green],
  ];
  steps.forEach((st, i) => {
    const x = 0.62 + i * 2.08;
    box(s, x, 2.02, 1.72, 1.18, st[2], { line: st[2] });
    dot(s, x + 0.18, 2.25, 0.18, st[3]);
    addText(s, String(i + 1), x + 0.18, 2.27, 0.18, 0.12, { fontFace: "Aptos", fontSize: 8, color: C.white, bold: true, align: "center" });
    addText(s, st[0], x + 0.46, 2.18, 1.0, 0.25, { fontSize: 14, color: C.navy, bold: true });
    addText(s, st[1], x + 0.18, 2.67, 1.36, 0.3, { fontSize: 9.5, color: C.muted, valign: "top" });
    if (i < steps.length - 1) arrow(s, x + 1.73, 2.61, x + 2.0, 2.61, C.line, 1.3);
  });
  addText(s, "ต้นทุนที่มองไม่เห็น", 0.62, 3.85, 3.0, 0.3, { fontSize: 15, color: C.coral, bold: true });
  const costs = [
    ["ค้นหาไฟล์", "asset และ version กระจายอยู่หลายที่"],
    ["แก้ซ้ำ", "ราคา / ข้อความ / promotion เปลี่ยนแล้วตกหล่น"],
    ["ส่งต่อ", "ตั้งชื่อไฟล์และ upload ซ้ำทุกช่องทาง"],
  ];
  costs.forEach((item, i) => {
    const x = 0.62 + i * 4.12;
    box(s, x, 4.35, 3.72, 1.05, C.white, { line: C.line });
    addText(s, item[0], x + 0.22, 4.55, 1.6, 0.25, { fontSize: 13, color: C.navy, bold: true });
    addText(s, item[1], x + 0.22, 4.88, 3.2, 0.28, { fontSize: 9.5, color: C.muted, valign: "top" });
  });
  box(s, 0.62, 5.98, 12.02, 0.62, C.navy, { line: C.navy });
  addText(s, "ผลกระทบทางธุรกิจ: launch ช้าลง · brand ไม่สม่ำเสมอ · capacity ไม่เพิ่มตาม demand · rework กิน margin", 0.88, 6.15, 11.5, 0.24, { fontSize: 13, color: C.white, bold: true, align: "center" });
  footer(s);
}

// 04 — What exists
{
  const s = pptx.addSlide("BASE");
  header(s, "What exists today", "ArtShift มีแกน production engine ที่ลึกกว่าหน้าตา editor", 4);
  const columns = [
    ["Campaign", "CSV parser · 4 smart book templates\nbatch ZIP · manifest · preflight QA", C.paleBlue, C.blue],
    ["Brand", "Publisher palettes · typography\nlogo watermark · compliance rules", C.palePurple, C.purple],
    ["Editor", "Free / Block layers · vector paths\nThai typography · variants · smart arrange", C.paleYellow, "C08A00"],
    ["Local AI", "Florence-2 vision · RMBG\nraster Worker · VTracer WASM", C.paleCyan, C.green],
    ["Handoff", "PNG · PDF · PPTX · editable SVG\nIndexedDB · autosave · backup recovery", C.paleCoral, C.coral],
  ];
  columns.forEach((item, i) => {
    const x = 0.62 + i * 2.48;
    box(s, x, 1.82, 2.14, 2.38, item[2], { line: item[2] });
    s.addShape(pptx.ShapeType.rect, { x, y: 1.82, w: 2.14, h: 0.11, fill: { color: item[3] }, line: { color: item[3] } });
    addText(s, item[0], x + 0.18, 2.15, 1.7, 0.3, { fontSize: 16, color: C.navy, bold: true });
    addText(s, item[1], x + 0.18, 2.7, 1.78, 0.82, { fontSize: 10, color: C.muted, valign: "top" });
    addText(s, ["Data to output", "Governance", "Composition", "Intelligence", "Delivery"][i], x + 0.18, 3.76, 1.75, 0.18, { fontSize: 8.5, color: item[3], bold: true });
  });
  box(s, 0.62, 4.75, 12.02, 1.2, C.navy, { line: C.navy });
  addText(s, "จุดแข็งที่ควรรักษา", 0.92, 4.98, 2.2, 0.24, { fontSize: 14, color: C.cyan, bold: true });
  addText(s, "local-first · editable output · Thai-aware layout · atomic editor transactions · explicit cloud consent", 0.92, 5.34, 11.2, 0.3, { fontSize: 16, color: C.white, bold: true });
  addText(s, "คำวินิจฉัย: เครื่องยนต์พร้อมต่อยอดเป็น pilot; สิ่งที่ยังขาดคือระบบงานรอบเครื่องยนต์", 0.62, 6.28, 12.0, 0.3, { fontSize: 14, color: C.blue, bold: true, align: "center" });
  footer(s);
}

// 05 — Maturity
{
  const s = pptx.addSlide("BASE");
  header(s, "Current-state assessment", "สถานะวันนี้: Pilot-ready มากกว่า Enterprise-ready", 5);
  const rows = [
    ["Creative editor", 4.5, "Layer, vector, Thai text, variants, renderer", C.blue],
    ["Production automation", 4.0, "Templates, parser, QA, batch export", C.green],
    ["AI orchestration", 4.0, "Unified chat, Director, reviewable plan", C.purple],
    ["Privacy / local runtime", 4.0, "Browser-local models, Worker, consent boundary", "0A9B86"],
    ["Enterprise workflow", 1.5, "Org, workspace, approval, audit, sync ยังไม่มี", C.coral],
  ];
  rows.forEach((row, i) => {
    const y = 1.72 + i * 0.78;
    addText(s, row[0], 0.7, y + 0.15, 2.3, 0.25, { fontSize: 12.5, color: C.navy, bold: true });
    box(s, 3.05, y + 0.18, 5.6, 0.22, "E8EDF3", { line: "E8EDF3" });
    box(s, 3.05, y + 0.18, 5.6 * (row[1] / 5), 0.22, row[3], { line: row[3] });
    addText(s, `${row[1].toFixed(1)} / 5`, 8.82, y + 0.08, 0.72, 0.34, { fontFace: "Aptos", fontSize: 14, color: row[3], bold: true, align: "right" });
    addText(s, row[2], 9.84, y + 0.1, 2.4, 0.34, { fontSize: 9.5, color: C.muted, valign: "top" });
  });
  box(s, 0.68, 5.95, 12.0, 0.66, C.paleYellow, { line: C.paleYellow });
  addText(s, "Release signal ณ 14 Sep 2026", 0.95, 6.12, 2.25, 0.2, { fontSize: 10, color: "8A5A00", bold: true });
  addText(s, "typecheck ผ่าน · 1,047 tests ผ่าน / 1 skipped · lint ยังมี diagnostics ในชุด AI ที่กำลังพัฒนา", 3.15, 6.1, 8.95, 0.24, { fontSize: 11, color: C.navy, bold: true });
  footer(s);
}

// 06 — Impact
{
  const s = pptx.addSlide("BASE");
  header(s, "Business impact", "เจ้าของ ArtShift ได้ operating leverage 4 ชั้น", 6);
  const impacts = [
    ["1", "Speed", "จาก brief ถึง approved asset สั้นลง", "เพิ่มจำนวน campaign ที่ launch ได้ต่อสัปดาห์", C.paleBlue, C.blue],
    ["2", "Cost", "ลด designer touch time และรอบแก้", "ลด rework / agency / outsource ที่ไม่จำเป็น", C.paleCoral, C.coral],
    ["3", "Control", "ข้อมูลสินค้าและแบรนด์ไม่ drift", "ลดความเสี่ยงราคา ปก ชื่อผู้เขียน และ legal copy ผิด", C.palePurple, C.purple],
    ["4", "Growth", "ผลิตหลาย format ได้โดยไม่เพิ่มคนเป็นเส้นตรง", "ทดลอง creative / channel ได้ถี่ขึ้นและเรียนรู้เร็วขึ้น", C.paleCyan, C.green],
  ];
  impacts.forEach((it, i) => {
    const x = 0.62 + (i % 2) * 6.08;
    const y = 1.82 + Math.floor(i / 2) * 1.92;
    box(s, x, y, 5.7, 1.54, it[4], { line: it[4] });
    dot(s, x + 0.25, y + 0.3, 0.52, it[5]);
    addText(s, it[0], x + 0.25, y + 0.43, 0.52, 0.18, { fontFace: "Aptos", fontSize: 14, color: C.white, bold: true, align: "center" });
    addText(s, it[1], x + 1.0, y + 0.25, 2.0, 0.3, { fontSize: 17, color: C.navy, bold: true });
    addText(s, it[2], x + 1.0, y + 0.66, 4.2, 0.25, { fontSize: 12, color: C.ink, bold: true });
    addText(s, it[3], x + 1.0, y + 1.03, 4.25, 0.24, { fontSize: 9.5, color: C.muted, valign: "top" });
  });
  box(s, 0.62, 5.9, 12.02, 0.65, C.navy, { line: C.navy });
  addText(s, "มูลค่าไม่ได้อยู่ที่การสร้างภาพเร็วขึ้นอย่างเดียว — แต่อยู่ที่การลดต้นทุนทั้งระบบของการนำสินค้าออกสู่ตลาด", 0.9, 6.08, 11.45, 0.24, { fontSize: 13.5, color: C.white, bold: true, align: "center" });
  footer(s);
}

// 07 — Positioning
{
  const s = pptx.addSlide("BASE");
  header(s, "Positioning", "อย่าวาง ArtShift เป็น Canva อีกตัว — วางเป็นระบบผลิต creative ของธุรกิจหนังสือ", 7);
  box(s, 0.62, 1.72, 4.1, 4.52, C.navy, { line: C.navy });
  addText(s, "Creative Operations\nfor Book Commerce", 0.95, 2.12, 3.45, 1.05, { fontSize: 26, color: C.white, bold: true, valign: "top" });
  addText(s, "จาก catalog metadata\nสู่ approved media pack", 0.95, 3.62, 2.9, 0.58, { fontSize: 16, color: C.cyan, bold: true, valign: "top" });
  pill(s, "WEDGE", 0.95, 5.22, 0.82, C.blue, C.white);
  addText(s, "Publisher marketing · Merchandising · E-commerce · In-house design", 0.95, 5.67, 3.25, 0.35, { fontSize: 10, color: "C4D4E7", valign: "top" });
  const diffs = [
    ["Metadata-aware", "ISBN / ราคา / promotion เป็น source of truth ไม่ให้ AI แต่งเอง"],
    ["Rights-aware", "asset, owner, territory, expiry อยู่ใน flow เดียวกัน"],
    ["Thai-native", "ภาษาไทย ฟอนต์ และการตัดบรรทัดเป็น capability หลัก"],
    ["Editable + QA", "ไม่จบที่ภาพแบน — ทุก output แก้ต่อได้และตรวจได้"],
  ];
  diffs.forEach((it, i) => {
    const y = 1.78 + i * 1.1;
    dot(s, 5.34, y + 0.16, 0.14, [C.blue, C.purple, "C08A00", C.green][i]);
    addText(s, it[0], 5.68, y, 2.4, 0.25, { fontSize: 14, color: C.navy, bold: true });
    addText(s, it[1], 5.68, y + 0.34, 6.4, 0.34, { fontSize: 10.5, color: C.muted, valign: "top" });
    line(s, 5.68, y + 0.88, 6.25, C.line, 0.8);
  });
  addText(s, "ไม่ควรเริ่มด้วย", 5.34, 6.08, 1.55, 0.22, { fontSize: 10.5, color: C.coral, bold: true });
  addText(s, "generic text-to-image · full DAM · full video editor · social scheduler", 6.85, 6.08, 5.2, 0.22, { fontSize: 10.5, color: C.muted });
  footer(s);
}

// 08 — Future operating model
{
  const s = pptx.addSlide("BASE");
  header(s, "Future operating model", "จาก editor เดี่ยว สู่ 4 ชั้นของ Creative Operations", 8);
  const layers = [
    ["Studio", "ออกแบบ smart template\nแก้รายละเอียดต่อได้", "Now → Pilot", C.blue, C.paleBlue],
    ["Ops", "catalog · rights · version\nrequest · approval · audit", "Phase 2", C.purple, C.palePurple],
    ["Render", "queue · retry · idempotency\nbatch output · QA report", "Phase 1–2", "C08A00", C.paleYellow],
    ["Network", "approved media pack\nระหว่าง publisher–retailer", "12+ months", C.green, C.paleCyan],
  ];
  layers.forEach((it, i) => {
    const x = 0.62 + i * 3.03;
    box(s, x, 1.86, 2.62, 2.52, it[4], { line: it[4] });
    s.addShape(pptx.ShapeType.rect, { x, y: 1.86, w: 2.62, h: 0.12, fill: { color: it[3] }, line: { color: it[3] } });
    addText(s, it[0], x + 0.22, 2.2, 2.1, 0.32, { fontSize: 20, color: C.navy, bold: true });
    addText(s, it[1], x + 0.22, 2.9, 2.1, 0.58, { fontSize: 12, color: C.ink, bold: true, valign: "top" });
    pill(s, it[2], x + 0.22, 3.8, 1.0, C.white, it[3]);
    if (i < layers.length - 1) arrow(s, x + 2.68, 3.1, x + 2.96, 3.1, C.line, 1.7);
  });
  box(s, 0.62, 4.96, 12.02, 1.13, C.navy, { line: C.navy });
  addText(s, "Moat ที่แท้จริง", 0.92, 5.2, 1.8, 0.24, { fontSize: 14, color: C.cyan, bold: true });
  addText(s, "approved metadata + reusable templates + provenance + outcome feedback", 2.78, 5.17, 8.9, 0.3, { fontSize: 17, color: C.white, bold: true });
  addText(s, "เมื่อระบบนี้สะสมมากขึ้น การย้ายออกจะยากขึ้น เพราะ workflow และ knowledge ฝังอยู่ในองค์กร", 2.78, 5.58, 8.7, 0.22, { fontSize: 10.5, color: "B6C6D9" });
  footer(s);
}

// 09 — Pilot
{
  const s = pptx.addSlide("BASE");
  header(s, "Pilot and business case", "พิสูจน์ ROI ด้วย campaign เดียวที่มีปริมาณสูงและทำซ้ำทุกสัปดาห์", 9);
  box(s, 0.62, 1.72, 3.15, 4.6, C.navy, { line: C.navy });
  addText(s, "Pilot hypothesis", 0.9, 2.05, 2.3, 0.28, { fontSize: 15, color: C.cyan, bold: true });
  addText(s, "โปรโมชันหนังสือ\n100–500 SKU / สัปดาห์", 0.9, 2.65, 2.35, 0.8, { fontSize: 23, color: C.white, bold: true, valign: "top" });
  addText(s, "ทีมเล็ก: Designer 2 · Marketing 1\nMerchandising 1 · Product/Eng 1", 0.9, 4.15, 2.35, 0.55, { fontSize: 12, color: "C4D4E7", valign: "top" });
  pill(s, "6–10 WEEKS", 0.9, 5.52, 1.12, C.blue, C.white);
  addText(s, "5 นาที = สมมติฐานสำหรับ pilot\nไม่ใช่คำสัญญาทางการตลาด", 2.16, 5.48, 1.32, 0.46, { fontSize: 8.8, color: "B6C6D9", valign: "top" });
  const kpis = [
    ["Lead time", "request → approved"],
    ["Touch time", "ชั่วโมงต่อ SKU"],
    ["Revisions", "รอบแก้ต่อ campaign"],
    ["Mismatch", "ข้อมูลผิด / ตกหล่น"],
    ["Manual steps", "export / rename / upload"],
    ["Reuse", "output จาก template"],
  ];
  kpis.forEach((it, i) => {
    const x = 4.18 + (i % 3) * 2.78;
    const y = 1.82 + Math.floor(i / 3) * 1.58;
    box(s, x, y, 2.45, 1.12, C.white, { line: C.line });
    addText(s, it[0], x + 0.18, y + 0.2, 2.0, 0.25, { fontSize: 13, color: C.navy, bold: true });
    addText(s, it[1], x + 0.18, y + 0.59, 2.0, 0.24, { fontSize: 9.5, color: C.muted, valign: "top" });
  });
  box(s, 4.18, 5.08, 8.13, 0.9, C.paleYellow, { line: C.paleYellow });
  addText(s, "Business case", 4.45, 5.28, 1.35, 0.22, { fontSize: 12, color: "8A5A00", bold: true });
  addText(s, "(ชั่วโมงก่อน − ชั่วโมงหลัง) × loaded hourly cost + outsource/rework ที่เลี่ยงได้ − cloud/AI/support cost", 5.92, 5.25, 6.0, 0.34, { fontSize: 11, color: C.navy, bold: true });
  addText(s, "หลักการ: วัด baseline 2–4 สัปดาห์ก่อน แล้วเทียบกับ campaign ที่รูปแบบใกล้กัน", 4.18, 6.2, 8.1, 0.22, { fontSize: 10.5, color: C.muted });
  footer(s);
}

// 10 — Workflow
{
  const s = pptx.addSlide("BASE");
  header(s, "Target workflow", "ข้อมูลหนังสือหนึ่งชุด ไหลไปเป็น creative pack ที่อนุมัติแล้ว", 10);
  const stages = [
    ["Source", "ERP / PIM / Excel\ncover + rights", C.paleBlue, C.blue],
    ["Validate", "map field\nเช็ค ISBN / ราคา / วันที่", C.palePurple, C.purple],
    ["Compose", "smart template\nbrand + data binding", C.paleYellow, "C08A00"],
    ["Render", "SKU × channel × size\nprogress + retry", C.paleCyan, C.green],
    ["QA", "overflow · resolution\nbrand / data mismatch", C.paleCoral, C.coral],
    ["Approve", "human review\nversion + provenance", C.paleBlue, C.blue],
  ];
  stages.forEach((st, i) => {
    const x = 0.62 + i * 2.08;
    addStage(s, x, 2.1, 1.72, st[0], st[1], st[2], st[3]);
    if (i < stages.length - 1) arrow(s, x + 1.75, 2.61, x + 2.0, 2.61, C.line, 1.4);
  });
  addText(s, "outputs", 0.62, 3.72, 0.86, 0.2, { fontSize: 10, color: C.muted, bold: true });
  ["e-commerce", "social", "in-store / print", "catalog / media pack"].forEach((label, i) => {
    pill(s, label, 1.62 + i * 2.45, 3.66, [1.38, 1.0, 1.42, 1.48][i], i % 2 ? C.paleCyan : C.paleBlue, i % 2 ? C.green : C.blue);
  });
  box(s, 0.62, 4.65, 5.85, 1.35, C.navy, { line: C.navy });
  addText(s, "Source of truth", 0.9, 4.93, 1.6, 0.25, { fontSize: 14, color: C.cyan, bold: true });
  addText(s, "ISBN · title · author · price · promo dates\nlegal copy · rights · approved asset", 0.9, 5.34, 4.9, 0.42, { fontSize: 12, color: C.white, bold: true, valign: "top" });
  box(s, 6.82, 4.65, 5.82, 1.35, C.paleCoral, { line: C.paleCoral });
  addText(s, "AI ใช้ตรงไหน", 7.1, 4.93, 1.5, 0.25, { fontSize: 14, color: C.coral, bold: true });
  addText(s, "draft copy · crop / focal point · background removal\nlayout suggestion · error explanation — ทุก output มีคนตรวจรับ", 7.1, 5.34, 4.95, 0.42, { fontSize: 11, color: C.navy, bold: true, valign: "top" });
  footer(s);
}

// 11 — AI chat
{
  const s = pptx.addSlide("BASE");
  header(s, "Appendix · AI Chat", "AI Chat ไม่ได้ “ตอบอย่างเดียว” — มันเลือกวิธีทำงานตาม intent และความเสี่ยง", 11);
  box(s, 0.62, 1.85, 2.05, 1.08, C.navy, { line: C.navy });
  addText(s, "User prompt", 0.88, 2.06, 1.48, 0.24, { fontSize: 14, color: C.cyan, bold: true });
  addText(s, "ข้อความ + selected context\n+ canvas / image refs", 0.88, 2.38, 1.48, 0.3, { fontSize: 9.5, color: C.white, valign: "top" });
  arrow(s, 2.82, 2.39, 3.42, 2.39, C.blue, 2);
  box(s, 3.55, 1.85, 2.25, 1.08, C.paleBlue, { line: C.paleBlue });
  addText(s, "Intent + context", 3.83, 2.04, 1.7, 0.25, { fontSize: 14, color: C.navy, bold: true });
  addText(s, "classify simple / complex\nตรวจว่าต้องใช้ vision ไหม", 3.83, 2.37, 1.68, 0.32, { fontSize: 9.5, color: C.muted, valign: "top" });
  arrow(s, 5.94, 2.39, 6.52, 2.39, C.blue, 2);
  addText(s, "route", 6.24, 2.02, 0.52, 0.2, { fontSize: 9, color: C.blue, bold: true, align: "center" });
  const routes = [
    ["Local plan", "canvas inventory\nsimple edit", C.paleCyan, C.green, "ไม่ออกจากเครื่อง"],
    ["Built-in tool", "insert / update\nbackground / delete", C.paleYellow, "C08A00", "atomic + undo"],
    ["Design Agent", "complex design\nหลาย step / reference", C.palePurple, C.purple, "consent + review"],
  ];
  routes.forEach((r, i) => {
    const x = 6.72 + i * 1.98;
    box(s, x, 1.7, 1.74, 1.45, r[2], { line: r[2] });
    addText(s, r[0], x + 0.14, 1.92, 1.45, 0.25, { fontSize: 12, color: C.navy, bold: true, align: "center" });
    addText(s, r[1], x + 0.14, 2.27, 1.45, 0.42, { fontSize: 9.5, color: C.muted, align: "center", valign: "top" });
    pill(s, r[4], x + 0.18, 2.82, 1.38, C.white, r[3]);
  });
  line(s, 0.9, 4.14, 11.35, C.line, 1);
  addText(s, "กติกาความปลอดภัยของ flow", 0.62, 4.48, 2.6, 0.28, { fontSize: 15, color: C.navy, bold: true });
  const rules = [
    ["Remote output = untrusted", "parse + validate ก่อนเข้า editor"],
    ["Proposal = reviewable", "ผู้ใช้เห็น plan / commands ก่อน Apply"],
    ["Apply = atomic", "commit ผ่าน engine store และอยู่ใน undo timeline"],
  ];
  rules.forEach((r, i) => {
    const x = 0.62 + i * 4.07;
    box(s, x, 5.0, 3.68, 0.95, C.white, { line: C.line });
    addText(s, r[0], x + 0.2, 5.22, 3.18, 0.23, { fontSize: 12, color: C.navy, bold: true });
    addText(s, r[1], x + 0.2, 5.58, 3.18, 0.22, { fontSize: 9.5, color: C.muted });
  });
  footer(s);
}

// 12 — Local model loading
{
  const s = pptx.addSlide("BASE");
  header(s, "Appendix · Local Model", "โหลด Local Model แบบ on-demand: เก็บ privacy และรักษาความลื่นของ editor", 12);
  const flow = [
    ["Feature\nrequested", C.navy, C.white],
    ["Model Registry\nlazy state", C.paleBlue, C.navy],
    ["Browser cache\nIndexedDB", C.palePurple, C.navy],
    ["Worker /\nOffscreenCanvas", C.paleCyan, C.navy],
    ["Inference\nprogress + cancel", C.paleYellow, C.navy],
    ["Preview →\ntransaction", C.paleCoral, C.navy],
  ];
  flow.forEach((item, i) => {
    const x = 0.62 + i * 2.06;
    box(s, x, 1.9, 1.7, 1.22, item[1], { line: item[1] });
    addText(s, item[0], x + 0.14, 2.22, 1.42, 0.48, { fontSize: 12, color: item[2], bold: true, align: "center", valign: "top" });
    if (i < flow.length - 1) arrow(s, x + 1.72, 2.51, x + 1.98, 2.51, C.line, 1.4);
  });
  addText(s, "สถานะที่ผู้ใช้มองเห็นได้", 0.62, 3.65, 2.4, 0.25, { fontSize: 14, color: C.navy, bold: true });
  ["Lazy", "Loading", "Loaded", "Cached", "Failed"].forEach((label, i) => {
    pill(s, label, 3.03 + i * 1.25, 3.62, 0.94, [C.paleBlue, C.paleYellow, C.paleCyan, C.palePurple, C.paleCoral][i], [C.blue, "C08A00", C.green, C.purple, C.coral][i]);
  });
  const models = [
    ["Florence-2", "caption · OCR · grounding", "vision", C.blue],
    ["RMBG-1.4", "remove background · extract", "image", C.green],
    ["VTracer WASM", "raster → editable vector", "algorithm", C.purple],
    ["Raster Worker", "mask · filter · thumbnail", "pixel", C.coral],
  ];
  models.forEach((m, i) => {
    const x = 0.62 + (i % 2) * 6.08;
    const y = 4.45 + Math.floor(i / 2) * 0.92;
    box(s, x, y, 5.72, 0.66, C.white, { line: C.line });
    dot(s, x + 0.2, y + 0.23, 0.15, m[3]);
    addText(s, m[0], x + 0.5, y + 0.13, 1.6, 0.2, { fontSize: 12, color: C.navy, bold: true });
    addText(s, m[1], x + 2.02, y + 0.13, 2.9, 0.2, { fontSize: 10, color: C.muted });
    pill(s, m[2], x + 4.88, y + 0.17, 0.62, C.bg, m[3]);
  });
  box(s, 9.42, 5.65, 3.2, 0.88, C.navy, { line: C.navy });
  addText(s, "Local path", 9.7, 5.84, 1.0, 0.2, { fontSize: 11, color: C.cyan, bold: true });
  addText(s, "ภาพไม่ถูก upload\nจนกว่าผู้ใช้จะเลือก cloud", 10.8, 5.78, 1.55, 0.35, { fontSize: 9.5, color: C.white, bold: true, valign: "top" });
  footer(s);
}

// 13 — Cloud boundary
{
  const s = pptx.addSlide("BASE");
  header(s, "Appendix · Cloud boundary", "เมื่อจำเป็นต้องใช้ Cloud AI: consent, alias, adapter และ quality gate ต้องอยู่ในเส้นทางเดียวกัน", 13);
  const phases = [
    ["1", "Explicit consent", "ผู้ใช้กดอนุญาต\nไม่ silent upload", C.paleYellow, "C08A00"],
    ["2", "Task alias", "UI เลือก capability\nไม่ผูกกับ provider", C.paleBlue, C.blue],
    ["3", "Provider adapter", "BYOK / server route\nsecret อยู่ฝั่ง server", C.palePurple, C.purple],
    ["4", "Validate + gate", "ตรวจ output / cost\nก่อนส่งกลับ editor", C.paleCoral, C.coral],
    ["5", "Review + apply", "remote plan เป็น proposal\nผู้ใช้ Apply เอง", C.paleCyan, C.green],
  ];
  phases.forEach((p, i) => {
    const x = 0.62 + i * 2.48;
    box(s, x, 1.82, 2.12, 2.04, p[3], { line: p[3] });
    dot(s, x + 0.2, 2.1, 0.34, p[4]);
    addText(s, p[0], x + 0.2, 2.19, 0.34, 0.12, { fontFace: "Aptos", fontSize: 10, color: C.white, bold: true, align: "center" });
    addText(s, p[1], x + 0.68, 2.08, 1.2, 0.27, { fontSize: 13, color: C.navy, bold: true });
    addText(s, p[2], x + 0.2, 2.72, 1.7, 0.45, { fontSize: 10, color: C.muted, valign: "top" });
    if (i < phases.length - 1) arrow(s, x + 2.16, 2.84, x + 2.42, 2.84, C.line, 1.4);
  });
  const checks = [
    "Fallback ปิดเป็นค่าเริ่มต้น — กันการจ่ายเงินซ้ำโดยไม่ตั้งใจ",
    "ภาพ / prompt ไม่ถูกเขียนลง log; cache ใช้ digest ไม่เก็บ raw payload",
    "server ไม่รับ arbitrary model/provider จาก UI; ใช้ stable alias",
    "current branch: image route baseline เปลี่ยนเป็น GPT Image 2.5 Sunburst ได้โดยไม่เปลี่ยน UI contract",
  ];
  addText(s, "Guardrails ที่มีอยู่", 0.62, 4.48, 2.6, 0.26, { fontSize: 15, color: C.navy, bold: true });
  checks.forEach((t, i) => {
    dot(s, 0.72, 4.98 + i * 0.38, 0.12, C.green);
    addText(s, t, 0.98, 4.91 + i * 0.38, 11.3, 0.24, { fontSize: 10.5, color: C.ink, valign: "top" });
  });
  footer(s);
}

// 14 — Architecture
{
  const s = pptx.addSlide("BASE");
  header(s, "Appendix · Architecture", "โครงสร้างถูกแยกเป็น seam ที่ทำให้เพิ่ม provider หรือ desktop runtime ได้โดยไม่รื้อ editor", 14);
  const boxes = [
    ["UI surfaces", "CoPilot · Canvas · Model Manager", 0.62, 1.8, 2.4, C.paleBlue, C.blue],
    ["Domain seams", "Engine Store · Orchestrator\nRasterProcessor · Brand Rules", 3.4, 1.8, 3.0, C.palePurple, C.purple],
    ["Platform adapters", "IndexedDB · Worker · WASM\noptional API / desktop ports", 6.82, 1.8, 2.8, C.paleCyan, C.green],
    ["External providers", "Replicate · Google · OpenAI\nBYOK adapters", 10.04, 1.8, 2.6, C.paleCoral, C.coral],
  ];
  boxes.forEach((b, i) => {
    box(s, b[2], b[3], b[4], 1.34, b[5], { line: b[5] });
    addText(s, b[0], b[2] + 0.2, b[3] + 0.2, b[4] - 0.4, 0.23, { fontSize: 14, color: C.navy, bold: true, align: "center" });
    addText(s, b[1], b[2] + 0.2, b[3] + 0.58, b[4] - 0.4, 0.43, { fontSize: 9.5, color: C.muted, align: "center", valign: "top" });
    if (i < boxes.length - 1) arrow(s, b[2] + b[4] + 0.08, 2.45, boxes[i + 1][2] - 0.1, 2.45, C.line, 1.6);
  });
  addText(s, "cross-cutting controls", 0.62, 3.62, 2.3, 0.22, { fontSize: 10, color: C.muted, bold: true });
  ["consent", "budget / usage", "cache", "quality gate", "telemetry", "audit (future)"].forEach((t, i) => {
    pill(s, t, 2.88 + i * 1.57, 3.58, [0.85, 1.25, 0.75, 1.18, 0.92, 1.1][i], i === 5 ? C.paleCoral : C.bg, i === 5 ? C.coral : C.blue);
  });
  box(s, 0.62, 4.45, 12.02, 1.4, C.navy, { line: C.navy });
  addText(s, "Boundary that matters", 0.94, 4.76, 2.2, 0.25, { fontSize: 14, color: C.cyan, bold: true });
  addText(s, "lib/engine/store.ts = transaction boundary", 3.28, 4.7, 4.0, 0.3, { fontFace: MONO, fontSize: 14, color: C.white, bold: true });
  addText(s, "UI ขอ operation → domain validates → one atomic mutation → renderer/exporters consume canonical state", 3.28, 5.15, 8.5, 0.35, { fontSize: 11, color: "C4D4E7", valign: "top" });
  addText(s, "provider-native fields หยุดอยู่ใน adapter; product contract จึงไม่ผูกกับ vendor รายเดียว", 0.94, 5.72, 10.4, 0.22, { fontSize: 10.5, color: C.cyan, bold: true });
  footer(s);
}

// 15 — Next 90 days
{
  const s = pptx.addSlide("BASE");
  header(s, "Recommendation", "90 วันถัดไป: เปลี่ยน engine ที่ดี ให้กลายเป็น workflow ที่พิสูจน์ ROI ได้", 15);
  const work = [
    ["01", "Pilot hardening", "เก็บ lint / visual QA / persistence edge cases\nทำให้ release ที่ให้ทีมใช้มีความน่าเชื่อถือ", C.paleCoral, C.coral],
    ["02", "Campaign foundation", "canonical book schema · data binding\nconditional rules · edge-case preview", C.paleBlue, C.blue],
    ["03", "Enterprise loop", "org / workspace · storage · versioning\napproval · audit · role", C.palePurple, C.purple],
    ["04", "Measurement", "baseline → after · lead time · mismatch\nrework · outsource · repeat campaign", C.paleCyan, C.green],
  ];
  work.forEach((it, i) => {
    const x = 0.62 + (i % 2) * 6.08;
    const y = 1.76 + Math.floor(i / 2) * 1.74;
    box(s, x, y, 5.7, 1.38, it[3], { line: it[3] });
    pill(s, it[0], x + 0.24, y + 0.24, 0.46, C.white, it[4]);
    addText(s, it[1], x + 0.92, y + 0.2, 3.8, 0.26, { fontSize: 15, color: C.navy, bold: true });
    addText(s, it[2], x + 0.92, y + 0.64, 4.25, 0.42, { fontSize: 10.5, color: C.muted, valign: "top" });
  });
  box(s, 0.62, 5.48, 12.02, 0.82, C.navy, { line: C.navy });
  addText(s, "Decision gate", 0.92, 5.72, 1.45, 0.22, { fontSize: 13, color: C.cyan, bold: true });
  addText(s, "อย่าเปิดตลาดกว้างก่อนเห็น baseline / after จาก campaign จริงหนึ่งชุด และยืนยันว่าข้อมูล–สิทธิ์–approval อยู่ในเส้นทางเดียวกัน", 2.55, 5.65, 9.6, 0.32, { fontSize: 12.5, color: C.white, bold: true });
  footer(s);
}

// 16 — Close
{
  const s = pptx.addSlide();
  s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: H, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(pptx.ShapeType.arc, { x: 8.9, y: -0.65, w: 4.5, h: 4.5, adjustPoint: 0.2, fill: { color: C.blue, transparency: 35 }, line: { color: C.blue, transparency: 100 } });
  s.addShape(pptx.ShapeType.arc, { x: 9.8, y: 4.8, w: 3.7, h: 3.7, adjustPoint: 0.2, fill: { color: C.cyan, transparency: 18 }, line: { color: C.cyan, transparency: 100 } });
  s.addImage({ path: iconPath, x: 0.74, y: 0.7, w: 0.62, h: 0.62 });
  addText(s, "THE OPPORTUNITY", 1.55, 0.82, 3.0, 0.22, { fontSize: 10, color: C.cyan, bold: true });
  addText(s, "Own the production workflow\nbefore owning the marketplace", 0.78, 2.0, 9.8, 1.08, { fontSize: 31, color: C.white, bold: true, valign: "top" });
  addText(s, "ArtShift มีแกนเทคโนโลยีที่พร้อมแล้ว\nสิ่งที่ต้องสร้างต่อคือระบบงานที่ทำให้ทุก campaign เร็วขึ้น ถูกต้องขึ้น และสะสมเป็น moat", 0.8, 3.75, 8.5, 0.72, { fontSize: 17, color: "DDEBFF", valign: "top" });
  box(s, 0.8, 5.3, 4.5, 0.72, C.blue, { line: C.blue });
  addText(s, "Next move: เลือก 1 campaign · 1 owner · 1 baseline", 1.04, 5.52, 4.0, 0.22, { fontSize: 13, color: C.white, bold: true, align: "center" });
  addText(s, "ARTSHIFT", 10.3, 6.55, 2.15, 0.26, { fontSize: 15, color: C.cyan, bold: true, align: "right" });
  addText(s, "Creative Operations for Book Commerce", 7.7, 6.93, 4.75, 0.2, { fontSize: 9.5, color: "B6C6D9", align: "right" });
}

await pptx.writeFile({ fileName: "/opt/artshift/ArtShift_Executive_Product_Deck_TH.pptx" });

