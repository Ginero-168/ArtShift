# Groq Vision สำหรับ ArtShift

วันที่ค้นคว้า: 24 สิงหาคม 2026

## สรุปสำหรับตัดสินใจ

Groq เป็นแพลตฟอร์ม inference ผ่าน API ไม่ใช่โมเดล segmentation โดยตรง จุดเด่นคือส่งภาพเข้า multimodal model แล้วได้คำอธิบาย, OCR, คำตอบเชิงภาพ หรือ JSON กลับมาเร็วมาก เหมาะกับ **Vision Assistant, การตั้งชื่อ Object และการสร้าง Proposal** แต่ไม่ควรใช้เป็นตัวสร้าง alpha mask หลักของ `Extract All` เพราะเอกสารทางการระบุผลลัพธ์เป็นข้อความ/JSON และไม่ได้มี output เป็น pixel mask หรือ instance segmentation API

สำหรับสถานะปัจจุบัน ควรทดสอบ `qwen/qwen3.6-27b` เป็นตัวเลือก Groq Vision หลัก ส่วน `meta-llama/llama-4-scout-17b-16e-instruct` ที่พบในตัวอย่างเก่าไม่ควรเลือกเป็น dependency ใหม่: Groq ระบุว่า Scout ถูกประกาศยุติบริการและมี shutdown date วันที่ 17 กรกฎาคม 2026 แล้ว แม้หน้า Vision บางส่วนที่ถูก cache ไว้ยังแสดงตัวอย่าง Scout อยู่

ข้อสรุปสำหรับ ArtShift คือ **อย่าเปลี่ยน Local Remove BG / Extract / SAM ให้เรียก Groq โดยอัตโนมัติ** ให้เพิ่มเป็น Provider แบบเลือกใช้ได้ใน Fast/Cloud Vision Assist ภายหลัง โดยให้ Groq ช่วยหา label และกรอบคร่าว ๆ แล้วให้ local `RMBG`/alpha components/`SAM 2.1` สร้าง mask จริงต่อไป

## โมเดลและสถานะปัจจุบัน

| โมเดล | สถานะจาก Groq | ความสามารถที่ยืนยันได้ | บทบาทที่เหมาะกับ ArtShift |
|---|---|---|---|
| `qwen/qwen3.6-27b` | Preview | รับ text + image, Vision, OCR/image analysis, VQA, tool use, JSON Object Mode, thinking/non-thinking | ตัวเลือกแรกสำหรับ Cloud Vision Assist, label/OCR/description และ proposal JSON |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Deprecated; shutdown 17 ก.ค. 2026 | เคยรองรับ image input, JSON และ tool use | ไม่ควรนำมาเริ่ม integration ใหม่ |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | เคยประกาศเป็น Vision model ใน changelog เก่า | เคยรองรับ image understanding | ตรวจ availability ใน Models API ก่อนใช้; ไม่ใช่ตัวเลือกที่หน้า Vision ปัจจุบันแนะนำ |

หน้าโมเดลปัจจุบันระบุว่า Qwen 3.6 27B เป็นโมเดล multimodal 27B, รับภาพและข้อความ และรองรับ Vision, OCR, image analysis และ visual question answering โดยแสดงความเร็วประมาณ 500 tokens/s บน Groq ความเร็วนี้เป็นตัวเลขของ provider ไม่ใช่ latency end-to-end ของ ArtShift ซึ่งยังรวมการเตรียมภาพ, network, queue และการ parse JSON ด้วย

Sources: [Qwen 3.6 27B model page](https://console.groq.com/docs/model/qwen/qwen3.6-27b), [Groq supported models](https://console.groq.com/docs/models), [Groq deprecations](https://console.groq.com/docs/deprecations), [Groq changelog](https://console.groq.com/docs/changelog)

## การส่งภาพและข้อจำกัด

Groq ใช้ OpenAI-compatible `chat.completions` API โดยส่ง `messages[].content` เป็น array ที่มี `type: "text"` และ `type: "image_url"` ภาพส่งได้ทั้ง URL หรือ data URL แบบ base64 ภาพ local จึงต้อง encode ก่อนส่งออกจากเครื่อง

ข้อจำกัดที่ควรใช้เป็น conservative contract:

- URL ของภาพ: สูงสุด 20 MB ต่อ request ตามหน้า Vision และหน้า model
- Qwen 3.6: หน้า model ปัจจุบันระบุ max input images = 3 ขณะที่หน้า Vision guide ระบุ 5 ภาพต่อ request; ให้ ArtShift จำกัดไว้ที่ 3 จนกว่าจะยืนยันกับ endpoint/บัญชีจริง
- ขนาด context: 131,072 tokens; max output ปัจจุบัน 16,384 tokens ตามหน้า model
- JSON mode ทำให้บังคับผลลัพธ์เป็น JSON object ได้ แต่ JSON ไม่ได้ทำให้พิกัดหรือชื่อ Object ถูกต้องโดยอัตโนมัติ
- การขอพิกัดจาก Vision model เป็นเพียงค่าที่โมเดลคาดคะเน จึงต้อง validate, clamp, de-duplicate และไม่สร้าง object จากกรอบโดยไม่มี mask

สำหรับ pipeline ของ ArtShift ควรส่ง thumbnail/preview ที่ลดขนาดแล้วเพื่อประหยัด bandwidth และใช้ภาพต้นฉบับ local เป็น source ของ mask/alpha ไม่ควรส่งภาพต้นฉบับออกไปทุกครั้งโดยอัตโนมัติ

Source: [Groq Images and Vision](https://console.groq.com/docs/vision)

## ราคา, Free tier และ quota

Qwen 3.6 27B ปัจจุบันแสดงราคา **$0.60 ต่อ 1M input tokens** และ **$3.00 ต่อ 1M output tokens** บนหน้าโมเดล Groq และเป็น Preview model จึงควรติดตามราคา/availability ก่อนผูกกับ UX หลัก ราคาจริงของงานภาพขึ้นกับจำนวน image tokens และ output ที่โมเดลสร้าง ไม่ใช่เพียงจำนวนรูป

Groq มี Free tier แต่ quota เป็น rate limit ไม่ใช่ local/offline และเอกสารระบุว่าค่าที่เห็นในบัญชีจริงอาจต่างจากตารางตัวอย่าง ปัจจุบันหน้า Rate Limits แสดงตัวอย่าง Developer plan ของ Qwen ที่ 30 RPM, 1K RPD, 8K TPM และ 200K TPD; ให้ตรวจ Limits page ของ account ก่อนทำ benchmark หรือ production

Developer tier ต้องมี payment method และเพิ่ม capacity รวมถึง Batch/Flex; Flex เป็น paid-only และใช้ได้เมื่อยอมรับความเสี่ยงที่ request อาจ fail เร็วเมื่อ capacity ไม่พอ ส่วน spend limits เป็นความสามารถของ paid tier ไม่ใช่ Free tier

Sources: [Qwen 3.6 pricing/model limits](https://console.groq.com/docs/model/qwen/qwen3.6-27b), [Groq rate limits](https://console.groq.com/docs/rate-limits), [Groq billing FAQ](https://console.groq.com/docs/billing-faqs), [Groq spend limits](https://console.groq.com/docs/spend-limits), [Groq Flex processing](https://console.groq.com/docs/flex-processing)

## Privacy, API key และ Browser

ภาพที่ส่งเข้า Groq ออกจากเครื่องและต้องผ่าน network จึงไม่ใช่ Local/Eco แบบเดียวกับ Transformers.js, Worker และ WASM ที่ทำงานใน browser ของ ArtShift แม้ Groq ระบุว่า inference request โดยปกติไม่ถูกเก็บเป็น customer data แต่ยังมี usage metadata และอาจเก็บ input/output ชั่วคราวเพื่อ reliability หรือ abuse monitoring ได้สูงสุด 30 วันตามเงื่อนไขที่ระบุไว้ ผู้ใช้ทุกคนสามารถเปิด Zero Data Retention ได้ใน Data Controls แต่ feature ที่ต้องเก็บข้อมูล เช่น Batch และ fine-tuning จะถูกปิดหรือใช้ไม่ได้

Groq ระบุชัดว่าไม่ควรฝัง API key ใน frontend หรือ browser bundle และควร route ผ่าน trusted backend proxy ดังนั้นโครงสร้างที่ปลอดภัยสำหรับ ArtShift คือ:

```text
Browser ArtShift
  -> /api/vision/groq (server-side proxy, auth + size/rate validation)
  -> Groq chat.completions
  <- validated labels / boxes / OCR JSON
Browser local processor
  -> RMBG / alpha components / SAM 2.1
  <- final pixel mask and transparent object
```

ถ้าไม่ต้องการให้รูปออกจากเครื่อง ให้ปิด Groq provider และใช้ Local path เท่านั้น การใส่ user API key ใน session อาจทำได้สำหรับโหมดทดลอง แต่ต้องไม่ persist, ไม่ log และต้องแจ้งผู้ใช้ชัดเจนว่าภาพถูกส่งออกไป

Sources: [Groq security onboarding](https://console.groq.com/docs/production-readiness/security-onboarding), [Your Data in GroqCloud](https://console.groq.com/docs/your-data), [Groq Services Agreement](https://console.groq.com/docs/legal/services-agreement)

## Groq Vision เทียบกับ Florence-2, SAM และ RMBG

| งาน | Groq Qwen 3.6 | Florence-2 local | SAM 2.1 local | RMBG/alpha local |
|---|---|---|---|---|
| อธิบายภาพ / OCR / ตั้งชื่อ | ดีและเร็วเมื่อ network พร้อม | ทำได้ แต่ช้ากว่าและขึ้นกับ browser runtime | ไม่ใช่หน้าที่หลัก | ไม่ใช่หน้าที่หลัก |
| หา Object และกรอบ | ทำได้ด้วย prompt/JSON แต่ต้องตรวจความถูกต้อง | ทำได้ด้วย task เฉพาะ แต่ตกหล่นใน collage ได้ | ต้องมี prompt/box/point ก่อน | alpha components หา region ได้โดยไม่รู้ชื่อ |
| Pixel-accurate mask | **ไม่มี output mask โดยตรง** | ไม่ใช่ mask generator หลัก | เหมาะกับการ refine mask จาก box/point/mask | เหมาะกับ foreground/background แต่ไม่เข้าใจ semantic instance |
| ใช้แบบ offline/free | ไม่ได้ | ได้ | ได้ถ้ามี artifact/runtime เหมาะสม | ได้ |
| ความเป็นส่วนตัว | ภาพออก network | ภาพอยู่ในเครื่อง | ภาพอยู่ในเครื่อง | ภาพอยู่ในเครื่อง |

ดังนั้นอาการ “หลอด/หูแก้วหาย” หรือ “ได้กรอบเปล่า” จะไม่หายด้วยการเปลี่ยน VLM ไป Groq เพียงอย่างเดียว ปัญหาอยู่ที่การทำ mask และการรวม component: ต้องใช้ proposal เป็นจุดเริ่มต้น แล้วรักษา connected components ขนาดเล็ก, thin parts และ hole/handle ก่อนส่งเข้า SAM หรือ compositing

## Recommendation สำหรับ ArtShift

### ตอนนี้

1. คง Local/Eco เป็นค่าเริ่มต้นสำหรับ `Remove BG`, `Extract` และ `AI Image Tools` ตามข้อกำหนดของโปรเจกต์
2. ไม่ใช้ Scout เพราะถูก deprecate แล้ว และไม่ผูกกับ Qwen Preview เป็น dependency บังคับของ editor
3. เพิ่ม Groq เป็น optional `CloudVisionProvider` เฉพาะงานที่ยอมส่งภาพออก เช่น Chat/Explain, OCR, image caption และการเสนอชื่อ/กรอบให้ผู้ใช้ตรวจ
4. ห้ามให้ Groq สร้าง RGBA object จากกรอบโดยตรง; ผลลัพธ์ต้องไหลเข้า `ObjectProposal[]` แล้วผ่าน local mask pipeline

### ถ้าจะทดลองจริง

ใช้ภาพ fixture เดียวกับที่ ArtShift ใช้วัด Extract All และเก็บค่า:

- เวลา request รวม network และ p50/p95
- จำนวน Object ที่พบและ recall เทียบกับ ground truth
- อัตรา duplicate/merged/missing thin parts
- จำนวนกรอบที่ไม่มี mask ที่ใช้ได้
- input/output tokens และค่าใช้จ่ายต่อภาพ
- ผลต่างระหว่าง Qwen non-thinking กับ thinking mode

Prompt ควรขอ schema ที่แยก `label`, `bbox`, `confidence`, `parts` และ `relationship` เช่น “straw belongs to cup” แต่ต้อง treat ความสัมพันธ์เป็น hypothesis แล้วให้ geometry/mask verifier ตัดสิน ไม่ควรเชื่อ JSON โดยตรง

### ข้อเสนอเชิงสถาปัตยกรรม

```ts
interface VisionProposalProvider {
  propose(input: VisionProposalInput): Promise<ObjectProposal[]>;
  capabilities(): VisionCapabilities;
}

class LocalVisionProposalProvider implements VisionProposalProvider {}
class GroqCloudVisionProvider implements VisionProposalProvider {}
```

`GroqCloudVisionProvider` ควรอยู่หลัง server proxy และถูกเรียกเฉพาะเมื่อผู้ใช้เลือก Fast/Cloud Vision Assist ส่วน `LocalVisionProposalProvider` และ mask processor ต้องทำงานได้สมบูรณ์โดยไม่พึ่ง network การแยก interface นี้ช่วยให้ Groq ถูกถอดออกหรือเปลี่ยนโมเดลได้โดยไม่ทำให้ ArtShift และ Extract All พังเมื่อ model ID เปลี่ยน

## คำตัดสิน

Groq Vision น่าสนใจมากในฐานะ **ชั้นความเข้าใจภาพที่เร็ว** และอาจช่วยเรื่อง label/recall ของ proposal ได้ แต่ไม่ใช่คำตอบตรงสำหรับ Extract All ที่ต้องการแยกเป็นภาพโปร่งใสรายชิ้น ผลลัพธ์ที่เหมาะที่สุดสำหรับ ArtShift คือ:

```text
Groq/Qwen (optional cloud semantic proposal)
  + alpha components / watershed (local completeness)
  + SAM 2.1 (local mask refinement)
  + user Split/Merge/Mask Preview
  -> final transparent objects
```

ในเชิงผลิตภัณฑ์ควรแสดง Groq เป็น **Fast · Cloud** แยกจาก **Eco · Local** และไม่แอบเรียกใช้เมื่อผู้ใช้กด Remove BG/Extract โดยไม่ได้เลือกหรือยินยอม
