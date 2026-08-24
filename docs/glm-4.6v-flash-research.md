# GLM-4.6V-Flash Research

วิจัย ณ วันที่ 2026-08-24 สำหรับการประเมินว่าจะนำ GLM-4.6V-Flash มาใช้กับ ArtShift หรือไม่

## สรุปสั้น

GLM-4.6V-Flash ฟรีจริงในความหมายของ Z.ai Open Platform: ตารางราคาแสดงค่า input, cached input และ output เป็น Free ทั้งหมด และหน้าโมเดลจัดเป็น “Completely Free” แต่การเรียก API ยังต้องใช้ API key และยังควรถือว่ามี rate limit/ข้อกำหนดการใช้งานตามบัญชีอยู่ ไม่ควรตีความว่าเป็น unlimited API โดยอัตโนมัติ

นอกจากนี้ยังมีน้ำหนักโมเดลให้ดาวน์โหลดจากผู้เผยแพร่ `zai-org` บน Hugging Face ภายใต้ MIT license จึงนำไปรันเองได้ตามเงื่อนไขของ license แต่ไฟล์รวมประมาณ 20.6 GB และตัวอย่างทางการใช้ PyTorch, vLLM, SGLang หรือ Docker ไม่ใช่ Transformers.js/ONNX สำหรับโหลดตรงใน Browser

## ข้อเท็จจริงที่ตรวจสอบแล้ว

| ประเด็น | ผลตรวจสอบ | แหล่งอ้างอิง |
|---|---|---|
| API ราคา | GLM-4.6V-Flash มี input/cached input/output เป็น Free | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing) |
| สถานะใน catalog | ระบุว่า Free และรองรับ native function call, ภาษาจีน/อังกฤษ, context 128K | [Z.AI model overview](https://docs.z.ai/guides/overview/overview) |
| API key | ตัวอย่างเรียก `https://open.bigmodel.cn/api/paas/v4/chat/completions` พร้อม Bearer API key | [GLM-4.6V-Flash API guide](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) |
| น้ำหนักโมเดล | มี checkpoint `zai-org/GLM-4.6V-Flash` ให้ดาวน์โหลด และระบุ license เป็น MIT | [Hugging Face model card](https://huggingface.co/zai-org/GLM-4.6V-Flash) |
| ขนาด | Repository แสดงขนาดประมาณ 20.6 GB; safetensors แบ่งเป็น 4 shard ประมาณ 5.3 GB ต่อไฟล์ | [Hugging Face files](https://huggingface.co/zai-org/GLM-4.6V-Flash/tree/main) |
| ขนาดโมเดล | เป็นรุ่น 9B ที่ผู้เผยแพร่ระบุว่าเน้น local deployment และ low latency | [official model card](https://huggingface.co/zai-org/GLM-4.6V-Flash) |
| Local runtime | ตัวอย่างทางการใช้ Transformers/PyTorch, vLLM, SGLang และ Docker | [official model README](https://huggingface.co/zai-org/GLM-4.6V-Flash/raw/main/README.md), [GLM-V repository](https://github.com/zai-org/GLM-V) |
| Vision input | รองรับภาพ วิดีโอ ข้อความ และไฟล์; output หลักเป็นข้อความ และรองรับ grounding/bounding box | [Z.AI GLM-4.6V guide](https://docs.z.ai/guides/vlm/glm-4.6v), [GLM-V grounding docs](https://github.com/zai-org/GLM-V) |
| ข้อจำกัด | Model card ระบุว่ายังมีข้อจำกัดด้าน counting/การรับรู้บางกรณี และอาจคิดซ้ำหรือ output ซ้ำ | [official model README](https://huggingface.co/zai-org/GLM-4.6V-Flash/raw/main/README.md) |
| Rate limit | Z.ai ให้ตรวจ rate limit จาก dashboard ของบัญชี; หน้า pricing ไม่ได้ประกาศว่า free แปลว่า unlimited | [Z.AI FAQ](https://docs.z.ai/help/faq) |

## “ฟรี” มีสามความหมาย

### 1. ฟรีผ่าน API

ใช้งานผ่าน Z.ai ได้โดยไม่มีค่า token ตามตารางราคาปัจจุบัน แต่ต้องมี API key และส่งภาพ/ข้อมูลออกไปยังบริการภายนอก จึงมีต้นทุนด้าน privacy, latency, availability และ rate limit แม้ค่า token จะเป็นศูนย์ก็ตาม

หน้า API ของรุ่นนี้ใช้ชื่อโมเดล `glm-4.6v-flash` และรองรับ image URL, video URL, file URL รวมถึง base64 image ในตัวอย่างทางการ

### 2. ฟรีแบบดาวน์โหลดน้ำหนักไปรันเอง

ทำได้ และโมเดล card ระบุ MIT license แต่ต้องจัดเตรียม runtime และ hardware เอง น้ำหนักเต็มประมาณ 20.6 GB ก่อนรวม memory สำหรับ runtime, KV cache และภาพที่ส่งเข้าโมเดล ดังนั้น “ใช้ฟรี” ไม่ได้หมายถึงใช้ทรัพยากรเครื่องน้อย

Z.ai ระบุช่องทางใช้งานผ่าน Transformers, vLLM, SGLang และ Docker ตัวอย่างเหล่านี้เป็น server/desktop/local-runtime workflow ไม่ใช่การ import model ในหน้าเว็บโดยตรง

### 3. ฟรีและทำงานตรงใน Browser

ยังไม่ใช่ทางเลือกที่พร้อมใช้งานสำหรับ ArtShift:

1. official model repository มี safetensors และ config สำหรับ PyTorch/Transformers แต่ไม่พบ ONNX/WebGPU artifact ในชุดไฟล์หลัก
2. เอกสาร Transformers.js ระบุการรันใน Browser ผ่าน ONNX Runtime Web/WebGPU และตัวอย่างใช้โมเดลที่มี artifact รองรับ Transformers.js โดยตรง
3. ดังนั้นการนำ GLM-4.6V-Flash เข้า Browser ต้องมีงานแปลง/quantize/export และต้องแก้ความเข้ากันได้ของ vision-language architecture ซึ่งไม่ใช่การเพิ่ม model id แล้วจบ
4. แม้ทำได้ในอนาคต ขนาดประมาณ 20.6 GB ก็ไม่เหมาะกับการดาวน์โหลดครั้งแรกและ memory budget ของ Browser ทั่วไป

ข้อสรุปนี้เป็น inference จาก artifact และ runtime ที่ผู้เผยแพร่ประกาศ ไม่ใช่การยืนยันว่าไม่สามารถทำ ONNX/WebGPU ได้ตลอดไป

## ความเหมาะสมกับงาน Extract All ของ ArtShift

GLM-4.6V-Flash เหมาะเป็น **vision grounding/analysis model** มากกว่าเป็น background removal หรือ instance segmentation model โดยตรง:

- ใช้ถามว่าในภาพมีวัตถุอะไร และขอ bounding boxes ของวัตถุแต่ละชิ้นได้
- ใช้เป็นตัวช่วยตรวจว่ากล่องจาก Florence-2 ตกหล่นหรือไม่
- ใช้กับภาพหลายชิ้นและคำอธิบายเชิงธรรมชาติได้ดีในระดับ reasoning
- ไม่ได้ส่ง alpha mask ของแต่ละวัตถุมาให้โดยตรง ดังนั้นยังต้องใช้ Remove BG, SAM/instance mask, connected components, watershed หรือวิธี mask อื่นตัดพิกเซลจริง
- การที่โมเดลเห็นกล่องได้ ไม่รับประกันว่าขอบ alpha จะสมบูรณ์ โดยเฉพาะวัตถุโปร่งใส รายละเอียดบาง เส้น/หลอด และวัตถุที่สัมผัสกัน

## ข้อเสนอสำหรับ ArtShift

ยังไม่ควรแทนที่ Florence-2 ทันที ควรเพิ่มเป็น provider แบบทดลองใน `ApiRasterProcessor`/vision provider layer:

1. `GLM-4.6V-Flash API` ทำ object inventory + grounding boxes
2. รวม boxes กับผล `Remove BG` และ `Alpha Components`
3. ใช้ NMS/IoU และ split/merge ที่ผู้ใช้แก้ได้เพื่อลดกล่องซ้ำ
4. ส่งแต่ละกล่องเข้า mask refinement เช่น SAM2/GrabCut/Watershed ตามขนาดและความซับซ้อน
5. วัด precision, recall, object completeness, missing-thin-object rate และ latency เทียบกับ Florence-2
6. หาก API ล้มเหลว/เกิน rate limit ให้ fallback กลับ local pipeline เดิม

โหมดที่แนะนำ:

- **Eco:** Florence-2/ระบบ local เดิม + connected components และการแก้ mask ในเครื่อง
- **Fast:** GLM-4.6V-Flash API เพื่อหา inventory/grounding แล้วใช้ local mask refinement ต่อ
- **Quality/experimental:** GLM-4.6V-Flash API + multi-pass prompt เฉพาะกรณีที่ผู้ใช้ยอมรับ latency เพิ่ม

ไม่ควรใช้ GLM-4.6V-Flash เป็นตัวตัดภาพสุดท้ายเพียงตัวเดียว เพราะงานของมันเป็น vision-language reasoning ไม่ใช่ alpha matting/segmentation โดยเฉพาะ

## ความเสี่ยงด้านข้อมูลและเชิงพาณิชย์

- API: ภาพผู้ใช้งานจะถูกส่งไปยังผู้ให้บริการ ต้องมี privacy notice, consent และนโยบายเก็บข้อมูลที่ชัดเจน โดยเฉพาะงานลูกค้า
- Local weights: MIT เป็น license ที่ permissive โดยทั่วไป แต่ควรเก็บ license/attribution ของ checkpoint และตรวจ terms ของ runtime/quantization ที่เลือกแยกกัน
- Free API: ราคาและ quota เปลี่ยนได้ ควรอ่าน pricing/rate-limit dashboard ก่อนเปิดให้ผู้ใช้จำนวนมากหรือใช้เชิงพาณิชย์
- อย่านำ API key ฝังใน Browser; ให้เรียกผ่าน server-side proxy ของ ArtShift และกำหนด quota ต่อผู้ใช้/งาน

## Verdict

GLM-4.6V-Flash เป็นตัวเลือกที่น่าทดลองสำหรับ **Fast vision grounding ผ่าน API ฟรี** และอาจช่วยเพิ่มความครบของ object inventory ได้ แต่ยังไม่ใช่ตัวแทน Florence-2 แบบตรง ๆ และไม่เหมาะกับการโหลดตรงใน Browser ปัจจุบัน

ลำดับที่ปลอดภัยที่สุดคือทำเป็น provider แบบ optional, ทดลองกับชุดภาพจริงของ ArtShift, เก็บ benchmark เทียบ Florence-2, และใช้ผล GLM เป็น seed ให้ mask/segmentation pipeline แทนการให้ GLM สร้างชิ้นภาพเอง
