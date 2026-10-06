# ArtShift Vectorize Studio — แบบระบบและแผนพัฒนา

วันที่: 2026-09-27 · สถานะ: ข้อเสนอออกแบบ ยังไม่ได้เปลี่ยนพฤติกรรมแอป

## 1. คำตัดสิน

สร้าง **Vectorize Studio**: เลือกภาพ → เห็นผลแปลงที่แนะนำ → ตรวจและแก้เฉพาะจุด → ใช้เป็น Object เดียวใน Artwork → กลับมาแก้ได้เสมอ

ใช้ VTracer ที่มีอยู่เป็นฐานในเครื่อง และวาง adapter ให้แข่งขันกับบริการคลาวด์ด้วยภาพจริงของ ArtShift ก่อนตัดสินผู้ชนะรายประเภทภาพ จุดขายต้องเป็น “เหมือนต้นฉบับ เส้นสะอาด แก้ต่อได้” ไม่ใช่จำนวนพารามิเตอร์หรือคำว่า AI

คำว่า “ดีที่สุด” ในเอกสารนี้เป็นเป้าหมายที่ต้องพิสูจน์ ไม่ใช่ผล benchmark ที่ได้แล้ว ไม่มีเอนจินเดียวที่เหมาะกับโลโก้ ลายเส้น และภาพถ่ายทุกแบบ

**ลำดับความสำคัญ:** รักษาเนื้อหาสำคัญ → รักษารูปร่างและสี → โครงสร้างแก้ไขง่าย → ประสิทธิภาพ → ความสะดวก ตัวเลือกที่ทำตัวอักษรหรือรูในโลโก้หายต้องไม่ชนะเพียงเพราะไฟล์เล็ก

## 2. ฐานที่ตรวจพบในโค้ด

| จุดปัจจุบัน | หลักฐาน | ผลต่อการออกแบบ |
|---|---|---|
| VTracer WASM รันใน Worker และมี main-thread fallback | `lib/vectorize/vectorizer.ts`, `vectorizer.worker.ts` | ใช้ของเดิม แต่กันงานหนักที่ทำ UI ค้างเมื่อ Worker ล้มเหลว |
| Pin VTracer `1.0.0-alpha.4` แล้ว | `wasm/vtracer-browser/Cargo.toml` | ไม่เสนออัปเกรดเพื่อรับฟีเจอร์ที่มีอยู่แล้ว |
| มี color/BW/watershed, stacked/cutout, palette cap, simplify | `vectorizerBackend.ts`, `vectorizerTypes.ts` | ต้อง calibrate และทดสอบผลจริง ไม่เพิ่มสไลเดอร์ซ้ำ |
| ด้านยาวสูงสุด 1,200 px; detail 4 และ 5 จึงชนเพดานเดียวกัน | `getVectorizeMaxDimension()` | แยกความละเอียด preview/final ออกจากระดับรายละเอียด |
| งบ local 512 elements / 50,000 nodes; SVG สูงสุด 4,000,000 ตัวอักษร | `vectorizerTypes.ts`, `vtracerAdapter.ts` | เป็น guardrail ปัจจุบัน ไม่ใช่ค่าคุณภาพที่ต้องพยายามใช้ให้เต็ม |
| Cloud ใช้ Recraft ผ่าน Replicate พร้อม consent, credit และ timeout | `app/api/vectorize/recraft/route.ts` | รักษาการควบคุมค่าใช้จ่ายและผลลัพธ์ไม่แน่นอนที่มีอยู่ |
| UI local/cloud อยู่ใน `VisionObjectIsolator.tsx`; สำเร็จแล้ว addElements ทันที | `components/Canvas/PropertiesPanel/VisionObjectIsolator.tsx` | ย้ายไป session ที่ตรวจผลก่อน commit |
| Input ของทั้งสองทางอ่าน cached file dataURL | ไฟล์ UI เดียวกัน `getImageDataUrl`, `handleRecraftVectorize` | ต้องนิยามชัดว่าแปลงต้นฉบับหรือภาพที่เห็นหลัง crop/mask/adjustments |
| `vectorized` เป็น SVG เดียว, atomic และ lockedChildren | `lib/engine/types.ts`, `atomicVectorize.ts` | คงสัญญาบน Artwork; เพิ่มการแก้ภายใน Studio แทนการ ungroup อัตโนมัติ |
| เมนูผลลัพธ์มี Download as SVG; มี queue, persistence, SVG export | `atomicVectorize.ts`, `lib/engine/processingQueue.ts`, `persist.ts`, `exportSVG.ts` | เชื่อมระบบเดิม แทนสร้างคิวหรือ document store คู่ขนาน |

## 3. ประสบการณ์ผู้ใช้

### ทางเข้าเดียว

เลือก Image Object → **Vectorize** เปิด Studio เต็มพื้นที่ โดยใช้ chrome แนวเดียวกับ Raster Studio: พื้นที่ภาพกว้าง แถบเครื่องมือสั้น แผงปรับด้านขวา สถานะด้านล่าง ชื่อ provider อยู่ในรายละเอียดผลลัพธ์ ไม่เป็นสองเครื่องมือที่ผู้ใช้ต้องเดาเอง

เปิดครั้งแรกใช้ **ภาพที่เห็น** เป็นค่าเริ่มต้น: bake crop/mask/pixel adjustments ในพิกัดภายใน Object ก่อนแปลง แต่ไม่ bake ตำแหน่ง หมุน flip opacity หรือเอฟเฟกต์ระดับ Object ซ้ำ โหมด **ไฟล์ต้นฉบับ** เป็นตัวเลือกพร้อม preview ขอบเขตที่ชัดเจน

หากไฟล์เป็น SVG ที่รองรับอยู่แล้ว ให้เปิด/import โดยไม่ rasterize แล้ว trace ซ้ำ

### การเลือกเริ่มต้น

เลือกประเภทอัตโนมัติพร้อมให้เปลี่ยนได้: **โลโก้ / ภาพประกอบ / ลายเส้น / พิกเซลอาร์ต / ภาพถ่าย** ใช้ local heuristics เช่น alpha, edge density, จำนวนสีโดยประมาณเป็น baseline; classifier เป็นตัวช่วยที่เพิ่มภายหลังได้โดยไม่ผูกกับ LLM

แสดงผลแนะนำหนึ่งชิ้นก่อน ถัดมาจึงเสนอไม่เกินสามแนว: **ตรงต้นฉบับ / สมดุล / เส้นน้อย** โดยใช้ค่าที่ต่างกันอย่างมีนัยสำคัญ สร้าง candidate local แบบค่อยเป็นค่อยไปตามงบเครื่อง ไม่รัน cloud สามครั้งตามจำนวนการ์ด

ค่าเริ่มต้นรักษาอัตลักษณ์: ไม่ generative-upscale, ไม่เติมเส้นที่คาดเดา, ไม่แก้สะกดข้อความ การวาดใหม่ต้องเป็นคำสั่งแยกที่ผู้ใช้ตั้งใจเลือก

### หน้าจอตรวจผล

- ต้นฉบับ / ผลลัพธ์ / ปาดเปรียบเทียบ / เส้นโครง; pan และ zoom ใช้พิกัดร่วมกัน
- ตรวจได้ทั้งที่ขนาดใช้งานจริงและซูมสูง โดยไม่เรียกเอนจินใหม่ตอน zoom
- พื้นหลังสลับโปร่งใส/สว่าง/มืด เพื่อเห็นขอบขาวและปัญหา alpha
- ตัวควบคุมหลัก: จำนวนสี, รายละเอียด, ความเรียบ, รักษามุม; “ขั้นสูง” ค่อยเปิด native options
- สีที่ล็อกจะรักษาค่าสีตรงตามที่กำหนด; ปรับสีทั้งกลุ่มหลัง trace ได้โดยไม่รันใหม่
- จุดควรตรวจเป็นรายการที่กดแล้วพาไปตำแหน่งจริง เช่น ช่องว่างหาย เส้นบางขาด รายละเอียดเล็กถูกลด ไม่ใช้คะแนน “คุณภาพ 98%” ที่อธิบายไม่ได้
- แสดงจำนวน paths/nodes, ขนาด SVG และข้อจำกัดการแก้ไขจากไฟล์จริง หลังประมวลผลเท่านั้น

### การแก้ที่ให้ความแตกต่าง

**แก้เฉพาะบริเวณ:** ล้อมพื้นที่ → รักษารายละเอียด / ลดจุด / แยกสี / ลบรอยเล็ก ก่อนแสดงผลใหม่ให้เก็บ candidate เดิมไว้เทียบ การ retrace บริเวณเป็นงานระยะหลังและต้องรักษาขอบร่วมกับพื้นที่ข้างเคียง

**แก้สี:** เลือกสีแล้วเห็นบริเวณที่ได้รับผล → เปลี่ยนค่า/รวมสี → undo ได้ ไม่ merge รูปทรงโดยสีเหมือนกันอย่างเดียวหากทำ z-order หรือรูทะลุเปลี่ยน

**แก้เส้นภายใน:** เลือก subpath และจุด Bézier ใน Studio เมื่อ SVG อยู่ใน subset ที่แก้ได้; Artwork ยังคงเลือกทั้งชิ้นเป็นหนึ่ง Object ผลที่มี unsupported gradients/masks ต้องแสดงข้อจำกัดก่อนเข้าแก้ ไม่ flatten เงียบ ๆ

**ข้อความ:** ค่าเริ่มต้นเก็บรูปลักษณ์เป็น outlines การทำข้อความแก้ไขได้เป็นคำสั่งแยก ต้องตรวจ OCR, ภาษาไทย/วรรณยุกต์, shaping, font availability และให้ผู้ใช้ยืนยันก่อนแทนต้นฉบับ หากไม่มั่นใจเก็บ outlines

### Commit และเปิดกลับมา

ปุ่มหลัก **ใช้เวกเตอร์นี้** สร้าง Object ใหม่; เก็บ Image ต้นฉบับไว้ให้ย้อนกลับได้ การแทน Object ต้นฉบับต้องเป็นตัวเลือกชัดเจน หนึ่งครั้งที่กดใช้ = หนึ่ง Editor undo step; การเปลี่ยนสไลเดอร์ใช้ประวัติ session

เมื่อเพิ่ม Object ใหม่ รักษาขนาด ตำแหน่ง angle/flip และ parent Layer ตามกฎ placement ของ ArtShift ไม่บังคับพิกัดใน Block layer ที่ระบบต้องจัดเรียง เมื่อ replace ให้รักษา id/สมาชิก Layer และ placement contract อย่างครบถ้วน

ดับเบิลคลิก Vectorized Object เปิด Studio อีกครั้งพร้อม source และ recipe; ยกเลิกทิ้งเฉพาะ session ใหม่ ไม่เปลี่ยนผลที่ Artwork ใช้อยู่

### สถานะผิดปกติที่ต้องออกแบบตั้งแต่แรก

| เหตุการณ์ | พฤติกรรม |
|---|---|
| ภาพโปร่งใสทั้งหมด | แจ้งว่าไม่มีเนื้อหาที่มองเห็น; ไม่สร้าง Object ว่าง |
| ภาพเล็กหรือ JPEG แตก | แสดงข้อจำกัดและเทียบ preview; ไม่สัญญากู้เส้นต้นฉบับได้แน่นอน |
| มีข้อความเล็ก/รายละเอียดเกินกำลัง | ชี้จุดตรวจและเสนอเก็บรายละเอียดเพิ่ม; ไม่ลบทิ้งเพื่อให้ผ่านงบ |
| Worker ใช้ไม่ได้ | งานเล็กอาจ fallback หลังวัดต้นทุน; งานหนักให้ลองใหม่/ลดความละเอียด/เลือก cloud |
| Cloud ไม่ได้ตั้งค่า/ถูกปฏิเสธ | local ยังทำต่อได้ ไม่มีการส่งไป provider อื่นเงียบ ๆ |
| ผล cloud ไม่แน่นอนหลัง timeout | คง job reference และตรวจสถานะก่อน retry ป้องกันซ้ำ/คิดเงินซ้ำ |
| ต้นฉบับถูกเปลี่ยนขณะประมวลผล | ห้ามนำผลเก่าไปแทน revision ใหม่; เสนอใช้เป็นสำเนาหรือประมวลผลใหม่ |
| Final ต่างจาก preview | กลับหน้าตรวจ final ก่อน commit; ไม่แทนภาพที่ผู้ใช้ตรวจแล้วโดยไม่แจ้ง |

## 4. ระบบแปลงภาพ

```text
Source snapshot + immutable revision + input transform
  → normalize orientation / color / alpha / crop
  → analyze image + protected regions + user intent
  → choose engine and bounded recipe candidates
  → segment → trace → fit curves
  → normalize SVG + build editable representation when supported
  → validate structure + render round-trip comparison
  → present candidate + warnings + local corrections
  → final-resolution run if needed → inspect → commit asset revision
```

### เลือกเอนจินตามหลักฐาน

1. **VTracer WASM ที่มีอยู่:** baseline ในเครื่องสำหรับทุกภาพที่รับได้ ปรับ preset จาก corpus จริง, reuse segmentation เมื่อ API/binding รองรับจริง, debounce และ cancel งานเก่า รักษา version/options fingerprint
2. **Recraft ผ่าน Replicate ที่มีอยู่:** cloud candidate ตั้งต้น ไม่ย้ายไป direct API เพียงเพราะมี endpoint ใหม่ ต้องเทียบคุณภาพ ขนาด input ที่ wrapper รับ latency ต้นทุน และการจัดการ job
3. **Vectorizer.AI adapter ทดลองแบบมีเงื่อนไข:** ความสามารถเหมาะจะพิจารณา แต่เอกสารเงื่อนไข API/benchmark มีข้อจำกัดตามงานวิจัย ต้องยืนยันข้อตกลงที่ใช้กับ ArtShift ก่อนนำเข้า benchmark หรือ production; ระหว่างนี้พัฒนา local/Recraft ต่อได้ ยังไม่เลือกเป็น dependency หลักหรือประกาศว่าชนะ
4. **BW/centerline adapter:** contour tracing กับ centerline tracing เป็นคนละงาน เลือก stroke/outline ตามเป้าหมาย ไม่อ้างว่า VTracer รองรับ centerline โดยอัตโนมัติ Potrace เป็นผู้สมัครด้าน monochrome แต่ต้องพิจารณาเงื่อนไขการใช้ก่อนบรรจุ
5. **diffvg / generative vector models:** track วิจัยสำหรับ refinement หรือสร้างงานใหม่ ไม่อยู่ใน critical path ระยะแรก

เอนจินใหม่ต้องถูก pin, มี capability declaration และ golden fixtures ใน ArtShift ผลจากเอนจินใดต้องผ่าน validation เดียวกัน ไม่ถือว่า provider คืน SVG แล้วเท่ากับแก้ไขได้ครบ

รายละเอียดหลักฐานและข้อจำกัด: [งานวิจัยเอนจิน](../research/vectorize-engine-evaluation-2026-09-27.md)

### Recipe ตามประเภทภาพ

| ประเภท | สิ่งที่รักษา | วิธีเริ่มต้น | สิ่งที่ไม่ทำอัตโนมัติ |
|---|---|---|---|
| โลโก้/ไอคอน | มุม รูทะลุ สัดส่วน สีแบรนด์ | palette constraints, shared boundaries, protect small connected parts | OCR แทน wordmark, บังคับ symmetry, ลบชิ้นส่วนเล็กทั้งหมด |
| ภาพประกอบ flat | สีหลัก occlusion และเส้นโค้ง | color segmentation + contour fit | สร้าง gradient ที่ต้นฉบับไม่มี |
| ลายเส้น | ความต่อเนื่องและน้ำหนักเส้น | BW outline ก่อน; centerline เป็นโหมดแยก | เปลี่ยนเส้นคู่เป็น stroke โดยไม่มี preview |
| พิกเซลอาร์ต | grid และสีเดิม | pixel/polygon trace, no smoothing | anti-alias หรือ fit Bézier ทับ grid |
| gradient artwork | สีเปลี่ยนอย่างต่อเนื่อง | ทดลอง gradient fitting เมื่อ adapter/renderer รองรับ | แสร้งว่า local flat-color tracing รักษา gradient ได้ครบ |
| ภาพถ่าย | ขอบสำคัญและลักษณะภาพ | เสนอ stylized vector หรือ high-detail พร้อมขนาดคาดการณ์ | สัญญาความเหมือนระดับภาพถ่ายและจำนวนเส้นต่ำพร้อมกัน |

ภาพถ่ายอาจมี **mixed vector/raster** เป็นตัวเลือกแยกพร้อมป้ายกำกับ ส่วน export “Pure vector” ต้องไม่มี embedded bitmap หรือ external raster reference

### เกณฑ์เรขาคณิต

- รักษา connected components และ holes ในบริเวณที่ล็อก; ห้าม simplify จน topology เปลี่ยนโดยไม่ให้ตรวจ
- Shared boundary ควรใช้ geometry ชุดเดียวสำหรับพื้นที่ติดกัน ตรวจรอยต่อใน renderer จริงบนพื้นหลังต่างกัน ทั้ง cutout และ stacked มี tradeoff; cutout ไม่ใช่หลักประกันว่า renderer ทุกตัวจะไม่เห็น seam
- Curve fitting ต้องรักษา corner anchors และวัด deviation ที่ความละเอียดต้นฉบับ ไม่ optimize จำนวน nodes อย่างเดียว
- รักษา alpha และป้องกันสีจาก RGB ใต้ transparent pixels ไหลเข้าขอบ; ไม่ลงพื้นหลังขาวเป็น default
- ลดเส้น/สีโดย render เทียบก่อนรับ; ปัญหา numerical precision, fill-rule, transform, clip และ nonzero viewBox origin ต้องมี fixtures
- การแก้ ROI ต้องใช้ context margin และ boundary constraints พร้อมตรวจ seam; ถ้าผสานไม่ได้ให้ reprocess parent region/full candidate ไม่แปะ crop ทับเป็นรอยต่อ

## 5. โครงสร้างข้อมูลและการเชื่อมของเดิม

คง `VectorizedElement` atomic/lockedChildren เพื่อ compatibility บน Artwork เพิ่ม optional reference ไปยัง VectorAsset ผ่าน schema migration; เอกสารเก่าที่มี SVG อย่างเดียวเปิดและ export ได้เท่าเดิม ไม่เดา recipe ย้อนหลัง

```ts
// Proposed contracts; not implementation committed to the runtime.
type VectorAssetRevision = {
  assetId: string;
  revisionId: string;
  sourceAssetId?: string; // old SVG-only documents may not have a source
  sourceRevision?: string;
  sourceHash?: string;
  svgAssetId: string;     // canonical, validated, self-contained SVG
  editableGraphAssetId?: string; // supported subset; never assumed for every SVG
  recipe?: VectorizeRecipe;
  diagnostics: VectorDiagnostics;
  editability: "full" | "palette-only" | "preserved-svg";
};

type VectorizeRecipe = {
  schemaVersion: number;
  engineId: string;
  engineVersion: string;
  intent: "faithful" | "clean" | "stylized";
  inputMode: "visible-image" | "original-file";
  normalizedInputHash: string;
  processingWidth: number;
  processingHeight: number;
  options: Record<string, unknown>;
  paletteLocks: string[];
  constraintsAssetId?: string;
};
```

เก็บไฟล์ source/SVG/graph เป็น asset side table ตาม persistence ที่มีอยู่; document เก็บ reference และ metadata กระชับ ต้องขยาย serialize/export/import และ garbage collection ให้ตาม reference รวมถึง undo history ก่อนลบ asset

SVG canonical และ editable graph ต้องมาจาก revision เดียวกัน หลังแก้ graph ให้สร้าง SVG ใหม่และตรวจ round-trip ก่อน commit; ไม่ใช้ graph ที่ parse แล้วสูญเสียข้อมูลเป็นแหล่ง export แทน SVG เดิม

UI ต้องผ่าน façade เช่น `openVectorizeSession`, `requestCandidates`, `refineCandidate`, `commitVectorRevision` โดยรายละเอียด provider, SVG normalization, memory และ cancellation อยู่ภายใน service ใช้ `processingQueue` เดิมเพื่อประสานงาน

Session state: `idle → analyzing → previewing → ready → finalizing → ready-final → committed`; ทุกช่วงมี canceled/failed และ cloud อาจมี outcome-unknown งานมี sessionId/requestId/sourceRevision; รับผลเฉพาะ request ปัจจุบัน

Cloud orchestration ใช้ job ID และ idempotency key ที่ผูก user/source/recipe/operation; cache ข้ามผู้ใช้ไม่ได้ และการยกเลิกต้องแยก “หยุดรอผล” ออกจาก “provider หยุดคิดเงินจริง” แสดงต้นทุนสูงสุดก่อนส่งเมื่อมีการคิดเงิน ไม่รัน cloud จากการขยับสไลเดอร์

## 6. คุณภาพ ความเร็ว และ export

### การจัดอันดับ

Hard gates มาก่อน: valid/safe SVG, pure-vector policy, protected regions, topology constraints, resource budget จากนั้นเก็บ candidates บน tradeoff ระหว่าง edge/color error, nodes, bytes และเวลาที่ใช้ ไม่ยุบเป็นตัวเลขคุณภาพเดียวที่บังปัญหา

เปรียบเทียบ render ด้วยขนาด พิกัด สี และ alpha เดียวกัน วัด edge distance, color error, missing protected components และความแตกต่างที่ขนาดใช้งานจริง; SSIM ใช้ประกอบ ไม่ใช้เป็นผู้ตัดสินเพียงตัวเดียว การให้เส้นน้อยต้องไม่ชนะด้วยการลบรายละเอียดทั้งหมด

การล็อกสีเปลี่ยน reference objective ตามสีที่ผู้ใช้ตั้งใจแก้ แยก intentional differences ออกจาก fidelity errors มิฉะนั้น scorer จะลงโทษการปรับที่ถูกต้อง

### Performance budget ที่ต้องพิสูจน์

ตัวเลขต่อไปนี้เป็นเป้าหมายเสนอ ไม่ใช่ผลวัด: local preview warm p95 ≤2 วินาทีสำหรับภาพด้านยาว 1,024 px บน desktop class ที่กำหนด, cancel แล้ว UI ตอบสนอง ≤150 ms, palette-only recolor p95 ≤100 ms สำหรับงานในงบ editor

ก่อนรับเป็น SLO ให้ระบุ browser/device/RAM, จำนวน pixels/nodes, cold/warm WASM และ peak memory จริง เปิด full-resolution adaptive budget ภายหลัง profiling ไม่แก้ด้วยการลบเพดาน 1,200 px ทิ้ง

หนึ่ง Worker งานหนักต่อ session, transfer buffers เมื่อทำได้, cache intermediate ตาม engine/version/input/recipe และตรวจ eviction งานสองภาพขนาดเท่ากันอาจใช้ memory ต่างกันมาก จึงต้องจำกัดทั้ง pixels, components, nodes, SVG bytes และ wall time แยกกัน

หลีกเลี่ยง trace tiles อิสระแล้วต่อภาพ เพราะเกิดเส้นขาดและสีไม่ตรง หากต้องแบ่งภาพใช้ region graph + shared boundaries และเริ่มเป็นงานวิจัยก่อน

### Export ที่เชื่อถือได้

- ระยะแรก: self-contained SVG ที่ตรงกับ preview และแก้ใน Illustrator/Inkscape ได้ตาม capability จริง
- SVG outlines สำหรับข้อความเป็น default; live text ต้องตรวจ font และให้ผู้ใช้เลือก
- sanitize ด้วย parser/allowlist, ไม่ใช้ regex เป็นตัวรับรอง SVG ทั้งฉบับ; ตัด script/events/external references และจำกัดความซับซ้อน
- SVG เดิมที่มี unsupported feature ให้ preserve เพื่อ render/export หรือแจ้งข้อจำกัด; ห้าม drop feature เงียบ ๆ
- ตรวจ save → reload → export → render เทียบทั้ง transparent, light, dark backgrounds; ID collision/defs และ transforms ต้องไม่เปลี่ยนผล
- PDF vector, CMYK/spot color และ cutting paths เป็นงานแยก ต้องมี pipeline และ compatibility fixtures ก่อนโฆษณาว่ารองรับ การมี `jspdf` อยู่ไม่ใช่หลักฐานว่า export ทั้งหมดเป็น vector

## 7. การพิสูจน์คำว่า “ดีที่สุด”

จัด corpus ที่มีสิทธิ์ใช้ 240 ภาพ: 8 กลุ่ม × 30 ภาพ ได้แก่ flat logos, Thai/Latin wordmarks, line art, icons, flat illustrations, gradient artwork, pixel art, photos แบ่งแต่ละกลุ่ม 20 สำหรับพัฒนา + 10 blind holdout และเก็บ source SVG ของภาพสังเคราะห์เพื่อเทียบ ground truth

เพิ่ม stress fixtures แยก: ภาพโปร่งใส, alpha edge, nested holes, tiny islands, hairlines, nonzero viewBox, JPEG artifacts, oversized output, malicious SVG และ canceled/stale jobs จำนวนเหล่านี้ไม่รวมใน corpus 240

Baseline คือ implementation ปัจจุบันที่ pin commit; contenders ใช้ normalized input เดียวกัน บันทึก engine/version/options/latency/bytes/nodes/cost และกรณี input ที่ provider รับไม่ได้ แยกผล default กับ tuned เพื่อไม่เอา default ของตัวหนึ่งไปแข่งค่าที่จูนอย่างหนักของอีกตัว

Blind review ให้ผู้ใช้สายออกแบบตัดสินรูปร่าง ข้อความ สี และงานแก้ไขจริง เช่น เปลี่ยนสีแบรนด์ แก้หนึ่งมุม ส่งออกและเปิดต่อ บันทึกเวลางานและความผิดพลาด ผู้ประเมินไม่เห็นชื่อเอนจิน สลับตำแหน่ง A/B และเก็บ ties

**Release gates ที่เสนอ:**

1. ทุก canonical fixture ที่รับรองต้องไม่มี missing protected component/hole, stale commit หรือ save/export regression
2. งาน cancel/undo/reload และไฟล์เก่าผ่าน integration tests; cloud retry ไม่เกิด double submission ในสถานะ outcome-unknown
3. Pure-vector exports ผ่าน structural audit และ SVG round-trip ใน browser กับ Inkscape; Illustrator ตรวจด้วย release checklist บนเครื่องที่มีสิทธิ์ใช้
4. เป้าหมาย preference win ≥65% เมื่อเทียบ baseline บน blind holdout พร้อมรายงาน ties และช่วงความเชื่อมั่นแบบ cluster ตามภาพ; ห้ามรวมคะแนนซ่อนการถดถอยใน wordmarks/โลโก้
5. ผ่าน performance budget ที่ประกาศพร้อมเครื่องทดสอบ; หาก fail ให้คงของเดิมและเปิดใช้เฉพาะกลุ่มที่ผ่าน

Threshold เหล่านี้เป็น launch criteria เสนอที่ต้อง calibrate ด้วย pilot ไม่ใช่หลักฐานว่าระบบชนะผลิตภัณฑ์ทุกตัวในตลาด

## 8. ลำดับสร้างที่ส่งมอบได้

| ระยะ | งานหลัก | เกณฑ์จบ |
|---|---|---|
| 0 — วัดของเดิม | Corpus, pinned baseline, render/structure metrics, engine bake-off | มีรายงานรายกลุ่ม เลือก cloud contender ด้วยหลักฐาน |
| 1 — Studio ใช้งานได้ | หน้าจอเดียว, source snapshot, local candidate, compare/outline, cancel, final inspection, atomic commit, reopen metadata | เลือกภาพ → ตรวจ → ใช้ → undo/reload ได้ครบ โดยไม่ทำลายสัญญาไฟล์เก่า |
| 2 — คุณภาพ local | Recipe calibration, palette locks/recolor, topology checks, progressive candidates, profiling/adaptive resolution | ชนะ baseline ตามกลุ่มเป้าหมายและผ่าน performance gate |
| 3 — Cloud quality | รวม Recraft เดิมใน session; เพิ่มผู้ชนะ bake-off หากคุ้ม, cost/consent/job handling | ผลผ่าน validator เดียวกัน, ไม่มีการส่งซ้ำ/คิดเงินซ้ำ |
| 4 — แก้ละเอียด | Editable graph subset, region edits, boundary-aware retrace, diagnostics overlay | แก้เฉพาะส่วนได้จริงและส่วนที่ล็อกไม่เปลี่ยน |
| 5 — งานมืออาชีพ | Batch recipes + exception queue, export presets, gradient/centerline ที่พิสูจน์แล้ว | ผ่านไฟล์จริงของงานปลายทาง ไม่ใช้เพียง demo สวย |

ยังไม่ให้วันส่งมอบก่อน phase 0 และ graph-import spike เพราะความครบของ SVG importer, ความเข้ากันได้ของ export และค่าใช้จ่าย cloud เป็นตัวกำหนดขนาดงานหลัก

### จุดแก้ใน repository

- ใหม่ `components/VectorizeStudio/`: shell, viewport, compare controls, palette, diagnostics; reuse chrome/interaction conventions จาก Raster Studio
- ใหม่ `lib/vectorize/session/`: source snapshots, session history, candidates, commit/reopen
- ใหม่ `lib/vectorize/engines/`: capability adapters และ provider-independent request/result contract
- ใหม่ `lib/vectorize/quality/`: SVG validation, round-trip render, topology/edge checks, budget evaluation
- เดิม `VisionObjectIsolator.tsx`: เปลี่ยนทางเข้า vectorize ให้เปิด session และทยอยย้าย handlers เดิม
- เดิม `atomicVectorize.ts`, `types.ts`, `serialize.ts`, `persist.ts`, `exportSVG.ts`: asset references, migration, rendering/export consistency; ไม่เปิด ungroup โดย default
- เดิม `vectorizer.ts`, `vtracerRuntime.ts`, `vectorizerBackend.ts`: reuse tracing, เพิ่ม capability/budget/cancellation instrumentation ตามที่พิสูจน์แล้ว
- เดิม `app/api/vectorize/recraft/route.ts`: เชื่อม session/job semantics พร้อมคง credit/consent/outcome-unknown policy

ทดสอบตามพฤติกรรมสำคัญ: round-trip/topology/placement/atomic history/stale jobs/export compatibility และทดสอบ E2E เส้นทางหลัก; ไม่สร้าง unit test ของทุกสไลเดอร์ที่เพียงซ้ำ implementation

## 9. สิ่งที่ผู้ใช้จะรับรู้ได้

เปิดภาพแล้วได้ผลแนะนำที่ตรวจได้ทันที รู้ว่าตรงไหนเสียรายละเอียด แก้สีหรือเส้นเฉพาะส่วนได้ ไม่ต้องเดาเอนจินหรือรื้อ Artwork เป็นพันชิ้น และไฟล์ที่ดาวน์โหลดต้องตรงกับสิ่งที่ตรวจบนจอ นี่คือเกณฑ์ที่ ArtShift ควรใช้ตัดสินทุกการลงทุนใน Vectorize
