# แผน Raster Studio (Smart Object) — ฉบับปรับปรุง

> วันที่: 16 September 2026  
> ผู้เกี่ยวข้อง: ArtShift Editor + Raster pipeline  
> อ้างอิงงานวิจัย: [raster-studio-libraries-evaluation-2026-09-16.md](../research/raster-studio-libraries-evaluation-2026-09-16.md), [raster-healing-library-research.md](../raster-healing-library-research.md), Appearance plan §9

## 1. สรุปคำตัดสิน

**เดินหน้าแยก Raster Studio แบบ Smart Object — สร้างเองเป็นแกนหลัก**

| คำถาม | คำตอบ |
|---|---|
| แผนนี้ work ไหม? | **Work** ทั้ง product, data model, export, AI handoff |
| ต้องซื้อ editor SDK ไหม? | **ไม่** เป็นค่าเริ่มต้น |
| Filerobot / Pintura / Photopea? | ใช้ได้แค่ **optional chrome / escape hatch** ไม่ใช่ core |
| ช่องว่างจริงคืออะไร? | **ขอบเขต open → edit → commit revision** ไม่ใช่ engine ใหม่ |

ArtShift มีของยากอยู่แล้ว: Canvas2D, Zustand, `rasterMask` / `rasterEdits`, OpenCV heal/clone, selection workers, `perfect-freehand`  
สิ่งที่ยังไม่มีคือ studio ที่แยกจาก Editor และสัญญา Save แบบ Smart Object

---

## 2. เป้าหมายผลิตภัณฑ์

### ผู้ใช้เห็นอะไร

1. ใน Editor: ภาพเป็น **Smart Object** — ย้าย / หมุน / ครอปกรอบ / Appearance ได้ แต่ไม่แปรงพิกเซลบน canvas หลัก
2. Double-click หรือปุ่ม **Edit Raster** → เปิด Raster Studio (fullscreen / route)
3. ใน Studio: แปรง, selection, heal, clone, (อนาคต) adjust / layers
4. **Save** → กลับ Editor แล้วภาพอัปเดต **โดยตำแหน่งและ Appearance ไม่เปลี่ยน**
5. **Cancel** → ทิ้ง session ใน Studio

### สิ่งที่ Editor ไม่แบกอีกต่อไป

- โหมด Raster/Vector สลับทั้งแถบเครื่องมือ
- Brush / Wand / Heal / Clone gesture ใน `CanvasEditor`
- Pixel selection overlay บน design canvas

Editor เหลืองาน layout + vector + place image + เปิด Studio

---

## 3. สัญญา Smart Object (ล็อกตั้งแต่เฟส 0)

```text
Raster Source (fileId)
  → Raster Studio session (ops ในหน่วยความจำ)
  → Save = Raster Composite revision (blob → asset side table)
  → ImageElement.fileId / revision ชี้ไป revision ใหม่
  → Editor Appearance Stack (ไม่แตะ)
  → Canvas composite
```

### Open

ส่งเข้า Studio:

- `elementId`
- `fileId` (+ decoded `ImageBitmap` / blob)
- `crop`, `rasterMask`, `rasterEdits`, `adjustments` (ถ้ายังอยู่บน element)
- `naturalWidth` / `naturalHeight`

**ไม่ส่ง:** `x`, `y`, `width`, `height`, `angle`, opacity, blend, shadow

### Save (commitRevision)

1. Flatten preview → PNG/WebP blob (แนะนำ `@jsquash/png` หรือ `@jsquash/webp`)
2. เขียนเข้า asset side table ได้ `fileId` ใหม่ (หรือ revision ของไฟล์เดิม)
3. อัปเดต `ImageElement.fileId` (+ optional `sourceRevisionId`)
4. เคลียร์หรือ migrate `rasterMask` / `rasterEdits` ตามนโยบาย bake
5. คง placement + Appearance
6. Push **หนึ่ง** history entry บน Editor: `"update raster revision"`

### Cancel

ทิ้ง studio session; ไม่แตะ document

### Edit again

เปิด Studio ด้วย revision ล่าสุดเป็น source  
(ถ้าเก็บ op history แยก จะเปิดแบบ non-destructive ต่อได้ในเฟสถัดไป)

---

## 4. เทคโนโลยี — สิ่งที่ใช้ / ไม่ใช้

### Core (ใช้ต่อ / เพิ่ม)

| Technology | บทบาท | เหตุผล |
|---|---|---|
| **ArtShift Canvas2D + Zustand** | Studio renderer + session state | ไม่สร้าง engine ที่สอง |
| **`lib/raster/*` + `editorController`** | Mask, selection, retouch commits | seam พร้อมอยู่แล้ว |
| **`@techstark/opencv-js`** | Heal / inpaint ใน Worker | มีใน repo + research แล้ว |
| **`perfect-freehand`** | เส้นแปรง | มีใน repo |
| **`@jsquash/png` (+ webp)** | Encode revision ใน Worker | Apache-2.0, จาก Squoosh, ดีกว่า `toDataURL` |
| **OffscreenCanvas / Worker** | Preview & bake นอก main thread | มาตรฐานแพลตฟอร์ม |
| **BroadcastChannel** | Sync เมื่อมี popup / multi-tab | ใช้เมื่อจำเป็น (เฟสหลัง) |

### Optional (เฟส 3+)

| Technology | บทบาท | ข้อควรระวัง |
|---|---|---|
| **Pintura** (commercial) | Crop / finetune UI เร็ว | OEM cost; Retouch ต้องต่อ AI/ของเรา |
| **Filerobot** (MIT) | Crop / annotate modal | ดึง Konva + styled-components |
| **Photopea** (free API) | Escape hatch ระดับ Photoshop | Hosted, CORS, ไม่รับผิดชอบเอกสาร |
| **miniPaint** (MIT) | Reference / last resort | API ฝังไม่นิ่ม |

### Reject เป็น core

| Technology | เหตุผลสั้น |
|---|---|
| CE.SDK / PhotoEditor SDK | แข่งกับ design canvas ของเรา + ค่าใช้จ่าย |
| Polotno | License ห้ามสร้าง competing editor + ราคาสูง |
| Toast UI Image Editor | ค้างที่ React 17 / npm 2022 |
| Fabric.js / Konva เป็น document engine | Dual scene graph |
| Craft.js | คนละโดเมน (page builder) |
| glfx.js เป็น dependency | ไม่ดูแลแล้ว; ใช้เป็นแรงบันดาลใจได้ |
| wasm-vips ใน v1 | ต้อง COOP/COEP; เก็บไว้เฟสใหญ่ |

รายละเอียดและแหล่งอ้างอิง: [งานวิจัยไลบรารี](../research/raster-studio-libraries-evaluation-2026-09-16.md)

---

## 5. สถาปัตยกรรมเป้าหมาย

```text
┌─────────────────────────────────────────────┐
│ Editor (vector + place Smart Object)        │
│  - Select / Direct / Pen / Text / shapes    │
│  - Transform image box                      │
│  - Appearance (shadow, opacity, …)          │
│  - Entry: Edit Raster / double-click        │
└──────────────────┬──────────────────────────┘
                   │ openStudio(elementId)
                   ▼
┌─────────────────────────────────────────────┐
│ Raster Studio (same-origin route/fullscreen)│
│  - Image-space viewport (identity transform)│
│  - Tools: move, brush, erase, selections,   │
│    wand, quick select, heal, clone          │
│  - Studio-local history                     │
│  - Optional later: Adjust tab / Advanced    │
└──────────────────┬──────────────────────────┘
                   │ commitRevision(blob, meta)
                   ▼
┌─────────────────────────────────────────────┐
│ Asset side table + ImageElement update      │
│  - new fileId / revisionId                  │
│  - one Editor undo step                     │
└─────────────────────────────────────────────┘
```

### ไฟล์ / seam ที่เกี่ยวข้อง

| พื้นที่ | Path | บทบาทหลังแยก |
|---|---|---|
| Mutation API | `lib/engine/editorController.ts` | ขยาย `commitRasterRevision(...)` |
| Raster libs | `lib/raster/*` | ย้ายไปใช้ใน Studio เป็นหลัก |
| Gesture monolith | `components/Canvas/CanvasEditor.tsx` | ถอด raster branches |
| Mode toggle | `EditorOptionBar.tsx` | ถอด Raster/Vector; เหลือ Edit Raster |
| Types | `lib/engine/types.ts` | เพิ่ม `sourceRevisionId?` เมื่อพร้อม |
| Persist | `serialize.ts` / `projectStore.ts` | revision ใน side table |

---

## 6. นโยบาย bake vs non-destructive

| นโยบาย | เมื่อไหร่ | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A. Bake ทุก Save** (แนะนำ v1) | Save ใน Studio = flatten เป็นไฟล์ใหม่ เคลียร์ mask/edits | Smart Object ชัด, doc เบา | แก้ต่อแบบ stroke-level ยาก |
| **B. Preserve ops** | Save เขียน ops กลับ element | Edit again ละเอียด | JSON อ้วน (ปัญหาปัจจุบันของ rasterEdits) |
| **C. Hybrid** | Bake composite + เก็บ ops ใน side channel | ดีที่สุดระยะยาว | ซับซ้อน |

**v1 ล็อก A**  
**v2 พิจารณา C** เมื่อมี asset side table สำหรับ ops

---

## 7. Undo / Autosave / Concurrent edit

| ชั้น | พฤติกรรม |
|---|---|
| Studio history | Undo/Redo ภายใน session เท่านั้น |
| Editor history | 1 entry ต่อ Save สำเร็จ |
| Autosave โปรเจกต์ | ไม่ยิงทุก stroke ใน Studio; ยิงหลัง Save กลับ Editor |
| เปิด Studio ซ้ำขณะ dirty | บล็อกหรือถาม Confirm ก่อน discard |

---

## 8. แผนเฟส (implementation)

### Phase 0 — Contract (1–2 วันแนวคิด + types)

- นิยาม `RasterStudioSession` และ `commitRasterRevision`
- ตัดสินใจ: route vs fullscreen panel (แนะนำ **fullscreen panel ก่อน** แล้วค่อย route)
- กฎ migrate: เมื่อเปิด Studio จาก element ที่มี `rasterMask`/`rasterEdits` → โหลดเข้า session หรือ bake ก่อนเข้า

### Phase 1 — Shell + Save loop (MVP ที่รู้สึก Smart Object)

- UI Studio พื้นฐาน: แสดงภาพ, Zoom/Pan, Save / Cancel
- Save เขียน `fileId` ใหม่กลับ element โดยคง transform
- Entry จาก context menu / double-click
- ยังไม่ย้ายเครื่องมือทั้งหมด — อาจ flatten ภาพที่มี edits อยู่แล้วตอน Open

**Definition of done:** แก้ภาพใน Studio (แม้แค่ crop/test stamp) แล้วกลับมา Editor ตำแหน่งเดิมไม่กระตุก

### Phase 2 — Extract tools

ย้ายตามลำดับความเสี่ยงต่ำ→สูง:

1. Brush / Eraser / Pencil  
2. Marquee / Ellipse / Lasso / Polygon + Delete pixels  
3. Magic Wand / Quick Select  
4. Healing / Clone  

ถอดจาก `CanvasEditor` และถอดโหมด Raster จาก toolbar เมื่อครบ

### Phase 3 — Pipeline คุณภาพ

- `@jsquash` encode  
- OffscreenCanvas preview  
- Adjustments ใน Studio (brightness/contrast) โดยไม่พึ่ง Filerobot  
- ย้าย `rasterEdits` dataUrl ออกจาก document JSON → side table

### Phase 4 — Escape hatches (ถ้าจำเป็น)

- “Advanced edit…” → Photopea หรือ Pintura  
- ผลลัพธ์เข้า `commitRevision` ชุดเดียวกับ Studio

### Phase 5 — ขยายศักยภาพ Studio

- Raster layers ใน Studio  
- Non-destructive op history ข้าม session (นโยบาย C)  
- BroadcastChannel สำหรับ popup หลายจอ  
- AI inpaint adapter (Fast mode จาก heal research)

---

## 9. ความเสี่ยงและการลดความเสี่ยง

| ความเสี่ยง | ลดอย่างไร |
|---|---|
| `CanvasEditor` ใหญ่ แยกยาก | แยกทีละ tool group; มี adapter ที่เรียก `lib/raster` เหมือนเดิม |
| ผู้ใช้สับสน 2 ทางเข้า | ถอด Raster toggle หลัง Phase 2; เหลือ Edit Raster ทางเดียว |
| Doc อ้วนจาก dataUrl | bake + side table ใน Phase 3 |
| Dual engine จาก Filerobot/Konva | ไม่ใส่เป็น core; ถ้าใช้ให้อยู่หลัง feature flag |
| Photopea ไม่เสถียร / ไม่รับผิด | ป้ายว่า Advanced / experimental |
| COOP/COEP กระทบ OAuth | ไม่บังคับ wasm-vips ใน v1 |
| Appearance กับ pixel ปน | ยึด Appearance plan §9 อย่างเคร่ง |

---

## 10. Success metrics

- Editor bundle / interaction: ไม่โหลด OpenCV จนกว่าจะเปิด Studio (code-split)
- Save กลับ: placement delta = 0 (ทดสอบอัตโนมัติ)
- Undo หนึ่งครั้งบน Editor ย้อนทั้ง revision
- ไม่มี path แปรงพิกเซลบน design canvas หลัง Phase 2
- โปรเจกต์เก่า (schema v5) เปิดได้; revision field เป็น additive

---

## 11. สิ่งที่ไม่ทำในเฟสแรก

- แทนที่ Editor ด้วย Polotno / CE.SDK  
- ทำให้ Filerobot เป็น Raster Studio  
- Dual live editing (แก้พิกเซลบน canvas หลักคู่กับ Studio)  
- SharedWorker / COOP isolation  
- Layer system เต็มรูปแบบก่อน Save loop เสร็จ

---

## 12. ขั้นตอนถัดไปที่เสนอทันที

1. ล็อก Phase 0 contract ในโค้ด (`types` + `commitRasterRevision` stub + เทสต์ placement invariant)
2. สร้าง Studio shell (fullscreen) + Save/Cancel วงจรเดียว
3. ย้าย Brush/Eraser เป็นชุดแรก
4. ถอด Raster mode จาก toolbar เมื่อชุดเครื่องมือหลักย้ายครบ

งานวิจัยไลบรารีเก็บไว้ที่  
`docs/research/raster-studio-libraries-evaluation-2026-09-16.md`  
แผน Appearance ที่เกี่ยวข้อง: §9 ใน  
`docs/plans/appearance-system-illustrator-plan-th.md`
