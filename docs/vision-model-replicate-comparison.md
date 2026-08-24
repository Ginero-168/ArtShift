# เปรียบเทียบ Vision Model ผ่าน Replicate

วันที่ตรวจสอบ: 24 สิงหาคม 2026
ขอบเขต: ตรวจ slug ที่ผู้ระบุโดยตรง คือ `openai/gpt-4o-mini` และ `google/gemini-3-flash` บน Replicate พร้อมเทียบเอกสารต้นทางของ OpenAI และ Google

## สรุปสั้น

ทั้งสอง slug มีหน้า Official Model บน Replicate และใช้งานผ่าน API ได้จริง แต่เหมาะเป็น **Semantic Vision / Object Proposal** ไม่ใช่ตัวสร้าง Pixel Mask สุดท้าย

คำแนะนำสำหรับ ArtShift:

- ใช้ `google/gemini-3-flash` เป็นผู้ทดสอบหลักสำหรับภาพ collage ที่มี Object หลายชิ้น ชิ้นส่วนเล็ก และความสัมพันธ์แบบ “หลอดเป็นส่วนหนึ่งของแก้ว”
- ใช้ `openai/gpt-4o-mini` เป็น baseline ราคาประหยัดสำหรับ Chat, Caption, OCR-style description, ตั้งชื่อ และ proposal ที่ไม่ซับซ้อน
- อย่าใช้โมเดลใดเป็นตัว Extract ภาพจากกรอบโดยตรง ให้คืน `ObjectProposal[]` แล้วส่งต่อให้ Local SAM/RMBG/Alpha Components/Watershed สร้าง Mask จริง
- ตามนโยบายปัจจุบันของ ArtShift ให้ทั้งสองตัวเป็น `Fast · Cloud Vision Assist` แบบ Opt-in เท่านั้น ไม่แทนที่ Local ของ `Remove BG`, `Extract` และ `AI Image Tools`

## ตรวจ slug และ version

| รายการ | ผลตรวจ ณ 2026-08-24 | ความกำกวมที่ต้องระวัง |
|---|---|---|
| `openai/gpt-4o-mini` | มีหน้า Official Model และ endpoint ของ Replicate | OpenAI มี alias `gpt-4o-mini` และ snapshot `gpt-4o-mini-2024-07-18`; Replicate มีหน้า version ที่ตรวจพบ hash `7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d` แต่ควร resolve `latest_version` ผ่าน API ก่อน pin production |
| `google/gemini-3-flash` | มีหน้า Official Model และ endpoint ของ Replicate | Google ใช้ native model ID `gemini-3-flash-preview`; slug บน Replicate เป็น alias ที่ห่อรุ่นนี้ และเป็น Preview จึงควร pin version hash. หน้าที่ตรวจพบมี hash `e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b` |

แหล่งตรวจ: [Replicate GPT-4o mini](https://replicate.com/openai/gpt-4o-mini), [GPT-4o mini schema](https://replicate.com/openai/gpt-4o-mini/api/schema), [GPT-4o mini version](https://replicate.com/openai/gpt-4o-mini/versions/7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d/api), [OpenAI GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini), [Replicate Gemini 3 Flash](https://replicate.com/google/gemini-3-flash), [Gemini schema](https://replicate.com/google/gemini-3-flash/api/schema), [Gemini version](https://replicate.com/google/gemini-3-flash/versions/e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b/api), [Google Gemini 3 Flash Preview](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview)

> Hash ที่ระบุเป็น version page ที่ตรวจพบ ไม่ควรถือว่าเป็น latest alias โดยอัตโนมัติ การทำ production ควรอ่าน version ปัจจุบันจาก Replicate API แล้วบันทึก hash คู่กับ benchmark

## ตารางเปรียบเทียบ

| หัวข้อ | `openai/gpt-4o-mini` ผ่าน Replicate | `google/gemini-3-flash` ผ่าน Replicate | ผลต่อ ArtShift |
|---|---|---|---|
| ตำแหน่งของโมเดล | โมเดล multimodal ขนาดเล็ก เน้นเร็วและประหยัด | โมเดล Flash multimodal ที่เน้น reasoning และภาพซับซ้อน | Gemini เหมาะเป็น quality candidate; GPT เหมาะเป็น cost baseline |
| Input ที่ wrapper เปิด | `prompt`, `system_prompt`, `messages`, `image_input`, sampling และ `max_completion_tokens` | `prompt`, `images`, `system_instruction`, `thinking_level`, sampling และ `max_output_tokens` | ต้องมี provider adapter แยกกัน ห้ามผูก UI เข้ากับ field ของผู้ให้บริการรายใดรายหนึ่ง |
| รูปภาพ | schema เปิด `image_input` แต่ไม่ระบุเพดานจำนวน/ขนาดต่อภาพ | สูงสุด 10 ภาพ ภาพละไม่เกิน 7 MB ตาม schema ที่เผยแพร่ | สำหรับ ArtShift ให้ส่ง preview เดียวก่อน แล้วค่อยส่ง crop เฉพาะจุดที่ต้องตรวจซ้ำ |
| การส่งไฟล์ | Replicate รองรับ URL, ไฟล์ที่ client อัปโหลด และ data URL | ใช้กติกาไฟล์ของ Replicate เช่นเดียวกัน | data URL เหมาะกับไฟล์เล็ก; ภาพใหญ่ควร resize/upload ผ่าน server route |
| Output ของ Replicate | schema เป็น `string[]` | schema เป็น `string[]` | แม้ prompt ให้ JSON ก็ต้อง parse, validate และ reject ผลลัพธ์ที่ผิด schema |
| Structured Output ต้นทาง | OpenAI ระบุว่ารองรับ Structured Outputs และ Function Calling | Google ระบุว่ารุ่น Preview รองรับ Structured Outputs และ Function Calling | ความสามารถต้นทางไม่ได้แปลว่า wrapper บน Replicate เปิด field เดียวกัน; schema ของ Replicate ที่ตรวจไม่แสดง `response_format`, `tools` หรือ JSON schema |
| การควบคุม reasoning | Replicate schema ไม่เปิด reasoning level | เปิด `thinking_level`: `none`, `low`, `high` | ใช้ `none`/`low` สำหรับ interactive proposal; `high` เฉพาะภาพยากและยอมรับ latency/cost ที่สูงขึ้น |
| Context / output ต้นทาง | OpenAI ระบุ 128K context และสูงสุด 16,384 output tokens | Google ระบุ 1,048,576 input และ 65,536 output tokens สำหรับ Preview; Replicate เปิดสูงสุด 65,535 | contract ที่ ArtShift ต้องยึดคือ schema ของ Replicate ไม่ใช่ API ต้นทาง |
| ราคา Replicate | $0.15 / 1M input tokens; $0.60 / 1M output tokens | $0.50 / 1M input tokens; $3.00 / 1M output tokens | GPT ถูกกว่าประมาณ 3.3 เท่าด้าน input และ 5 เท่าด้าน output ตามราคาหน้าโมเดล |
| Latency | Replicate ระบุว่าเป็นโมเดล low-latency แต่ไม่มี p50/p95 เทียบกับ Gemini | Replicate ระบุว่าออกแบบเพื่อ speed แต่ไม่มี p50/p95 ที่เทียบกับ GPT | ต้องวัดเองโดยรวม upload, queue, model, streaming และ parse; ตัวเลขจากหน้าโมเดลไม่ใช่ end-to-end ของ ArtShift |
| Privacy | หน้าโมเดลระบุว่า input/output ไม่ถูก retain และไม่ใช้ train | หน้าโมเดลระบุเช่นเดียวกัน | ภาพยังออกนอกเครื่องไปยัง Replicate; ต้องมี cloud consent และ data policy ของ ArtShift |
| Commercial | ต้องปฏิบัติตาม Replicate terms และ OpenAI terms ที่เกี่ยวข้อง | ต้องปฏิบัติตาม Replicate terms และ Google Gemini terms; Preview มีความเสี่ยงด้านการเปลี่ยนแปลง | ก่อน commercial launch ต้องตรวจ terms, DPA/retention, consent และ fallback ของ Preview |

แหล่งหลัก: [Replicate GPT schema](https://replicate.com/openai/gpt-4o-mini/api/schema), [Replicate GPT page](https://replicate.com/openai/gpt-4o-mini), [Replicate Gemini schema](https://replicate.com/google/gemini-3-flash/api/schema), [Replicate Gemini page](https://replicate.com/google/gemini-3-flash), [OpenAI model capabilities/pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini), [Google model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

## ความสามารถที่เหมาะกับ ArtShift

### เหมาะ: Semantic Proposal

ทั้งสองโมเดลเหมาะกับการเสนอข้อมูลต่อไปนี้:

- ชื่อและประเภทของ Object
- Caption และคำอธิบายภาพ
- OCR-style description หรือข้อความบนวัตถุ
- Bounding box แบบหยาบ หากกำหนดให้คืนพิกัด normalized `0..1`
- ความสัมพันธ์ระหว่าง Object และ Part เช่น “หลอดเป็นส่วนหนึ่งของแก้ว”
- การค้นหาวัตถุที่ Florence-2 หรือ Alpha Components อาจตกหล่น

Gemini 3 Flash ควรได้เปรียบในภาพที่มี Object จำนวนมากและต้องให้เหตุผลเรื่องส่วนประกอบ แต่ข้อสรุปนี้เป็นการเลือกจาก published capability/positioning ไม่ใช่ benchmark บนภาพจริงของ ArtShift จึงต้องทดสอบก่อนตัดสินใจถาวร

GPT-4o mini เหมาะกับงานที่ซ้ำจำนวนมากและไม่ต้องใช้ reasoning ลึก เช่น ตั้งชื่อ, tag, caption, OCR-style summary และถาม-ตอบภาพทั่วไป

### ไม่เหมาะ: Final Pixel Mask

ไม่มี schema ใดของสอง wrapper นี้ที่คืน alpha matte, binary mask, polygon mask หรือ transparent cutout โดยตรง ดังนั้นโมเดลอาจเสนอกรอบได้ แต่ไม่รับประกันว่าจะ:

- เก็บหลอดหรือชิ้นส่วนบางไว้ครบ
- แยกวัตถุที่สีติดกันได้ถูกต้อง
- รู้ว่า Object ที่อยู่ใกล้กันเป็นชิ้นเดียวหรือหลายชิ้น
- คืนพิกัดที่ตรงกับภาพต้นฉบับหลังการ resize

ปัญหา “กรอบเปล่า”, “หลอดหาย” และ “วัตถุติดกัน” จึงต้องแก้ด้วย local mask stage ไม่ใช่เปลี่ยน VLM อย่างเดียว

## รูปแบบ pipeline ที่แนะนำ

```text
Cloud VLM (optional)
  -> label / normalized box / parts / relationship / confidence

Local Extract All
  -> proposal-guided SAM/RMBG/Alpha Components
  -> Watershed split + Mask Preview
  -> merge ชิ้นส่วนที่เป็นเจ้าของเดียวกัน เช่น แก้ว + หลอด
  -> transparent asset + undo transaction
```

สัญญากลางที่ควรใช้ระหว่าง provider กับ local pipeline:

```json
{
  "objects": [
    {
      "id": "obj-1",
      "label": "cup",
      "box": [0.12, 0.20, 0.18, 0.42],
      "parts": [
        {
          "label": "straw",
          "box": [0.18, 0.12, 0.03, 0.18],
          "attachTo": "obj-1"
        }
      ],
      "confidence": 0.86
    }
  ]
}
```

ทุก field ต้องถือว่า untrusted: parse JSON, ตรวจชนิดข้อมูล, clamp พิกัด, reject box ผิดรูป, deduplicate proposal และให้ local segmentation เป็นผู้ตัดสิน pixel สุดท้าย `parts.attachTo` ควรเป็น seed สำหรับการรวม mask เท่านั้น ไม่ใช่คำสั่งให้สร้างภาพจากกรอบทันที

## ความปลอดภัยและการใช้งานเชิงพาณิชย์

- Replicate API token เป็น secret ต้องเก็บใน server environment หรือ secret manager ห้ามฝังใน Browser หรือ bundle ของ Next.js
- Replicate รองรับ URL, local upload และ data URL; generic API guide แนะนำ data URL สำหรับไฟล์เล็กประมาณไม่เกิน 256 KB และ input-file guide แนะนำต่ำกว่า 1 MB
- Prediction ที่สร้างผ่าน API มี input, output และ log ถูกลบอัตโนมัติโดยค่าเริ่มต้นหลังประมาณ 1 ชั่วโมง; ต้องตรวจ policy และเงื่อนไขบัญชีจริงก่อนนำข้อมูลละเอียดอ่อนมาใช้
- หน้า Official Model ระบุ zero training/no retention แต่ ArtShift ยังต้องแจ้งผู้ใช้ว่าภาพถูกส่งออกนอกเครื่อง
- ต้องตรวจ Replicate Terms, OpenAI terms หรือ Google Gemini terms, DPA, retention, user consent และข้อกำหนด commercial usage ก่อนเปิด Fast Cloud ให้ผู้ใช้ทั่วไป

แหล่งหลัก: [Replicate API token security](https://replicate.com/docs/topics/security/api-tokens/), [Replicate input files](https://replicate.com/docs/topics/predictions/input-files), [Replicate data retention](https://replicate.com/docs/topics/predictions/data-retention/), [Replicate run/cold boot](https://replicate.com/docs/topics/models/run-a-model/)

## แผนทดสอบก่อนเลือกโมเดล

ใช้ภาพชุดเดียวกัน 20–30 ภาพ รวมภาพ collage ที่มีแก้ว/หลอด, handles, straps, rings, ตัวหนังสือ, shadow และวัตถุสีใกล้กัน แล้วบันทึก:

1. **Object recall:** จำนวน Object ที่ควรพบเทียบกับที่เสนอได้
2. **Thin-part recall:** หลอด, หูแก้ว, สาย, ห่วง และชิ้นส่วนที่แยกจากลำตัว
3. **False positive:** ตัวหนังสือพื้นหลัง, เงา, ลายตกแต่ง และขอบเฟรม
4. **Proposal quality:** IoU ของ box และอัตรา JSON ผิด schema
5. **End-to-end quality:** คุณภาพ Mask หลัง local refinement ไม่ใช่ดูแค่ box
6. **Latency:** แยก upload, queue/start, inference, stream และ parse เป็น p50/p95
7. **Cost:** input/output tokens และ USD ต่อภาพ

การตั้งต้นที่แนะนำ:

- Gemini: `thinking_level: "low"` สำหรับภาพยาก
- GPT: ใช้เป็น cost baseline โดยจำกัด output ให้สั้น
- ให้ทั้งสองคืน normalized coordinates และ `parts.attachTo`
- ส่งทุก proposal เข้า local mask/refinement
- บันทึก Replicate version hash, prompt version และ preview dimensions ใน benchmark

## คำตัดสิน

| เป้าหมาย | ตัวเลือกแนะนำ |
|---|---|
| Vision Assistant และภาพ collage ซับซ้อน | `google/gemini-3-flash` |
| Caption, label, OCR-style summary ราคาประหยัด | `openai/gpt-4o-mini` |
| Extract All ที่ต้องการ mask โปร่งใสจริง | Local SAM/RMBG/Alpha Components/Watershed |
| โหมด default ของ ArtShift | Local/Eco |
| โหมด Cloud ในอนาคต | `Fast · Cloud Vision Assist` แบบ opt-in ผ่าน server proxy |

**ข้อเสนอสุดท้าย:** ยังไม่ควรเปลี่ยน Extract All ไปใช้ Vision API ตัวใดโดยตรง ขั้นต่อไปที่คุ้มค่าคือสร้าง benchmark fixture และ provider adapter แล้วใช้ Gemini/GPT เป็น semantic proposal โดยให้ local pipeline รับผิดชอบ segmentation, ownership merge, thin-part recovery และ export ทั้งหมด

## เอกสารอ้างอิง

- [Replicate model pricing](https://replicate.com/pricing)
- [Replicate GPT-4o mini](https://replicate.com/openai/gpt-4o-mini)
- [Replicate GPT-4o mini schema](https://replicate.com/openai/gpt-4o-mini/api/schema)
- [Replicate Gemini 3 Flash](https://replicate.com/google/gemini-3-flash)
- [Replicate Gemini 3 Flash schema](https://replicate.com/google/gemini-3-flash/api/schema)
- [OpenAI GPT-4o mini model](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- [OpenAI images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Google Gemini 3 Flash Preview model](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview)
- [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Google Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)

## ประมาณการค่าใช้จ่าย

คำนวณจากราคาที่ Replicate แสดง โดยสมมติว่า image + prompt ถูกนับเป็น input tokens ตาม usage จริง และยังไม่รวม VAT, ค่าโฮสต์ proxy หรือ network:

| รูปแบบการเรียก | สมมติ input/output ต่อครั้ง | GPT-4o mini / 1,000 ครั้ง | Gemini 3 Flash / 1,000 ครั้ง |
|---|---:|---:|---:|
| Preview เบา | 2K / 0.5K tokens | ~$0.60 | ~$2.50 |
| วิเคราะห์ภาพทั่วไป | 5K / 1K tokens | ~$1.35 | ~$5.50 |
| ภาพ collage/ใช้ reasoning | 15K / 2K tokens | ~$3.45 | ~$13.50 |

สูตรคือ `input_tokens × input_price + output_tokens × output_price`. จำนวน token ของภาพขึ้นกับ resolution/detail และต้องอ่านจาก `usage` ของ prediction จริง; Google ยืนยันว่า image files ถูก tokenized เช่นเดียวกับ text ดังนั้นตารางนี้เป็น planning range ไม่ใช่ใบเรียกเก็บเงินคงที่.
