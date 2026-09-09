# GPT Image on Replicate: evaluation for ArtShift generation and editing

สถานะ: **Prototype recommendation**

ตรวจสอบเมื่อ: **2026-09-09 UTC**

ขอบเขต: `openai/gpt-image-2`, `openai/gpt-image-2.5-flare`, `openai/gpt-image-2.5-sunburst` บน Replicate

เอกสารนี้แยกข้อเท็จจริงจาก provider ออกจากข้อเสนอของ ArtShift ข้อมูลรุ่น, schema และราคาอาจเปลี่ยนได้ จึงต้องตรวจซ้ำก่อนเปิด production ส่วนผลคุณภาพ ภาษาไทย ความเร็ว และความเที่ยงตรงในการ edit ยังไม่ได้ทดสอบด้วย live paid calls ในรอบนี้

แผนพัฒนาอยู่ที่ [GPT Image generation and editing orchestration plan](../plans/gpt-image-generation-edit-orchestration-plan.md)

## Executive finding

ใช้ทั้งสามรุ่นผ่าน semantic routing เดียว:

- `gpt-image-2` เป็น baseline สำหรับการสร้างภาพทั่วไปที่ `medium` และขยับเป็น `high` เมื่อ brief มีรายละเอียดมากขึ้นแต่ยังไม่ต้องใช้จุดเด่นของ 2.5
- `gpt-image-2.5-flare` เป็น candidate สำหรับงานสร้างหรือแก้ไขประจำวันที่ต้องตอบเร็ว สร้างหลายแบบ มีข้อความหนาแน่น หรือมีความซับซ้อนสูง
- `gpt-image-2.5-sunburst` เป็น candidate สำหรับ edit ที่การรักษาใบหน้า สินค้า โลโก้ มุมกล้อง layout หรือส่วนที่ผู้ใช้ห้ามเปลี่ยนมีความสำคัญสูง

คำว่า “fastest” และ “most capable” เป็น positioning ของ Replicate/OpenAI บนหน้ารุ่น ยังไม่ใช่ผล benchmark ของ ArtShift ทั้ง Flare และ Sunburst ถูกเผยแพร่บน Replicate เมื่อ 2026-09-08 และใหม่มาก ณ วันที่ตรวจ จึงควรอยู่สถานะ prototype จนผ่าน blinded evaluation, edit-preservation tests และ canary

## Candidate classification

การเพิ่มสองรุ่นเป็น **existing-adapter expansion plus a new domain routing seam**:

- Replicate adapter, prediction polling, data URL conversion และ `input_images` มีอยู่แล้ว
- Runtime รองรับ task เดียวคือ `image.generate`; การมี `inputImages` ไม่ได้ทำให้ระบบรู้ว่าเป็น edit, compose หรือ iteration อย่างชัดเจน
- Adapter ยอมรับเฉพาะ slug `openai/gpt-image-2`
- Model manifest มี route/alias สำหรับ GPT Image 2 เพียงตัวเดียว
- Contract quality รองรับเฉพาะ `low | medium | high` ขณะที่รุ่น 2.5 เพิ่ม `xhigh | max | auto`
- Creative Director เลือกได้เพียง `image-gpt-2` แม้จะจำแนก specialist เป็น generator/editor แล้ว

ดังนั้นการเปลี่ยน model string ไม่พอ ระบบต้องเพิ่ม `ImageWorkSpec`, routing policy, model capability registry, edit lifecycle และ preservation review

หลักฐานในโค้ด:

- `lib/ai-runtime/contracts.ts` — `AiImageGenerateInput` ไม่มี operation, edit target, invariants หรือ lineage
- `lib/server/ai/adapters/replicateAdapter.ts` — ส่ง `input_images` ได้ แต่ reject slug อื่น
- `lib/server/ai/modelManifest.ts` — `image.generate` มี route เดียวและผูก alias `image-gpt-2`
- `lib/ai/orchestration/creativeDirector.ts` — schema อนุญาต model alias เดียว
- `lib/ai/orchestration/imageQualityPolicy.ts` — ค่าเริ่มต้นปัจจุบันเป็น `high` ซึ่งขัดกับ requirement ใหม่ที่ให้ general generation ใช้ `medium`
- `lib/server/ai/userCredentials.ts` — preflight ตรวจเฉพาะ endpoint ของ GPT Image 2

## Verified provider capabilities

| ด้าน | GPT Image 2 | GPT Image 2.5 Flare | GPT Image 2.5 Sunburst |
|---|---|---|---|
| Provider positioning | สร้างและแก้ภาพ คุณภาพสูง ทำตามคำสั่งและข้อความได้ดี | รุ่นเร็วที่สุดสำหรับ generation/editing รายวันและงานปริมาณมาก | รุ่นที่เก่งที่สุดสำหรับงานที่ต้องการ editing precision และ detailed control |
| Text-to-image | รองรับ | รองรับ | รองรับ |
| Image editing | รองรับ `input_images` หนึ่งหรือหลายภาพ | รองรับ `input_images` หนึ่งหรือหลายภาพ | รองรับ `input_images` หนึ่งหรือหลายภาพ |
| Provider quality values | `low`, `medium`, `high`, `auto` | `low`, `medium`, `high`, `xhigh`, `max`, `auto` | `low`, `medium`, `high`, `xhigh`, `max`, `auto` |
| Output count | 1–10 | 1–10 | 1–10 |
| Output formats | PNG, JPEG, WebP | PNG, JPEG, WebP | PNG, JPEG, WebP |
| Background schema | current API schema แสดง `auto`, `transparent`, `opaque` | `auto`, `transparent`, `opaque` | `auto`, `transparent`, `opaque` |
| Suggested ArtShift role | general baseline | fast/everyday/variant specialist | precision-edit/final specialist |
| Evidence maturity in ArtShift | adapter path มีอยู่และมี tests | ยังไม่มี adapter fixtures หรือ live results | ยังไม่มี adapter fixtures หรือ live results |

แหล่งข้อมูลทางการ:

- [GPT Image 2 model page](https://replicate.com/openai/gpt-image-2) และ [API schema](https://replicate.com/openai/gpt-image-2/api/schema)
- [GPT Image 2.5 Flare model page](https://replicate.com/openai/gpt-image-2.5-flare), [README](https://replicate.com/openai/gpt-image-2.5-flare/readme) และ [API schema](https://replicate.com/openai/gpt-image-2.5-flare/api/schema)
- [GPT Image 2.5 Sunburst model page](https://replicate.com/openai/gpt-image-2.5-sunburst), [README](https://replicate.com/openai/gpt-image-2.5-sunburst/readme) และ [API schema](https://replicate.com/openai/gpt-image-2.5-sunburst/api/schema)

## Practical fit by model

### `openai/gpt-image-2`

เหมาะกับ default path เพราะ ArtShift integrate อยู่แล้วและ schema ครอบคลุมทั้ง generate/edit ข้อเสนอคือเปลี่ยนค่าเริ่มต้นของงานสร้างทั่วไปจาก `high` เป็น `medium` ตาม product requirement แล้วเลือก `high` เมื่อ structured brief มีข้อกำหนดมากขึ้น งานมีข้อความ/องค์ประกอบซับซ้อน หรือเป็น final asset

จุดจำกัดใน ArtShift ปัจจุบันเกิดจาก orchestration มากกว่าความสามารถของรุ่น: ระบบส่ง reference ได้ แต่ไม่มี edit contract ที่ระบุ base artifact, สิ่งที่แก้ได้, สิ่งที่ห้ามเปลี่ยน และการตรวจ preservation ดังนั้นผู้ใช้จึงยังไม่ได้รับประสบการณ์ “แก้ภาพนี้เฉพาะจุด” ที่เชื่อถือได้

### `openai/gpt-image-2.5-flare`

เหมาะกับ fast lane หลังผ่าน benchmark: iteration สั้น ๆ, variant หลายแบบ, simple-to-complex everyday edits, marketing asset, UI/infographic หรือภาพที่มีข้อความ Flare ควรเป็น edit default เมื่อ precision risk ไม่สูง เพราะ provider วางตำแหน่งเป็นรุ่นที่เร็วที่สุดสำหรับงานประเภทนี้

ArtShift ต้องวัด latency ด้วย input/quality/output เดียวกัน ห้ามใช้เวลาจากตัวอย่างแต่ละหน้ามาเปรียบเทียบ เพราะตัวอย่างใช้ prompt และ quality ต่างกัน

### `openai/gpt-image-2.5-sunburst`

เหมาะกับ precision lane: รักษา likeness/character, product/package/logo, camera angle, composition, lighting, exact placement, text replacement และ iterative edit ที่ต้องคงส่วนเดิมให้มากที่สุด เริ่มที่ `high`; ใช้ `xhigh` กับ final/critical asset หรือหลัง quality gate พบข้อบกพร่องที่สัมพันธ์กับ fidelity; `max` เป็นขั้นสุดท้ายที่ต้องมีเหตุผล ไม่ใช่ default

Sunburst ยังเป็น generative editor ไม่ใช่ deterministic pixel editor หากผู้ใช้ต้องการเปลี่ยนเฉพาะพื้นที่แบบ pixel-perfect ระบบควรใช้ mask/compositing หรือ local deterministic tool เมื่อมี โดยไม่อ้างว่าการเพิ่ม quality รับประกันส่วนที่ไม่แก้จะเหมือนเดิมทุกพิกเซล

## Provider economics

ราคา per image ที่แสดงบนหน้ารุ่นเมื่อวันที่ตรวจ:

| Quality | GPT Image 2 | Flare | Sunburst |
|---|---:|---:|---:|
| low | $0.012 | $0.012 | $0.012 |
| medium | $0.047 | $0.047 | $0.047 |
| high | $0.128 | $0.128 | $0.128 |
| xhigh | ไม่อยู่ใน schema ที่ตรวจ | $0.250 | $0.250 |
| max | ไม่อยู่ใน schema ที่ตรวจ | $0.500 | $0.500 |

ArtShift ให้คุณภาพเป็นเกณฑ์หลักตาม product direction แต่ยังต้องบันทึกราคาเพื่ออธิบาย retry amplification, ตั้ง concurrency และตรวจความผิดปกติ ไม่ควรใช้ cost ceiling เดิมตัดงาน precision โดยอัตโนมัติ

## Current ArtShift path and gap

```text
AI Assistance / Image Modal
  → Creative Director: IMAGE_DEFAULT or IMAGE_EDIT
  → modelAlias: image-gpt-2
  → image.generate contract
  → Replicate adapter
  → prompt + optional input_images
  → first returned output
```

ช่องว่างที่มีผลต่อผู้ใช้:

1. `input_images` เป็น optional field ของ generation request แทนที่จะเป็น explicit edit operation
2. ไม่มี durable reference ไปยัง base artifact/version ผู้ใช้จึงสั่ง “แก้รูปก่อนหน้า” แล้ว target อาจคลุมเครือ
3. ไม่มี mutable/immutable constraints จึงตรวจไม่ได้ว่ารุ่นเปลี่ยนสิ่งที่ผู้ใช้ห้ามเปลี่ยนหรือไม่
4. ไม่มี route decision ที่ใช้ task features และ attempt history
5. quality policy ใช้ prompt keyword/task class แบบหยาบและ default เป็น high
6. technical success ถูกตีความได้ว่าเป็น task success แม้ edit ไม่ตรงหรือทำส่วนอื่นเสีย
7. retry ไม่มี model escalation contract ที่บอกเหตุผลและป้องกันการทำซ้ำแบบเดิม
8. adapter เก็บ prediction lifecycle แต่ domain ยังต้องรับประกันว่า outcome-unknown จะ poll prediction เดิมก่อนสร้างงานใหม่
9. `quality` ถูกใช้ทั้งความหมาย execution profile ของ runtime และ render quality ของ provider ทำให้อ่านและตั้งค่าผิดได้ง่าย

## Adoption risks and required probes

| ความเสี่ยง | Probe ก่อน rollout |
|---|---|
| สองรุ่น 2.5 ใหม่มากและ vendor claims ยังไม่ยืนยันใน ArtShift | blinded side-by-side benchmark อย่างน้อย 120 cases และ canary |
| edit เปลี่ยน identity/layout/โลโก้ส่วนที่ห้ามเปลี่ยน | preservation suite พร้อม reference, invariants และ human review |
| exact text ดูคมแต่สะกดผิด | OCR comparison แบบ normalized และ visual review |
| quality สูงขึ้นแต่ไม่ได้แก้ failure mode | reason-coded escalation; เปรียบเทียบ same prompt/model across tiers |
| transparent background behavior ไม่สม่ำเสมอ | alpha-channel fixtures แยกตาม model/format; ยังไม่ expose จนผ่าน |
| schema/provider drift | startup/preflight schema probes และ contract fixture ต่อ model |
| model fallback ทำให้ edit fidelity ลดโดยไม่บอกผู้ใช้ | capability-safe fallback; critical edit รอ retry แทน silent downgrade |
| หลาย output ใน prediction เดียวทำ lineage/retry ยาก | เริ่ม `number_of_images: 1`; batch หลังพิสูจน์ partial-result semantics |

## Required evaluation set

อย่างน้อย 120 cases แบ่งเป็น:

| กลุ่ม | จำนวนขั้นต่ำ | เกณฑ์สำคัญ |
|---|---:|---|
| General generation, Thai/English | 20 | intent, composition, artifact integrity |
| Detail-rich generation | 20 | constraint retention, visual coherence |
| Exact text/marketing/UI/infographic | 15 | OCR exactness, layout, legibility |
| Simple everyday edits | 15 | requested delta, unrelated-change rate |
| Face/character consistency | 10 | identity preservation |
| Product/logo/package/camera preservation | 15 | geometry, branding, view preservation |
| Multi-reference composition/style | 10 | reference role correctness |
| Iterative edits 2–4 turns | 10 | lineage, cumulative drift |
| Failure/timeout/outcome-unknown | 5 | no duplicate prediction, correct recovery |

สำหรับแต่ละ case ให้รันเฉพาะ route ที่มีเหตุผลทางผลิตภัณฑ์ ไม่จำเป็นต้องยิงทุก quality ทุกรุ่น เก็บ prompt hash, model/version, quality, prediction ID, seed ถ้ามี, latency, provider metrics, route reason, technical gate, semantic score, preservation score และ human preference โดยไม่เก็บ API key หรือ raw private asset ใน log

## Recommendation boundary

1. **Adopt now as policy baseline:** GPT Image 2 / medium สำหรับ general generation และ explicit high route สำหรับ detail-rich generation
2. **Prototype:** Flare เป็น fast/everyday generate-edit lane
3. **Prototype:** Sunburst เป็น precision/final edit lane
4. **Defer:** automatic `max`, provider batch 2–10 outputs, transparent background promotion และ silent cross-model fallback จนมีหลักฐาน

การเปิดใช้สองรุ่นใหม่ใน production ต้องผ่าน adapter contract tests, model-specific schema probes, image benchmark และ canary ก่อน การมีหน้า public และ API schemaยืนยันว่าเรียกได้ แต่ไม่ยืนยันว่าดีกว่า baseline ใน workload ของ ArtShift
