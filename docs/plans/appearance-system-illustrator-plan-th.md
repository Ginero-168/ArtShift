# แผนระบบ Appearance สำหรับ ArtShift

สถานะ: **Phase 1 foundation shipped** (`lib/appearance/*`). แผ่นนี้ล็อก **Appearance panel UI slice** (2026-09-19) — ยังไม่ persist canonical stack

วันที่จัดทำ: 15 กันยายน 2026  
อัปเดต: 19 กันยายน 2026

## 0. สถานะจริงและขอบเขตที่ล็อก (Peerawat 2026-09-19)

อย่าอ่านแผ่นนี้ราวกับว่ายังไม่ได้เริ่มทำ — **Phase 1 foundation มีอยู่แล้ว**

| ชั้น | สถานะ |
|---|---|
| `lib/appearance/*` (`readAppearance` / `changeAppearance` / capabilities / bounds / fingerprints) | มีแล้ว — อ่าน/เขียนผ่าน legacy flat fields |
| Engine schema | **v6 = Block bake → Free pixels** ไม่ใช่ Appearance persist |
| Canonical `appearance` field บน `EngineElement` | **ยังไม่มี** ถ้าเพิ่มต้องเป็น **schema v7** |
| Live Inspector Appearance stack UI | แผ่นงานนี้ (Fill / Stroke / Shadow / Glow / Text Arc) |
| Graphic Styles ที่ผูก Brand Kit | **นอกขอบเขต** |
| Path envelope warp | **นอกขอบเขต** — Arc = text only ผ่าน `pathCurvature` |
| Group Appearance / multi fill-stroke เป็น product feature / Affinity PDF | **นอกขอบเขต** |

### MVP slice ที่ล็อกแล้ว

เริ่มที่ **Appearance panel + Shadow/Glow + Text Arc**

ผู้ใช้ต้องสามารถ:

1. เลือกวัตถุแล้วแก้ Shadow และ/หรือ Glow จาก live Builder Inspector
2. แก้ Text Arc (`pathCurvature`) จาก live Inspector สำหรับ text
3. เห็น Appearance เป็น stack/list (fill, stroke, shadow, glow, text arc เมื่อเกี่ยวข้อง)
4. แก้ผ่าน `readAppearance` / `changeAppearance` / `updateAppearance` ไม่สร้างโมเดลขนาน

Renderer: Canvas2D มี shadow state เดียวต่อ `drawImage` — ถ้ามีทั้ง Shadow และ Glow จะวาด **ตามลำดับ stack (back-to-front)** ไม่ XOR ทิ้งอย่างเงียบ ๆ

### สิ่งที่แผ่นยาวด้านล่างยังเป็นแผนเต็ม (อย่าทำใน PR นี้)

Multi fill/stroke เป็น product feature, Graphic Styles / Brand Kit, path warp, Group Appearance, Vector/Affinity PDF rewrite, Moodboard, persist canonical `appearance` (v7)

---

## 1. บทสรุปสำหรับตัดสินใจ

ระบบ Appearance แบบ Adobe Illustrator สามารถทำได้ใน ArtShift แต่ไม่ควรมองว่าเป็นเพียงการเพิ่มชุดปุ่ม Fill และ Stroke ใน Property Panel เพราะความสามารถหลักของ Illustrator คือการมี Appearance stack ที่ประกอบด้วยหลาย Fill, หลาย Stroke และ Effect หลายรายการตามลำดับที่ผู้ใช้กำหนด

ข้อเสนอแนะคือใช้แนวทางผสม:

1. ออกแบบ data model ให้เป็น Appearance Stack ตั้งแต่ต้น
2. เปิดใช้งานเฉพาะ Fill, Stroke, Shadow, Glow, Opacity และ Blend Mode ในระยะแรก
3. สร้าง Appearance module เป็น seam กลางระหว่าง Property Panel, Engine Store, Canvas renderer และ Exporter
4. ยังไม่ทำ Effect Graph, Group Appearance และ Mask ขั้นสูงจนกว่า object-level stack จะเสถียร
5. แยก Appearance ของวัตถุออกจาก pixel content ของ Raster Studio อย่างชัดเจน

แนวทางนี้ให้ความรู้สึกแบบ Illustrator ได้จริง โดยไม่บังคับให้รื้อ Geometry, Selection, Layer และ Raster Studio พร้อมกันทั้งหมด

## 2. คำตอบเรื่องความยาก

### ระดับความยากโดยประมาณ

| ขอบเขต | ความยาก | ผลลัพธ์ |
|---|---:|---|
| จัดกลุ่ม controls เดิมเป็น Appearance section | ต่ำ | UI ดูเป็นระบบขึ้น แต่ยังไม่ใช่ Illustrator Appearance |
| รองรับ Fill/Stroke/Effect หลายรายการต่อวัตถุ | กลางถึงสูง | ได้แกนหลักของ Illustrator Appearance |
| รองรับ Group Appearance, Mask, Effect scope และ Isolation | สูง | ใกล้เคียง Illustrator มากขึ้น |
| รองรับ Canvas, SVG, PPTX และ Raster ให้เหมือนกันทั้งหมด | สูงมาก | ต้องมี capability และ fallback ต่อ backend |
| รองรับ Effect Graph แบบ node-based | สูงมาก | ยืดหยุ่นสูง แต่ซับซ้อนเกินความจำเป็นในระยะนี้ |

MVP ที่ใช้ใน Editor ไม่ได้ยากจนเกินไป แต่ Full parity กับ Illustrator เป็นโครงการสถาปัตยกรรมหลายเฟส ไม่ควรทำเป็น UI-only patch

## 3. สภาพระบบปัจจุบัน

### 3.1 โมเดลวัตถุ

`EngineElement` ใน [lib/engine/types.ts](/opt/artshift/lib/engine/types.ts:95) มี style fields อยู่แล้ว เช่น:

- `backgroundColor`
- `strokeColor`
- `strokeWidth`
- `strokeStyle`
- `fillStyle`
- `fillType`
- `gradientColors`
- `gradientAngle`
- `gradientStops`
- `fillPattern`
- `shadow`
- `glow`
- `opacity`
- `blendMode`

สำหรับ Image ยังมี field เฉพาะทาง เช่น `adjustments`, `filterBlur`, `mask`, `rasterMask` และ `rasterEdits`

ข้อดีคือมีข้อมูลตั้งต้นพร้อมใช้งาน ข้อจำกัดคือทั้งหมดเป็น flat fields และมี precedence บางจุดที่กระจายอยู่ใน renderer กับ UI

### 3.2 Renderer

เส้นทางหลักปัจจุบันคือ:

```text
renderSlide
  → renderElement
    → renderElementContent
      → geometry/type-specific draw helper
```

ดูได้จาก [lib/renderer/canvas.ts](/opt/artshift/lib/renderer/canvas.ts:116)

ปัจจุบัน renderer:

- สร้าง offscreen canvas ต่อวัตถุเพื่อ cache ผลลัพธ์
- ใช้ rough.js สำหรับ shape บางประเภท
- รองรับ gradient และ pattern บางส่วน
- ใช้ shadow หรือ glow พร้อมกันได้ โดย composite ตามลำดับ Appearance stack (legacy เคย XOR)
- ใช้ opacity และ blend mode ในระดับวัตถุ

ระบบ cache ปัจจุบันใช้ `type:id:version` ใน [lib/renderer/cache.ts](/opt/artshift/lib/renderer/cache.ts:18) ซึ่งสามารถต่อยอดเป็น appearance fingerprint ได้

### 3.3 Store และ Undo/Redo

การแก้ไขวัตถุใช้ `updateElements` และ history snapshot ใน [lib/engine/store.ts](/opt/artshift/lib/engine/store.ts:1007) และ [lib/engine/history.ts](/opt/artshift/lib/engine/history.ts:1)

ระบบมีแนวคิด `checkpointInteraction`, `previewElements` และ `commitInteraction` อยู่แล้ว จึงเหมาะกับ slider หรือ drag reorder ที่ควรสร้าง history เพียงหนึ่งรายการต่อ user action

### 3.4 Property Panel

Editor ปัจจุบันใช้ [components/Builder/BuilderInspector.tsx](/opt/artshift/components/Builder/BuilderInspector.tsx:79) เป็นหลัก และมี controls สำหรับ Fill, Stroke, Opacity และ style แบบรายการเดียวต่อประเภท

ปัญหาปัจจุบันคือ UI รู้จัก field ภายในโดยตรง เช่น `backgroundColor`, `fillType` และ `strokeColor` ทำให้ถ้าเพิ่ม feature ใหม่ logic จะกระจายไปหลายจุด

### 3.5 Persistence และ Export

เอกสารใช้ schema ปัจจุบัน `ENGINE_SCHEMA_VERSION = 6` (Block bake) และ serializer ใน [lib/engine/serialize.ts](/opt/artshift/lib/engine/serialize.ts:46) เก็บ document JSON แยกจาก image assets ใน IndexedDB

**อย่า bump เป็น v6 เพื่อ Appearance** — v6 ถูกใช้ไปแล้ว ถ้า persist canonical `appearance` ให้ใช้ **v7**

SVG มี serializer แยกใน [lib/engine/exportSVG.ts](/opt/artshift/lib/engine/exportSVG.ts:17) และ PPTX มี validation/export path ของตัวเอง ดังนั้น Appearance ต้องมี adapter หรือ capability policy ไม่ควรให้แต่ละ exporter อ่าน field ตรง ๆ ต่อไป

## 4. เป้าหมายของระบบ

### 4.1 เป้าหมายด้านผู้ใช้

ผู้ใช้ควรสามารถ:

- เลือกวัตถุหนึ่งชิ้นแล้วเห็น Appearance ของมัน
- เพิ่ม Fill ได้หลายรายการ
- เพิ่ม Stroke ได้หลายรายการ
- เพิ่ม Effect ได้หลายรายการ
- เปิด/ปิดแต่ละรายการ
- เปลี่ยนลำดับด้วย drag and drop
- แก้ไข opacity ของแต่ละรายการ
- แก้ไข opacity และ blend mode ระดับวัตถุ
- Duplicate หรือลบรายการ
- Undo/Redo การเปลี่ยน Appearance ได้เป็น action
- Reload Project แล้วได้ผลลัพธ์เดิม
- Export แล้วได้รับ warning หรือ raster fallback หาก backend รองรับ effect นั้นไม่ได้

### 4.2 เป้าหมายด้านสถาปัตยกรรม

- ให้ Appearance semantics อยู่ใน module เดียว
- ให้ Geometry, Layer, Selection และ Layout ไม่ต้องรู้รายละเอียด Appearance ทุกชนิด
- ให้ Canvas2D, SVG, PPTX และ Raster ใช้ semantic model ร่วมกัน
- ให้ appearance effect ไม่ถูก bake เข้า Raster source โดยไม่ตั้งใจ
- รักษา compatibility กับ Project เก่า
- เพิ่ม effect ใหม่ได้โดยไม่ต้องแก้ทุก caller

## 5. ทางเลือกสถาปัตยกรรม

### ทางเลือก A: Appearance Facade บน field เดิม

สร้าง module บาง ๆ เพื่อแปลง field เดิมเป็น semantic snapshot:

```ts
readAppearance(element)
capabilities(element)
toElementPatch(element, patch)
```

ยังคงใช้ field เดิมเป็น persisted source of truth และเพิ่ม `updateAppearance` เป็น adapter ที่แปลงกลับไปหา `updateElements`

เหมาะเมื่อ:

- ต้องการผลลัพธ์เร็ว
- ยังไม่ต้องการหลาย Fill/Stroke จริง
- ต้องการลดความเสี่ยงจาก schema migration

ข้อเสีย:

- ไม่ใช่ Appearance stack ที่แท้จริง
- gradient และ pattern ยังมี precedence แบบเดิม
- การเพิ่มหลาย Effect ในอนาคตจะต้อง migrate ใหม่

### ทางเลือก B: Canonical Appearance Stack ต่อวัตถุ

เพิ่ม `appearance` เป็น canonical model ในแต่ละ `EngineElement`:

```ts
type Appearance = {
  schemaVersion: 1;
  opacity: number;
  blendMode: BlendMode;
  items: AppearanceItem[];
};

type AppearanceItem =
  | FillAppearance
  | StrokeAppearance
  | EffectAppearance;
```

รายการใน `items` มีลำดับชัดเจน เช่น:

```text
Fill → Fill → Stroke → Shadow
```

ข้อดี:

- ตรงกับ mental model ของ Illustrator
- รองรับหลาย Fill/Stroke/Effect จริง
- เพิ่ม item type ในอนาคตได้
- ทำให้ renderer และ Property Panel ใช้ model เดียวกัน

ข้อเสีย:

- ต้องทำ migration จาก flat fields
- ต้องแก้ direct readers/writers หลายจุด
- ต้องวางแผน export fallback

### ทางเลือก C: Effect Graph

Appearance จะเป็น graph หรือ pipeline ที่ node ต่อกันได้ เช่น:

```text
Source → Fill → Stroke → Blur → Color Adjust → Shadow → Composite
```

ข้อดี:

- ยืดหยุ่นสูงสุด
- เหมาะกับ procedural effects และ advanced compositing

ข้อเสีย:

- UI ซับซ้อนมาก
- Undo, serialization, bounds และ export ยาก
- มีโอกาสทำให้ Editor แบกรับภาระเกินความจำเป็น

### ข้อสรุป

แนะนำใช้ทางเลือก B เป็น canonical model แต่ rollout แบบทางเลือก A ในช่วงแรก โดยจำกัด item type และยังคง legacy fields เป็น compatibility projection ชั่วคราว

## 6. โมเดลข้อมูลที่แนะนำ

### 6.1 Appearance ระดับวัตถุ

```ts
type Appearance = {
  schemaVersion: 1;
  opacity: number;       // 0..1, apply once at final composite
  blendMode: BlendMode;
  items: AppearanceItem[];
};
```

`roughness` ควรยังอยู่ใน object/geometry concern เพราะมีผลต่อการสร้างรูปทรงของ rough.js ไม่ใช่ paint item ธรรมดา

### 6.2 Fill

```ts
type FillAppearance = {
  id: string;
  kind: "fill";
  visible: boolean;
  opacity: number;
  paint:
    | { type: "solid"; color: string }
    | { type: "linearGradient"; angle: number; stops: ColorStop[] }
    | { type: "radialGradient"; stops: ColorStop[] }
    | { type: "pattern"; pattern: "dots" | "stripes" | "grid"; foreground: string; background: string };
  fillStyle?: FillStyle;
};
```

### 6.3 Stroke

```ts
type StrokeAppearance = {
  id: string;
  kind: "stroke";
  visible: boolean;
  opacity: number;
  color: string;
  width: number;
  style: StrokeStyle;
  alignment?: "inside" | "center" | "outside";
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  dash?: number[];
};
```

### 6.4 Effect

```ts
type EffectAppearance = {
  id: string;
  kind: "effect";
  visible: boolean;
  opacity: number;
  effect:
    | { type: "shadow"; color: string; blur: number; offsetX: number; offsetY: number }
    | { type: "glow"; color: string; blur: number }
    | { type: "gaussianBlur"; radius: number }
    | { type: "colorAdjust"; adjustments: Partial<ColorAdjustments> };
  scope?: "previous" | "object";
};
```

ใน MVP ให้ `scope` เป็น `object` หรือใช้ลำดับรายการอย่างง่ายก่อน ยังไม่ต้องเปิด compositing semantics ทุกแบบใน UI

### 6.5 Invariants

Appearance module ต้องเป็นเจ้าของกฎต่อไปนี้:

- `id` ของ item ไม่ซ้ำกันใน stack เดียวกัน
- order ของ array มีความหมายและต้องไม่ถูก sort แบบไม่ตั้งใจ
- opacity อยู่ระหว่าง 0 ถึง 1
- stroke width และ blur ไม่ติดลบ
- gradient stop ถูก clamp, sort และมีอย่างน้อยสองจุด
- angle ถูก normalize ให้อยู่ในช่วงที่กำหนด
- invalid operation ไม่แก้ document และไม่สร้าง history
- root opacity และ root blend mode ถูก apply เพียงครั้งเดียว
- item opacity ถูก apply เฉพาะ item นั้น
- unknown item ถูกเก็บไว้เพื่อ forward compatibility และ adapter รายงาน unsupported
- Appearance ไม่เป็นเจ้าของ layer visibility, lock, z-order หรือ block/free placement

## 7. Interface และ seam

### 7.1 Interface ของ Appearance module

ควรทำให้เป็น deep module ที่ caller เรียนรู้น้อย แต่ได้ behavior มาก:

```ts
readAppearance(element): AppearanceSnapshot

changeAppearance(
  element,
  operation,
): { ok: true; element: EngineElement; changed: boolean }
 | { ok: false; error: AppearanceError }
```

Store เพิ่ม transaction adapter:

```ts
updateAppearance(
  ids: ElementId[],
  operation: AppearanceOperation,
  label?: string,
): AppearanceBatchResult;
```

Property Panel ไม่ควรรู้ว่า shape fill เดิมชื่อ `backgroundColor` หรือ text color เดิมเก็บอยู่ใน `strokeColor`

### 7.2 Operations

```ts
type AppearanceOperation =
  | { type: "setRoot"; patch: Partial<Pick<Appearance, "opacity" | "blendMode">> }
  | { type: "insertItem"; item: AppearanceItem; index?: number }
  | { type: "updateItem"; itemId: string; patch: Partial<AppearanceItem> }
  | { type: "removeItem"; itemId: string }
  | { type: "moveItem"; itemId: string; toIndex: number }
  | { type: "duplicateItem"; itemId: string };
```

### 7.3 Renderer seam

```text
EngineElement geometry/content
        ↓
Appearance resolver/compiler
        ↓
backend-neutral RenderPlan
        ↓
Canvas2D adapter / SVG adapter / PPTX adapter / Raster adapter
```

Geometry callback ควรแยกจาก paint semantics:

```ts
renderAppearance(ctx, appearance, {
  drawGeometry,
  bounds,
  assets,
  quality,
});
```

rough.js, text layout, image crop และ book mockup ยังคงเป็น content adapter เฉพาะทาง ไม่ควรถูกย้ายเข้า Appearance module ทั้งหมด

## 8. แผนพัฒนาเป็นเฟส

### Phase 0: Contract และ behavior baseline

กำหนดก่อนลงมือ:

- stack order เป็น back-to-front หรือ UI top-to-bottom อย่างไร
- Fill/Stroke/Effect แต่ละชนิดใช้ local coordinates อย่างไร
- opacity ระดับ item และ object รวมกันอย่างไร
- effect ขยาย visual bounds เท่าใด
- multi-selection แสดง mixed values อย่างไร
- export policy เมื่อ backend รองรับไม่เท่ากัน

บันทึก golden cases จากระบบเดิม ได้แก่ solid fill, gradient, pattern, shadow, glow, text, image, frame และ book mockup

### Phase 1: Foundation module — **done**

สร้างแล้ว:

```text
lib/appearance/
  types.ts
  normalize.ts
  legacyAdapter.ts
  commands.ts
  capabilities.ts
  bounds.ts
  fingerprints.ts
```

งานหลัก:

- สร้าง type และ validator
- สร้าง `readAppearance` จาก field เดิม
- สร้าง pure reducer สำหรับ operations
- กำหนด capability ตาม element type
- เพิ่ม unit tests

ยังไม่ persist canonical `appearance` ใน phase นี้

### Phase 2: Canonical reads และ migration

เพิ่ม `appearance?: Appearance` ให้กับวัตถุ แล้วให้ renderer และ exporter อ่านผ่าน `readAppearance`

Mapping เบื้องต้น:

| Current field | New item |
|---|---|
| `backgroundColor` | Solid Fill |
| `fillType` + gradient fields | Gradient Fill |
| `fillPattern` | Pattern Fill |
| `strokeColor` | Stroke |
| `strokeWidth` | Stroke width |
| `strokeStyle` | Stroke style |
| `shadow` | Shadow Effect |
| `glow` | Glow Effect |
| `opacity` | Root opacity |
| `blendMode` | Root blend mode |

เพิ่ม schema migration จาก **v6 เป็น v7** เมื่อเริ่ม persist canonical appearance อย่างเป็นทางการ (v6 คือ Block bake แล้ว)

ในช่วง dual-write ให้คง legacy fields ไว้เพื่อให้ factories, templates, AI และเครื่องมือเก่าทำงานได้ จากนั้นค่อยลบ direct readers หลังมี regression coverage ครบ

### Phase 3: Store และ history — **adapter บาง ๆ มีใน UI slice นี้**

`updateAppearance` / `previewAppearance` ใน [lib/engine/store.ts](/opt/artshift/lib/engine/store.ts) ห่อ `changeAppearance` แล้ว dual-write legacy fields

กฎสำคัญ:

- multi-selection update เป็น all-or-none
- slider ใช้ checkpoint หนึ่งครั้งและ preview ระหว่างลาก
- drag reorder สร้าง history หนึ่งรายการ
- update ที่ไม่ผ่าน validation ไม่สร้าง history
- Undo/Redo คืนทั้ง stack และ root properties
- appearance preview ไม่เปลี่ยน `updatedAt` จนกว่าจะ commit

### Phase 5 UI slice (ล็อก 2026-09-19) — **งานนี้**

Appearance panel ใน `BuilderInspector`:

- stack list (front-to-back)
- Fill / Stroke / Shadow / Glow
- Text Arc ผ่าน `pathCurvature` (text only)
- ไม่มี Graphic Styles / Brand Kit
- ไม่เปิด multi fill/stroke เป็นปุ่ม product

### Phase 4: Canvas renderer

ปรับ [lib/renderer/canvas.ts](/opt/artshift/lib/renderer/canvas.ts:116) ให้:

1. สร้าง geometry/content surface
2. วาด Fill ตามลำดับ
3. วาด Stroke ตามลำดับ
4. Apply Effect ตามลำดับ
5. Apply root opacity และ blend mode ตอน composite

ต้องแก้ opacity ให้มีจุด apply เดียว เพราะปัจจุบัน gradient/pattern มีการปรับ alpha ภายใน content และ object มี alpha ด้านนอก ซึ่งเสี่ยงทำให้ opacity ถูกคูณซ้ำ

ปรับ cache key ให้รวม:

```text
element type
element id
geometry revision
appearance fingerprint
asset revision
render quality
```

cache padding ต้องคำนึงถึง stroke alignment, shadow blur, shadow offset, glow และ feather

### Phase 5: Appearance UI

ปรับ `BuilderInspector` ให้มีรายการ Appearance แบบ Illustrator:

- item row พร้อม icon/type
- eye toggle
- drag handle
- selected item state
- Add Fill
- Add Stroke
- Add Effect
- Duplicate
- Delete
- item opacity
- root opacity
- blend mode

UI ของ Fill ใช้ `ColorPickerInput` เดิมเป็น editor adapter ได้ ส่วน controls เฉพาะ shape, text, image และ book mockup ให้คงเป็น sections แยกด้านล่าง

Capability เบื้องต้น:

- Shape/Path: Fill + Stroke + Effect
- Text: Text color/Fill + Effect
- Line/Arrow/Freedraw: Stroke + Effect
- Image: Effect + opacity; ไม่แสดง Fill/Stroke ที่ไม่เกี่ยวข้อง
- Book Mockup: คง lighting และ ground shadow แบบเฉพาะทาง
- Frame: คง clipping/border semantics เดิม

### Phase 6: Export adapters

สร้าง capability policy:

```ts
type ExportPolicy = "editable" | "faithful" | "hybrid";
```

- Canvas/PNG/WebP/JPEG: ใช้ Canvas2D adapter
- SVG: ใช้ gradient, stroke และ SVG filter เมื่อรองรับ
- PPTX: export native เมื่อทำได้ และ rasterize เฉพาะ subtree ที่มี effect ที่ไม่รองรับ
- `.artshift`: เก็บ canonical Appearance JSON และ asset side table

ไม่ควร drop effect เงียบ ๆ ควรส่ง warning หรือ raster fallback ตาม policy

### Phase 7: Group Appearance และ advanced effects

ทำหลัง object-level stack เสถียร:

- real group identity แทนการพึ่ง `groupIds` อย่างเดียว
- group opacity และ blend ต้อง composite ใน isolated surface
- group mask และ descendant mask ต้องป้องกัน cycle
- เพิ่ม inner shadow, outline, blur, color adjust และ mask
- เพิ่ม shared style/preset เฉพาะเมื่อมี use case ชัดเจน

ยังไม่ควรเริ่มด้วย Effect Graph

## 9. ความสัมพันธ์กับ Raster Studio / Smart Object

Appearance และ Raster source ต้องเป็นคนละ concern:

```text
Raster Source
  → Raster Studio edits
  → Raster Composite
  → Editor Appearance Stack
  → Canvas composite
```

เมื่อผู้ใช้ Save ใน Raster Studio:

- เปลี่ยนเฉพาะ source/composite asset หรือ revision
- คงตำแหน่ง ขนาด rotation flip crop และ mask
- คง root opacity และ blend mode
- คง generic Shadow/Glow ของวัตถุ

การเปลี่ยน Drop Shadow ของวัตถุไม่ควรสร้าง Raster Revision ใหม่ ส่วนการปรับสี pixel, retouch, healing และ clone ควรอยู่ใน Raster Studio หรือ image-content pipeline

หากผู้ใช้ต้องการ Flatten Appearance ต้องเป็นคำสั่ง explicit เช่น `Flatten Appearance` และควรมี confirmation เพราะจะลดความสามารถในการแก้ไขภายหลัง

## 10. Persistence และ migration

### 10.1 Schema

ปัจจุบัน engine schema คือ **v6 (Block bake)** แผน canonical stack ควร bump เป็น **v7** เมื่อเริ่ม persist `appearance`

Migration ต้อง:

- ทำงานแบบ idempotent
- deep clone document ก่อนแก้
- สร้าง item id ที่ deterministic เมื่อแปลง field เดิม
- normalize ค่าเสียหาย
- preserve unknown fields และ unknown appearance items
- รองรับ document v5 ที่ไม่มี `appearance`
- ให้ save ครั้งถัดไปเขียน canonical v7

### 10.2 Asset storage

Appearance JSON เป็นข้อมูลขนาดเล็กและเก็บใน document ได้ แต่ raster mask, retouch edit และ flattened raster asset ควรใช้ asset side table/IndexedDB ไม่ควรฝัง data URL ขนาดใหญ่ลงใน stack

Fingerprint, render plan และ cache metadata เป็น transient ไม่ควร persist

## 11. AI และ producer อื่น ๆ

เมื่อ Appearance เป็น canonical แล้ว ควรเพิ่ม Appearance operations เข้า AI command layer แบบ whitelist เช่น:

- set fill
- add shadow
- set opacity
- add stroke
- reorder appearance item

ไม่ควรเปิดให้ AI ส่ง custom effect params ที่ไม่มี validator หรือให้แก้ raw document fields โดยตรง

ต้องตรวจและปรับ:

- factories
- templates
- vector Boolean operations
- resize artwork
- AI plan/application
- SVG export
- PPTX export
- thumbnail renderer
- legacy adapter/importer

## 12. Performance plan

ความเสี่ยงด้าน performance มาจาก offscreen surfaces และ Effect ที่ต้อง re-render ไม่ใช่จากรายการ UI เอง

มาตรการ:

- cache content surface แยกจาก root opacity/blend
- ใช้ appearance fingerprint ที่ละเอียดพอสำหรับ invalidation
- preview ระหว่าง slider ไม่สร้าง history และไม่ serialize ทุก pointer event
- จำกัดจำนวน item ใน MVP เช่น 12 รายการต่อวัตถุ
- ใช้ draft quality ระหว่างลาก และ export quality ตอน commit/export
- render เฉพาะ affected object เมื่อทำได้
- เพิ่ม effect-aware bounds และ padding
- หลีกเลี่ยงการสร้าง canvas ใหม่หาก appearance ไม่เปลี่ยน

เกณฑ์วัดควรทำบนเอกสารตัวแทน เช่น 50 วัตถุ, 10 appearance items ต่อวัตถุ และ image effect หนึ่งรายการ โดยต้องวัด editor interaction, thumbnail, save และ export แยกกัน

## 13. Testing plan

### Unit tests

- legacy fields → canonical Appearance
- canonical operation → expected stack
- opacity/blur/stroke validation
- gradient stop normalization
- item id และ reorder
- capability แยกตาม element type
- unknown item preservation
- malformed v5 migration

### Store tests

- Appearance update หนึ่งครั้งสร้าง history หนึ่งรายการ
- slider drag สร้าง history หนึ่งรายการ
- undo/redo คืนค่าครบ
- invalid operation ไม่แก้ document
- multi-selection all-or-none
- `updatedAt` เปลี่ยนเฉพาะ commit

### Renderer tests

- Fill หลายชั้นมี order ถูกต้อง
- Stroke หลายชั้นมี order ถูกต้อง
- opacity ถูก apply ครั้งเดียว
- Shadow/Glow ไม่ถูกตัดด้วย cache bounds
- cache invalidation ทำงานเมื่อ Appearance เปลี่ยน
- Appearance เดิมให้ภาพเทียบเท่า legacy fields

### Export tests

- SVG gradient และ stroke
- SVG effect filter หรือ warning/fallback
- PPTX native output สำหรับ style ที่รองรับ
- PPTX raster fallback สำหรับ unsupported effect
- PNG/thumbnail parity กับ Editor

### End-to-end tests

```text
select shape
→ add second Fill
→ reorder Fill
→ add Stroke
→ add Shadow
→ change item opacity
→ reload Project
→ undo/redo
→ export
```

Raster compatibility:

```text
select image
→ set object Shadow
→ open Raster Studio
→ edit pixels
→ save revision
→ return to Editor
→ verify placement และ Appearance เดิม
```

## 14. ความเสี่ยงและวิธีรับมือ

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| Model ซ้ำกับ field เดิม | logic สองชุดไม่ตรงกัน | ใช้ canonical read และ dual-write ชั่วคราว แล้วลบ direct readers |
| Effect ซับซ้อนทำให้ช้า | interaction กระตุก | cache, preview quality, limit item, วัด performance จริง |
| Canvas/SVG/PPTX ไม่เหมือนกัน | export สี/เงาเปลี่ยน | capability policy, warning และ selective raster fallback |
| Shadow/Glow ถูก clip | ภาพขาดขอบ | effect-aware bounds และ cache padding |
| Opacity ถูกคูณซ้ำ | สีจางกว่าที่ตั้งใจ | กำหนดจุด apply เดียวใน renderer |
| Migration ทำลาย Project เก่า | ผู้ใช้เปิดงานเดิมไม่ได้ | v5 fixtures, idempotent migration, backup และ round-trip test |
| Group Appearance เร็วเกินไป | compositing ผิดและ architecture บวม | จำกัด MVP ที่ object-level ก่อน |
| Appearance ปนกับ Raster Revision | แก้ shadow แล้ว pixel source เปลี่ยน | แยก source/content pipeline ออกจาก placed-object Appearance |
| AI แก้ effect โดยไม่ผ่าน validation | document เสียหาย | whitelist operations และ structured errors |
| Multi-selection มีค่าไม่เหมือนกัน | UI สับสน | mixed/tri-state view model และ all-or-none apply |

## 15. เกณฑ์รับงาน

### 15.1 Appearance panel MVP slice (ล็อก 2026-09-19)

ผ่านเมื่อ:

- เลือกวัตถุแล้วแก้ Shadow และ/หรือ Glow จาก live Builder Inspector
- แก้ Text Arc (`pathCurvature`) จาก live Inspector
- Appearance panel แสดง stack/list ของ fill, stroke, shadow, glow และ text arc เมื่อเกี่ยวข้อง
- ใช้ `lib/appearance` เป็นแหล่งความจริง ไม่มี Graphic Styles / Brand Kit / Affinity PDF ใน PR

### 15.2 เกณฑ์ Appearance แบบ Illustrator เต็ม (ยังไม่ใช่งานนี้)

MVP เต็มถือว่าผ่านเมื่อ:

- วัตถุหนึ่งชิ้นมี Fill ได้อย่างน้อย 2 รายการ
- มี Stroke ได้อย่างน้อย 2 รายการ
- เพิ่ม/ลบ/ซ่อน/duplicate/reorder ได้
- รองรับ Solid, Linear Gradient, Radial Gradient, Pattern
- รองรับ Shadow และ Glow
- มี item opacity และ root opacity
- มี Undo/Redo ที่ถูกต้อง
- Project เก่ายังเปิดได้
- Reload แล้ว Appearance ไม่หาย
- Canvas และ thumbnail แสดงผลตรงกัน
- SVG/PPTX แจ้ง warning หรือ rasterize อย่างชัดเจนเมื่อไม่รองรับ
- Raster Studio Save ไม่ทำลาย transform และ placed-object Appearance
- เอกสารขนาดตัวแทนยังใช้งานได้โดยไม่เกิดการ rebuild ทุก frame อย่างไม่จำเป็น

## 16. ลำดับ implementation ที่เสนอ

1. เขียน type, invariant และ migration tests
2. เพิ่ม `readAppearance` ที่อ่าน legacy fields ได้
3. ให้ Canvas และ thumbnail ใช้ semantic read
4. เพิ่ม `updateAppearance` ใน store
5. ย้าย controls เดิมไปใช้ Appearance command
6. เปิด stack UI สำหรับ Fill/Stroke/Effect
7. ปรับ cache และ effect-aware bounds
8. ทำ SVG/PPTX capability และ fallback
9. ทดสอบ Raster Studio handoff
10. ค่อยเพิ่ม Group Appearance และ advanced effects

## 17. สิ่งที่ไม่ควรทำในเฟสแรก

- ไม่ควรสร้าง Effect Graph
- ไม่ควรทำ shared style library พร้อมกับ stack
- ไม่ควรย้าย font/layout/image source เข้า Appearance ทั้งหมด
- ไม่ควรลบ legacy fields ก่อน migration test ครบ
- ไม่ควรให้แต่ละ exporter นิยาม effect semantics เอง
- ไม่ควร bake generic Shadow/Glow เข้า Raster asset อัตโนมัติ
- ไม่ควรทำ Appearance UI ซ้ำในหลาย panel

## 18. ข้อสรุป

ระบบ Appearance แบบ Illustrator เหมาะกับทิศทางของ ArtShift และมีพื้นฐานในระบบปัจจุบันเพียงพอที่จะพัฒนาต่อได้ โดยไม่ต้องรื้อ Editor ทั้งหมด

แนวทางที่สมดุลที่สุดคือ:

```text
Canonical per-object Appearance Stack
  + Deep Appearance module
  + Existing Engine Store history
  + Canvas/SVG/PPTX adapters
  + Raster Studio source separation
  + Incremental rollout
```

เป้าหมายที่ควรยึดคือ “ใช้ mental model แบบ Illustrator แต่รักษาความเรียบง่ายของ ArtShift” ไม่จำเป็นต้องจำลองทุกความสามารถของ Illustrator ตั้งแต่วันแรก
