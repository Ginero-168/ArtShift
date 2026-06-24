# LumenMighty — Action Plan

> แผนพัฒนาต่อจากสถานะปัจจุบัน (Phase 1 & 2 complete) ไปสู่โปรดักต์ที่ใช้งานได้จริง
> สร้างจากการ review ณ วันที่ 2026-06-24

---

## สถานะปัจจุบัน

- **Engine ใหม่เสร็จ Phase 1+2** — Canvas2D, select/move/draw, properties, layers, groups, flip, export PNG
- **TypeScript ผ่าน** (`tsc --noEmit`)
- **Tests ผ่าน** (7 ไฟล์, 51 tests)
- **Lint ติด** — 15 formatting errors, 87 warnings
- **ไม่มี Git repo**
- **Legacy code ค้าง** — old store, old editor, Excalidraw workspace
- **AI UX ยังแยกส่วน** — chat, image search, vision tools กระจัดกระจาย
- **Advanced features ค้าง** — arrow binding, grid snap, image crop, PPTX export

---

## หลักการจัดลำดับ

1. ทำรากฐานให้สะอาดก่อน (quality gates, legacy cleanup)
2. สร้าง design system ก่อน refactor UI
3. Refactor ส่วนใหญ่ก่อนเพิ่ม feature
4. ทำ feature ที่มี impact สูงก่อน (AI UX, arrow binding)
5. ปิดท้ายด้วย testing และ deployment

---

## Phase 0: Quality Gates — ปลดล็อก baseline

**เป้าหมาย:** ทุกครั้งที่แก้โค้ด ต้องมั่นใจว่า lint/typecheck/test ผ่าน

### Tasks
- [ ] รัน `npm run lint:fix` แล้วตรวจสอบผล
- [ ] แก้ lint errors ที่ auto-fix ไม่ได้ (noUnusedVariables, noUnusedImports, noUnusedFunctionParameters)
- [ ] Migrate `biome.json` schema จาก 2.4.12 → 2.5.0 (`biome migrate` หรือ manual)
- [ ] รันซ้ำ `npm run lint`, `npm run typecheck`, `npm run test` ให้ผ่านทั้ง 3
- [ ] Init git repository: `git init`
- [ ] สร้าง initial commit พร้อม `Co-authored-by: Devin`
- [ ] สร้าง `AGENTS.md` บันทึก verify steps (lint/typecheck/test)
- [ ] (Optional) เพิ่ม pre-commit hook ด้วย lefthook/husky

### Acceptance Criteria
- `npm run lint` exit 0
- `npm run typecheck` exit 0
- `npm run test` exit 0
- `git status` แสดง working tree clean

---

## Phase 1: Legacy Cleanup — ตัดสะพานเก่า

**เป้าหมาย:** เหลือระบบเดียว (engine v2) ไม่มีคู่ขนาน

### Tasks
- [ ] ลบ `app/editor/page.tsx` และ `components/ExcalidrawWorkspace.tsx`
- [ ] ลบ `lib/store.ts` (legacy store)
- [ ] ย้าย theme state ไป `lib/engine/store.ts` หรือสร้าง `lib/themeStore.ts` ใหม่
- [ ] ตรวจสอบ vendored `excalidraw/` folder แล้วลบ
- [ ] ลบ `lib/render.ts` (legacy thumbnail renderer)
- [ ] ลบ `lib/clipboard.ts`, `lib/svgImport.ts`, `lib/migrate.ts` ถ้าไม่ใช้แล้ว
- [ ] อัปเดต `tsconfig.json` excludes
- [ ] อัปเดต `biome.json` excludes
- [ ] รันทดสอบ `editor-v2` ให้ยังใช้ได้

### Risk
- ต้อง verify ว่า `app/page.tsx` redirect ไป `/editor-v2` ยังทำงาน
- ต้อง migrate ผู้ใช้ที่มี localStorage เก่าอยู่

### Acceptance Criteria
- ไม่มี import จาก `lib/store.ts` หรือ legacy routes
- `npm run build` ผ่าน
- `/editor-v2` เปิดได้

---

## Phase 2: Design System Foundation

**เป้าหมาย:** หยุดการ hardcode สีและ inline styles

### 2.1 Tokens
- [ ] ขยาย `@theme` ใน `globals.css`:
  - `--radius-sm`, `--radius-md`, `--radius-lg`
  - `--shadow-sm`, `--shadow-md`, `--shadow-lg`
  - `--space-*` scale (1, 2, 4, 6, 8, 12, 16, 20, 24, 32)
  - typography scale (`--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`)
- [ ] กำหนด component tokens:
  - `--button-primary-bg`, `--button-ghost-bg-hover`
  - `--panel-bg`, `--panel-border`
  - `--input-border`, `--input-focus-ring`
  - `--tooltip-bg`
- [ ] แก้ทุก fallback color (`#6366f1`, `#e5e7eb`, `#d1d5db`) ให้ใช้ tokens

### 2.2 Primitive Components
สร้าง `components/ui/`:
- [ ] `Button.tsx` — variants: primary, ghost, danger, icon
- [ ] `IconButton.tsx` — บังคับ `aria-label`
- [ ] `Popover.tsx` — ใช้แทน dropdown inline
- [ ] `ColorSwatch.tsx` — รองรับ transparent, selected, gradient
- [ ] `Slider.tsx` — สำหรับ adjustments
- [ ] `Tooltip.tsx` — แสดง shortcut
- [ ] `Input.tsx` — สำหรับ forms
- [ ] `Panel.tsx` — floating panel container

### 2.3 Icon System
- [ ] เพิ่ม `aria-label` ให้ทุก icon ใน `components/icons.tsx`
- [ ] สร้าง `IconButton` ที่บังคับ `aria-label`
- [ ] ลบ emoji ออกจาก `AIPrompt.tsx`

### Acceptance Criteria
- ไม่มี hex code ซ้ำใน components (นอกจากใน tokens)
- ทุก icon button มี `aria-label`
- ทุก theme แสดง components ได้ถูกต้อง

---

## Phase 3: Refactor PropertiesPanel

**เป้าหมาย:** เอา panel 1,100 บรรทัด แยกเป็น component ย่อย

### 3.1 Structure
สร้าง `components/Canvas/PropertiesPanel/`:
- [ ] `index.tsx` — layout + positioning logic
- [ ] `ColorSection.tsx` — stroke color, background color
- [ ] `StrokeSection.tsx` — width, style, roughness
- [ ] `FillSection.tsx` — fill style, gradient, pattern, shadow
- [ ] `TextSection.tsx` — font family, size, align
- [ ] `ArrowSection.tsx` — arrowheads, scale
- [ ] `LayerSection.tsx` — z-order, group, lock, flip, delete
- [ ] `AlignSection.tsx` — align, distribute
- [ ] `ImageSection.tsx` — crop, replace, AI image tools

### 3.2 UX Improvements
- [ ] เปลี่ยนจาก floating panel เป็น fixed right-side panel
- [ ] หรือทำ floating contextual bar ที่ predictable
- [ ] ลดจำนวนปุ่มที่เห็นพร้อมกัน ใช้ section/tab
- [ ] แสดง shortcut ใน tooltip ชัดเจน
- [ ] ใช้ `components/ui/*` แทน inline styles

### Acceptance Criteria
- ไม่มี PropertiesPanel ไฟล์เดียวยาวเกิน 200 บรรทัด
- Panel แสดงผลถูกต้องในทุกธีม
- ฟังก์ชันทุกอย่างยังทำงานเหมือนเดิม

---

## Phase 4: AI UX Overhaul

**เป้าหมาย:** รวม AI เป็นหนึ่งเดียว แก้ chat ให้ใช้งานได้จริง

### 4.1 Unified AI Panel
- [ ] สร้าง `components/AI/AIPanel.tsx`
- [ ] ย้าย `AIImageTools.tsx` → `components/AI/VisionTab.tsx`
- [ ] ย้าย `AIImagePanel.tsx` → `components/AI/ImageSearchTab.tsx`
- [ ] สร้าง `components/AI/ChatTab.tsx` ใหม่
- [ ] แทนที่ entry point ใน `editor-v2` ด้วย AIPanel เดียว

### 4.2 Chat Improvements
- [ ] แสดงประวัติข้อความ (user + assistant)
- [ ] รองรับ streaming text
- [ ] Loading state ที่ชัดเจน (spinner + text)
- [ ] แสดง mutations/actions ที่ AI ทำไป
- [ ] เก็บ history เป็น state ไม่ใช่ `useRef`
- [ ] แสดง suggested next prompts
- [ ] รองรับ stop generation

### 4.3 Prompt System
- [ ] แยก system prompt จาก `app/api/chat/route.ts` ไปไฟล์ `lib/ai/prompts/system.ts`
- [ ] แยก template registry builder ไป `lib/ai/prompts/templates.ts`
- [ ] อัปเดต prompt ให้ใช้ canvas 1920x1080 โดยตรง
- [ ] ลบ scale layer 1280→1920 ใน `lib/engine/chat.ts`
- [ ] แก้ `app/api/chat/route.ts` ให้เหลือ ~150 บรรทัด

### Acceptance Criteria
- AI มี entry point เดียว
- Chat แสดง history และ streaming
- Prompt สนับสนุน 1920x1080 โดยตรง
- `app/api/chat/route.ts` < 200 บรรทัด

---

## Phase 5: Engine Hardening

**เป้าหมาย:** ทำให้ engine ใช้งานได้จริงสำหรับ slide จริงจัง

### 5.1 Arrow Binding (Priority สูง)
- [ ] อ่าน `startBinding` / `endBinding` ใน `types.ts`
- [ ] แก้ `Transformer.tsx` ให้ drag endpoint แล้ว bind กับ shape
- [ ] สร้าง `recomputeArrowBindings(slide)` helper
- [ ] เรียก helper ใน `updateElements`, `flip*`, `scaleMulti`, move
- [ ] แสดง green indicator เมื่อ endpoint ติดกับ shape
- [ ] แสดง highlight เมื่อ drag endpoint อยู่เหนือ shape

### 5.2 Grid Snap
- [ ] เพิ่ม `snapGrid: number | null` ใน `EngineDoc`
- [ ] สร้าง `setGridSnap` action ใน `store.ts`
- [ ] ใส่ toggle button ใน toolbar
- [ ] วาด dot grid ใน `CanvasRoot`
- [ ] ปรับ `snap.ts` ให้ round ตาม grid หลัง snapBBox/snapResize
- [ ] แก้ `CanvasEditor.tsx` และ `Transformer.tsx` ใช้ grid snap

### 5.3 History Optimization
- [ ] เปลี่ยนจาก full snapshot เป็น op-based history
- [ ] หรือทำ shallow diff + limit snapshot count
- [ ] วัด memory usage ก่อน/หลัง

### 5.4 Image Crop
- [ ] ต่อจาก `CropOverlay.tsx`
- [ ] เก็บ `crop: { x, y, w, h }` ใน `ImageElement`
- [ ] แก้ `lib/renderer/canvas.ts` ใช้ `drawImage` 9 args
- [ ] เพิ่ม crop handles ใน `ImageSection`

### 5.5 Smart Guides
- [ ] เพิ่ม gap guides ใน `snap.ts`
- [ ] แสดง equal-spacing indicators ใน `Guides.tsx`

### Acceptance Criteria
- Arrow endpoint ติดกับ shape เมื่อ shape ขยับ
- Grid snap เปิด/ปิดได้
- Undo/redo ไม่กิน memory มหาศาล
- Image crop ใช้งานได้

---

## Phase 6: Export & Polish

### 6.1 Export
- [ ] แก้ `lib/engine/exportPPTX.ts` ให้รองรับ rough strokes, text, gradients
- [ ] แก้ `lib/engine/exportPNG.ts` ให้ fidelity ตรงกับ canvas
- [ ] แก้ `lib/engine/exportPDF.ts` ให้ใช้ `renderSlide` เป็น single source
- [ ] รองรับ export all slides

### 6.2 Thai Fonts
- [ ] ทำ font picker ใช้งานได้จริง
- [ ] Preload fonts ที่จำเป็น
- [ ] รองรับ font ใน PPTX/PDF export
- [ ] ตรวจสอบ font ในทุก theme

### 6.3 Templates
- [ ] รวม `TemplateBrowser` เข้า `editor-v2` อย่าง smooth
- [ ] แก้ `lib/templates.ts` ให้ใช้ engine types โดยตรก
- [ ] รองรับ "New from template"
- [ ] ทำ template gallery preview

### 6.4 Presentation Mode
- [ ] ปรับ `app/present/page.tsx` ให้ smooth
- [ ] รองรับ keyboard navigation (arrow keys, escape)
- [ ] รองรับ fullscreen

### Acceptance Criteria
- Export PPTX เปิดใน Google Slides/Keynote ได้
- Thai fonts แสดงถูกต้อง
- Presentation mode ใช้งานได้

---

## Phase 7: Testing & Deployment

### 7.1 Unit/Integration Tests
- [ ] เพิ่ม tests สำหรับ `lib/engine/bounds.ts`
- [ ] เพิ่ม tests สำหรับ `lib/engine/hitTest.ts`
- [ ] เพิ่ม tests สำหรับ `lib/engine/snap.ts`
- [ ] เพิ่ม tests สำหรับ `lib/engine/history.ts`
- [ ] เพิ่ม component tests ด้วย `@testing-library/react`
- [ ] เพิ่ม tests สำหรับ `lib/engine/chat.ts` (mock fetch)

### 7.2 E2E Tests
- [ ] ติดตั้ง Playwright
- [ ] เขียน test: สร้าง shape, move, resize, undo
- [ ] เขียน test: AI chat สร้าง slide
- [ ] เขียน test: export PPTX

### 7.3 CI/CD
- [ ] สร้าง `.github/workflows/ci.yml`
- [ ] รัน lint, typecheck, test, build
- [ ] ตั้ง branch protection

### 7.4 Deployment
- [ ] ตัดสินใจระหว่าง static export vs Node.js hosting
- [ ] แก้ `next.config.ts` ให้รองรับ mode ที่เลือก
- [ ] อัปเดต `deploy/DEPLOY.md` ให้ตรงกับ config
- [ ] ตรวจสอบ PWA manifest และ icons

### Acceptance Criteria
- CI ผ่านทุก PR
- Deploy ได้ด้วย documented steps
- E2E tests ผ่าน

---

## ลำดับการทำงานแนะนำ

### Path A: รากฐานสะอาด (แนะนำ)
```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

### Path B: Ship เร็ว
```
Phase 0 → Phase 2 (minimal) → Phase 4 → Phase 5.1 (arrow binding) → Phase 6
```
แล้วค่อยกลับมาทำ Phase 1 และ Phase 3

### Path C: AI-first
```
Phase 0 → Phase 4 (AI UX) → Phase 2 (minimal) → Phase 6 (PPTX) → Phase 5
```

---

## ตัวชี้วัดความสำเร็จ

- [ ] `npm run lint` ผ่าน
- [ ] `npm run typecheck` ผ่าน
- [ ] `npm run test` ผ่าน
- [ ] `npm run build` ผ่าน
- [ ] ไม่มี legacy store
- [ ] ไม่มี hex code hardcoded ใน components
- [ ] AI มี entry point เดียว
- [ ] Arrow binding ทำงานได้
- [ ] PPTX export ใช้งานได้
- [ ] มี CI/CD ทำงาน

---

## หมายเหตุ

- แผนนี้อิงจาก `docs/HANDOVER.md` และ `docs/REWRITE_PLAN.md`
- ควร review แผนนี้ก่อนเริ่มทำ และปรับ priority ตาม business need
- แนะนำให้ทำ Phase 0 ก่อนเสมอ ไม่ว่าจะเลือก path ไหน
