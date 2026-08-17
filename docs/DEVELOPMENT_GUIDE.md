# ArtShift — แนวทางการพัฒนา

เอกสารนี้สรุปทิศทางการพัฒนา ArtShift จากเป้าหมายหลักของโปรเจกต์ คือการช่วยให้ทีมที่ได้รับ “ปกหนังสือ + ข้อความ” สามารถผลิต Artwork สำหรับโฆษณาได้เร็วขึ้น แก้ไขต่อได้ และส่งออกไปใช้งานได้หลายช่องทาง โดยค่อย ๆ ขยายความสามารถไปทดแทน workflow บางส่วนของ Adobe Photoshop และ Adobe Illustrator

วันที่จัดทำ: 15 สิงหาคม 2026

## 1. Product direction

ArtShift ไม่ควรเริ่มจากการเป็นโปรแกรมวาดภาพที่พยายามเลียนแบบ Adobe ทุกอย่าง แต่ควรเป็น **production tool สำหรับงานโปรโมตหนังสือและสื่อการตลาด** ที่มีความสามารถด้านการจัดองค์ประกอบแบบมืออาชีพอยู่ภายใน

เป้าหมายของ workflow:

```text
ปกหนังสือ + ข้อมูลหนังสือ
        ↓
เลือกขนาดและช่องทาง
        ↓
จัดวางด้วย Layer / Block / Freeform
        ↓
ตรวจข้อความล้นและความถูกต้อง
        ↓
สร้างหลายขนาดจาก Artwork เดียวกัน
        ↓
ส่งออกเป็นไฟล์พร้อมใช้งานและไฟล์ที่แก้ไขต่อได้
```

## 2. หลักการออกแบบผลิตภัณฑ์

1. **Workflow-first** — ลดจำนวนขั้นตอนที่ทีมต้องทำซ้ำ มากกว่าการเพิ่มเครื่องมือให้มากที่สุด
2. **Editable handoff** — ทุกสิ่งที่สร้างควรแก้ไขต่อได้ ไม่ใช่เพียงภาพที่ Flatten แล้ว
3. **Non-destructive** — การ crop, mask, adjustment, resize และ effect ควรย้อนกลับหรือปรับใหม่ได้
4. **Ratio-aware** — Artwork แต่ละสัดส่วนต้องรักษาเจตนาของงาน ไม่ใช่เพียงย่อหรือขยายทั้งภาพ
5. **Layer-owned layout** — Grid, Free, Hex และ Strictness เป็นคุณสมบัติของ Layer ไม่ใช่ของ Object เดี่ยว
6. **Typography safety** — ต้องป้องกัน padding, clipping, Thai line wrapping และข้อความล้นตั้งแต่ระดับ engine
7. **Local-first** — งานสำคัญควรทำได้แม้ไม่มีอินเทอร์เน็ต และมีระบบกู้คืนข้อมูลเมื่อเกิดข้อผิดพลาด

## 3. สิ่งที่มีเป็นฐานแล้ว

พื้นฐานของ editor ที่ควรรักษาและต่อยอดต่อไป ได้แก่:

- Layer ที่รองรับ Grid, Free และ Block/Hex placement
- Block หลาย Object ต่อ Layer พร้อมการ highlight พื้นที่ที่เลือก
- Workspace Strictness สำหรับควบคุมการ overlap
- Text layout ที่มี safe padding และปรับความสูงอัตโนมัติ
- Image object ที่รักษาสัดส่วนและ fit ตามขนาดจริง
- Non-destructive mask, crop, opacity, blur, blend และ adjustment
- Vector path, node editing, gradient และ clipping frame
- Artwork variants สำหรับหลายขนาดและหลายช่องทาง
- Template ที่เพิ่มเป็น Layer ได้โดยไม่ทำลายงานเดิม
- Export เป็น SVG ที่ยังแก้ไขต่อได้ และ export เป็น PPTX
- IndexedDB persistence, backup, migration และ recovery

## 4. Roadmap ที่แนะนำ

### Phase 1 — Campaign Production v1

ลำดับแรกควรทำให้ ArtShift เป็นเครื่องมือผลิต Ads หนังสือแบบ batch ให้สมบูรณ์ เพราะเป็นจุดที่สร้าง impact และลดค่าใช้จ่ายได้เร็วที่สุด

- Campaign workspace สำหรับเก็บข้อมูลหนังสือและ Artwork หลายชิ้น
- Import จาก CSV, XLSX และ Google Sheets
- Mapping column เช่น ชื่อหนังสือ, ผู้เขียน, ราคา, โปรโมชัน, CTA และ URL
- สร้างหลาย Artwork จากข้อมูลหลายแถวในครั้งเดียว
- รายการตรวจสอบข้อความล้น, รูปหาย, ขนาดผิด และ element ชนกัน
- สร้างชื่อไฟล์และโฟลเดอร์ตาม SKU หรือ ISBN
- Export เป็น ZIP พร้อม manifest และ preview contact sheet
- Preset ขนาดสำหรับ Facebook, Instagram, TikTok, LINE, Marketplace และงานพิมพ์

ผลลัพธ์ที่ต้องการ: ผู้ใช้ใส่ข้อมูลหนังสือครั้งเดียว แล้วสร้าง Ads หลายรายการและหลายขนาดได้โดยไม่ต้องจัดใหม่ทั้งหมด

### Phase 2 — ความสามารถแบบ Photoshop สำหรับงาน Ads

เน้นเครื่องมือที่จำเป็นต่อการผลิตจริง ไม่จำเป็นต้องทำ Photoshop ให้ครบทุกฟังก์ชัน

- Selection, brush และ eraser แบบพื้นฐาน
- Layer mask ที่แก้ไขได้และ invert ได้
- Adjustment layer เช่น brightness, contrast, saturation, hue และ curves เบื้องต้น
- Background removal และ subject isolation
- Smart image fitting, focal point และ content-aware crop ระดับ workflow
- Shadow, glow, outline, inner shadow และ blend effects
- Alignment, distribute, guides, snapping และ keyboard shortcuts
- Color picker, eyedropper, swatches และ color history
- Export สำหรับ web พร้อมการควบคุมคุณภาพและขนาดไฟล์
- Preflight สำหรับ resolution, transparency, bleed และ safe area

### Phase 3 — ความสามารถแบบ Illustrator สำหรับงาน Vector

เน้นการสร้างและแก้ไข graphic assets, icon, badge, label และองค์ประกอบแบรนด์

- Bézier pen พร้อม handles ที่ควบคุมได้ละเอียด
- Node operations: add, delete, join, split, smooth และ corner
- Boolean operations: union, subtract, intersect และ exclude
- Compound path และ clipping path
- Stroke width, cap, join, dash และ arrowhead
- Gradient, pattern และ opacity mask
- Text on path และการแปลงข้อความเป็น outline
- Shape builder และการแก้ไขรูปทรงแบบ non-destructive
- SVG import/export ที่รักษาโครงสร้างและแก้ไขต่อได้
- Symbol หรือ reusable component สำหรับองค์ประกอบที่ใช้ซ้ำ

### Phase 4 — Brand system และองค์กร

ฟีเจอร์กลุ่มนี้ควรทำหลัง workflow หลักนิ่งแล้ว

- Brand Kit: logo, color, font, spacing และ safe area
- Brand rules ที่ล็อกตำแหน่งหรือขนาดขององค์ประกอบได้
- Shared template และ component library
- สิทธิ์ผู้ใช้, approval flow และ version history
- Audit log สำหรับงานที่ใช้ในองค์กร
- Cloud sync และ collaboration แบบเลือกเปิดใช้
- API หรือ webhook สำหรับเชื่อม catalog และระบบหลังบ้าน

## 5. UX ที่ควรยึดเป็นแกน

หน้าหลักควรแบ่งเป็น 4 บริเวณ:

- **Canvas** — พื้นที่ทำงานและ preview จริง
- **Toolbar** — Action ที่ใช้บ่อย เช่น select, text, image, shape, pen, frame, resize และ export
- **Layers** — จัดลำดับ, ซ่อน/แสดง, lock และเลือก placement mode ของ Layer
- **Properties** — แสดงเฉพาะ option ของสิ่งที่เลือก และแบ่งเป็น section ขนาดเล็กที่อ่านง่าย

การเพิ่ม Element ควรเป็นแบบ drag-and-drop แต่ต้องมี click-to-add สำหรับผู้ใช้ที่ต้องการความเร็ว ส่วน Block ควรแสดงเป็นพื้นที่จาง ๆ ที่ไม่รบกวนงาน และใช้สีเข้มขึ้นเฉพาะตอนเลือกหรือกำลังวาง Object

## 6. โครงสร้างระบบที่ควรรักษา

- `lib/engine/store.ts` เป็น transaction boundary หลักของการแก้ไข state
- Layer เป็นเจ้าของ placement mode, layout และ strictness
- Text measurement และ auto-grow ต้องใช้ logic กลางร่วมกันทั้ง editor และ export
- Resize ต้องทำผ่าน artwork variant และคำนวณตำแหน่งใหม่ตาม ratio
- Renderer ต้องรับ state เดียวกับ editor เพื่อให้ preview และไฟล์ส่งออกตรงกัน
- Exporter ควรแยกจาก UI และทดสอบด้วย fixture หลายสัดส่วน
- Persistence ต้องมี schema version, migration และ recovery path

## 7. สิ่งที่ยังไม่ควรรีบทำ

- การรองรับ PSD/AI แบบเทียบเท่า Adobe ทั้งหมด
- Real-time collaboration ก่อนที่ single-user workflow จะเสถียร
- ระบบ cloud ที่ซับซ้อนก่อนพิสูจน์ว่าผู้ใช้ยอมรับ workflow
- CMYK และ prepress เต็มรูปแบบก่อนมี use case งานพิมพ์ที่ชัดเจน
- AI generation ที่กลบจุดแข็งของโปรเจกต์ คือการจัดวางและการผลิตซ้ำที่ควบคุมได้

## 8. Definition of done ของแต่ละฟีเจอร์

ฟีเจอร์ใหม่ควรผ่านเกณฑ์เหล่านี้ก่อนถือว่าเสร็จ:

- ใช้งานได้กับทั้ง Free Layer และ Block Layer ถ้าไม่ขัดกับธรรมชาติของฟีเจอร์
- รองรับ Artwork ที่มีสัดส่วนแตกต่างกัน
- ไม่ทำลายข้อมูลเดิมเมื่อ reload หรือเกิด error ระหว่างแก้ไข
- มี keyboard/mouse interaction ที่คาดเดาได้
- มีข้อความหรือ visual feedback เมื่อ operation ทำไม่ได้
- Export แล้วได้ผลลัพธ์ตรงกับ preview
- มี unit/integration test สำหรับ logic สำคัญ
- ผ่าน lint, typecheck, test และ build

## 9. ลำดับการลงมือที่แนะนำ

1. ทำ Campaign Production v1 และ import catalog ให้ใช้งานได้จริง
2. เพิ่ม preflight และ batch export เพื่อวัดเวลาที่ลดได้
3. ทำ mask, selection และ adjustment ให้ครบ workflow ภาพโฆษณา
4. ทำ vector editing สำหรับ badge, label และ graphic asset ที่ใช้บ่อย
5. ทำ Brand Kit และระบบ template ระดับองค์กร
6. ค่อยพิจารณา cloud, collaboration และ AI ที่ช่วยลดงานซ้ำ

เกณฑ์วัดความสำเร็จหลักควรเป็น “เวลาจากข้อมูลหนังสือถึงไฟล์ Ads ที่พร้อมใช้” และ “จำนวนงานที่สร้างได้ต่อหนึ่งชุดข้อมูล” ไม่ใช่จำนวนเครื่องมือที่มีใน UI

ดูรายละเอียดสถานะงานและรายการที่ทำไปแล้วเพิ่มเติมได้ที่ [ROADMAP.md](../ROADMAP.md)
