# Gemini 2.5 Flash evaluation for ArtShift Orchestrator

ตรวจสอบเมื่อ 2026-09-09 UTC จากเอกสารผู้ให้บริการและโค้ด ArtShift ที่ commit `653216f` เอกสารนี้เก็บข้อมูลที่เปลี่ยนตามเวลา ส่วนแผนย้ายระบบอยู่ที่ [Gemini 2.5 Flash Orchestrator migration plan](/opt/artshift/docs/plans/gemini-2.5-flash-orchestrator-migration.md)

ยังไม่ได้เรียก provider จริงหรือส่ง prompt/ภาพของผู้ใช้ในการประเมินนี้ ข้อสรุปด้านคุณภาพภาษาไทย ความถูกต้องในการเลือกเครื่องมือ และ latency เป็นสมมติฐานที่ต้องวัดกับ ArtShift

## Classification

การย้ายนี้เป็น **existing-adapter route change ที่ต้องขยาย adapter**

- ArtShift มี `GoogleAiAdapter` และ route ของ Google อยู่แล้วสำหรับ Vision กับ prompt enhancement
- Adapter ยังไม่รองรับ `assistant.chat`, system instruction, conversation parts, function calls, function responses, finish reasons หรือ thought signatures
- `assistant.chat` และ review ของ Orchestrator ปัจจุบัน route ไป `openai/gpt-oss-120b` บน Replicate
- การเปลี่ยนเฉพาะ model string จะทำให้ runtime เลือก Google adapter ที่ประกาศว่าไม่รองรับงานนี้ จึงไม่ใช่ drop-in replacement

หลักฐานในโค้ด: [Google adapter](/opt/artshift/lib/server/ai/adapters/googleAdapter.ts:14), [model manifest](/opt/artshift/lib/server/ai/modelManifest.ts:75), [Orchestrator call](/opt/artshift/lib/ai/orchestration/creativeDirector.ts:456)

## Verified provider capabilities

| ความสามารถ | สิ่งที่ Google ระบุสำหรับ `gemini-2.5-flash` | ผลต่อ ArtShift |
|---|---|---|
| รุ่น | Stable model `gemini-2.5-flash`; ณ วันที่ตรวจยังไม่มีวันปิดบริการที่ประกาศ | ใช้ model ID แบบ stable และมี lifecycle monitor |
| Modalities | รับ text, image, video และ audio; ส่งออก text | ใช้เป็นสมองและผู้ตรวจ multimodal ได้ แต่ไม่ใช่ Image Model |
| Context | Input 1,048,576 tokens; output 65,536 tokens | รองรับ brief, history และ brand/reference context ขนาดใหญ่ขึ้น แต่ต้อง curate context |
| Thinking | รองรับ dynamic thinking; `thinkingBudget` ของ 2.5 Flash ตั้งได้ 0–24,576 และ `-1` คือ dynamic | ทำ reasoning policy ตามชนิด turn และวัด latency/คุณภาพ |
| Function calling | รองรับ function calling รวมถึง parallel และ compositional calls | เข้ากับ planning/tool loop หาก adapter รักษา call/result context และ app เป็นผู้ execute |
| Structured output | รองรับ JSON Schema บางส่วน และยังต้อง validate ค่าใน application | ใช้กับ final structured response; schemas ของ ArtShift ต้องลดความซับซ้อนและตรวจซ้ำ |
| Context caching | รองรับ; implicit caching เปิดตามค่าเริ่มต้นสำหรับ Gemini 2.5 และขั้นต่ำ 2,048 input tokens | วาง system prompt/knowledge prefix ให้คงที่และบันทึก cache-hit usage |
| Search/URL/File | รองรับ Search grounding, URL context และ File Search | เป็นความสามารถระยะถัดไปสำหรับข้อมูลปัจจุบันและ brand docs หลังเพิ่ม consent/citation policy |
| Code execution | รองรับ | ยังไม่มี use case จำเป็นใน Orchestrator และไม่ควรเปิดใน migration แรก |
| Image generation | `gemini-2.5-flash` ไม่รองรับ | คง `image-gpt-2` หรือ Image Model route แยกจาก brain |
| Safety feedback | API รายงาน prompt block, candidate finish reason และ safety ratings | Adapter ต้องแยก blocked/malformed/max-token จาก provider unavailable |

แหล่งข้อมูลทางการ:

- [Gemini 2.5 Flash model card](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)
- [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Thinking budgets](https://ai.google.dev/gemini-api/docs/thinking)
- [Thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [Context caching](https://ai.google.dev/gemini-api/docs/caching)
- [Safety settings and feedback](https://ai.google.dev/gemini-api/docs/safety-settings)
- [Model deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations)

หมายเหตุ: `gemini-2.5-flash-image` เป็นคนละ model กับ Orchestrator candidate และมีวันปิดบริการ 2026-10-02 ตามตาราง deprecation ที่ตรวจ จึงไม่อยู่ในแผนนี้

## Current ArtShift contract

เส้นทางจริงในระบบปัจจุบัน:

```text
AI Assistance UI
  → /api/ai/director หรือ /api/ai/director/review
  → prepareOrchestratorTurn / reviewOrchestratorOutput
  → AiRuntime.execute("assistant.chat", alias="creative-director")
  → route manifest
  → ReplicateAiAdapter
  → openai/gpt-oss-120b
  → tool-call normalization
  → ArtShift validation
  → plan / task / answer
```

Contract ที่ candidate ต้องรักษา:

- system prompt แยกจาก untrusted Artwork, Vision, Knowledge และ search context
- messages มี text, tool call และ tool result
- planning tools 3 แบบและ review tool 1 แบบ
- output เป็น `AiAssistantChatOutput` เดิม เพื่อไม่ให้ domain codeรู้จัก Google payload
- abort, timeout, usage, request ID, finish reason, redacted errors และ no automatic paid fallback
- cloud consent, authenticated account scope และ server-owned capability allowlist
- validation ก่อน mutation และไม่มี tool side effect ระหว่าง shadow comparison

## Capability fit and evidence boundary

| ด้าน | gpt-oss-120b ผ่าน Replicate ในระบบปัจจุบัน | Gemini 2.5 Flash direct | สถานะหลักฐาน |
|---|---|---|---|
| Orchestrator integration | ใช้งานจริงผ่าน Harmony text envelope และ ArtShift parser | Adapter ยังไม่มี `assistant.chat` | ตรวจจากโค้ด |
| Function calling | ArtShift จำลอง tool protocolใน Harmony prompt แล้ว parse JSON | Provider มี native function calling | Native capability ยืนยันจาก Google; integration ยังไม่ทดสอบ |
| Structured schema | ตรวจหลัง parse ใน ArtShift | Provider รองรับ schema subset และยังต้อง app validation | ยืนยันจาก Google |
| Reasoning | Prompt ระบุ high reasoning | 2.5 Flash มี configurable/dynamic thinking | Capability ยืนยัน; คุณภาพเทียบกันยังไม่วัด |
| Multimodal input | Orchestrator รับ local Vision summary เป็น text | รับ image/video/audio โดยตรงได้ | Capability ยืนยัน; ArtShift chat contract ยังไม่รองรับ media |
| Long context | ArtShift ส่ง bounded history/context | สูงสุด 1,048,576 input tokens | Limit ยืนยัน; ไม่มีเหตุผลให้ส่งข้อมูลทั้งหมดโดยอัตโนมัติ |
| Thai UX | มีพฤติกรรมปัจจุบันเป็น baseline | ต้องใช้ blinded ArtShift evaluation | ยังไม่ยืนยัน |
| Latency | ต้องวัดจาก deployment ปัจจุบัน | Google ระบุว่าเหมาะกับ low-latency/high-volume use; ต้องวัดจริง | Vendor positioning เท่านั้น |
| Recovery | Replicate prediction มี job ID/polling | `generateContent` เป็น request/response; app ต้องจัด retry/reconciliation | ต้องออกแบบและทดสอบ |

Gemini context window ไม่ใช่ persistent memory ระบบยังต้องเก็บ brief, artifact lineage, approval และ run checkpoints ของ ArtShift เอง

## Provider economics

ราคา paid standard ที่ตรวจ:

| Route | Input / 1M tokens | Output / 1M tokens | หมายเหตุ |
|---|---:|---:|---|
| Replicate `openai/gpt-oss-120b` | $0.18 | $0.72 | Replicate direct model pricing |
| Google `gemini-2.5-flash` | $0.30 text/image/video; $1.00 audio | $2.50 | Output รวม thinking tokens |
| Google cached input | $0.03 text/image/video; $0.10 audio | — | มี storage price สำหรับ explicit caching |

[Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [Replicate gpt-oss-120b pricing](https://replicate.com/openai/gpt-oss-120b)

ตัวอย่างคำนวณแบบ standard synchronous route ไม่รวม caching, retry, grounding หรือ provider minimums:

| Workload ต่อ call | gpt-oss-120b | Gemini 2.5 Flash | ต่อ 1,000 calls: gpt / Gemini |
|---|---:|---:|---:|
| 3,000 input + 400 output | $0.000828 | $0.001900 | $0.828 / $1.900 |
| 12,000 input + 2,000 output | $0.003600 | $0.008600 | $3.600 / $8.600 |

สำหรับ Gemini จำนวน output ที่ใช้คิดราคาครอบคลุม thinking tokens ตาม pricing page ดังนั้น dynamic thinking อาจเพิ่มทั้ง latency และค่าใช้จ่าย ต้องบันทึก `thoughtsTokenCount` แยกจาก visible output ใน evaluation แม้เป้าหมายโครงการจะเน้นประสิทธิผลก่อนราคา

## Adoption risks

1. Tool schemas ปัจจุบันมี conditional `allOf`, `if/then/else`, `const`, `oneOf` และ object ซ้อนลึก ขณะที่ Gemini รองรับ schema subset และเตือนว่า schema ที่ใหญ่หรือซับซ้อนอาจถูกปฏิเสธ
2. REST adapter ปัจจุบันอ่านเฉพาะ text parts และทิ้ง function calls, thought signatures, candidate finish reasons, safety feedback และ tool IDs
3. `onTextDelta` ของ Google adapter ส่งข้อความครั้งเดียวหลังจบ ยังไม่ใช่ streaming
4. Google API เป็น stateless; multi-step function calling ต้องรักษา provider response context และ thought signaturesให้ถูกต้อง การส่งเฉพาะข้อความที่ normalize แล้วอาจสูญเสียข้อมูลนี้
5. Model output เป็น text เท่านั้น การสลับ brain ไม่เปลี่ยนคุณภาพ Image Model โดยตรง
6. Context ที่ยาวขึ้นเพิ่ม noise และ prompt-injection surface หากส่ง Artwork/OCR/search data มากเกินจำเป็น
7. Google rate limitsขึ้นกับ project tier และดูค่าปัจจุบันใน AI Studio; ตัวเลข deploymentจริงต้องตรวจในช่วง preflight
8. Stable model ยังไม่มีวันปิดที่ประกาศ แต่เป็นรุ่นเก่าเมื่อเทียบกับ Gemini 3.x ณ วันที่ตรวจ จึงต้องมี lifecycle test และ model swap seam ที่ไม่ผูก domain codeกับ 2.5

