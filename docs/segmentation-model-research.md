# Segmentation Model Research

วันที่: 2026-08-24

## สรุปสั้น

- **คุณภาพและความสามารถในการค้นหา/แยกหลาย Object สูงสุด:** SAM 3.1
- **ตัวเลือกที่เหมาะกับ ArtShift สำหรับเริ่มใช้งานจริง:** SAM 2.1 Hiera Large เป็นตัวสร้าง Mask ต่อ Object หลังจากระบบหา Proposal แล้ว
- **ตัวเลือก Eco/Local:** SAM 2.1 Hiera Small หรือ Tiny โดยแลกคุณภาพขอบภาพกับความเร็ว
- **ไม่ควรใช้ VLM เช่น Florence-2 หรือ GLM-4.6V-Flash เป็นตัวสร้าง Mask หลัก:** ให้ใช้หา Object, ชื่อ และกรอบ แล้วส่งต่อให้ Segmenter

## เปรียบเทียบ

| ตัวเลือก | จุดเด่น | ข้อจำกัด | บทบาทที่เหมาะกับ ArtShift |
| --- | --- | --- | --- |
| **SAM 3.1** | ใช้ Text หรือ Visual Prompt และแยกทุก Instance ของ Concept ได้ในภาพ/วิดีโอ | โมเดลขนาดใหญ่ 848M, ต้องใช้ Python 3.12+, PyTorch 2.7+, CUDA 12.6+, ต้องขอสิทธิ์ Checkpoint และใช้ SAM License แบบเฉพาะ | Quality/Server/Desktop Processor ในอนาคต |
| **SAM 2.1 Hiera Large** | Mask และขอบวัตถุคุณภาพสูง เหมาะกับการ Refine จาก Box/Point/Mask; Checkpoint ใช้ Apache 2.0 | ไม่ได้ทำ Object Inventory จากภาพเอง ต้องมี Prompt หรือ Proposal; 224.4M parameters และช้ากว่า Tiny/Small | ตัวหลักสำหรับ Extract All หลังมี Proposal |
| **SAM 2.1 Hiera Small/Tiny** | เบากว่า เหมาะกับ Local/Eco และงานโต้ตอบ | ขอบภาพและวัตถุเล็กอาจด้อยกว่า Large | Fallback สำหรับ Browser/เครื่องทรัพยากรจำกัด |
| **Grounded-SAM 2** | เป็น Pipeline ที่รวม Open-Vocabulary Detector กับ SAM 2 ทำให้ค้นหาแล้วสร้าง Mask ต่อได้ | ไม่ใช่ Segmenter ตัวเดียว และคุณภาพ/License ขึ้นกับ Detector และ Runtime ที่เลือก | รูปแบบสถาปัตยกรรมสำหรับ Extract All |
| **Florence-2 / GLM-4.6V-Flash** | เข้าใจภาพ หา Object ตั้งชื่อ และให้ตำแหน่ง/กรอบได้ | ไม่ใช่ตัวสร้าง Pixel-accurate Mask; ผลลัพธ์ขึ้นกับ Prompt/Runtime | Discovery, Labeling และ Proposal generation |

## คำแนะนำสำหรับปัญหาปัจจุบันของ ArtShift

ปัญหา “ได้แค่กรอบเปล่า”, “หลอดหรือส่วนแคบหาย” และ “แยกไม่ครบ” ไม่ควรแก้ด้วยการเปลี่ยน VLM อย่างเดียว เพราะกรอบเป็นเพียงตำแหน่งเริ่มต้น ไม่ใช่ Alpha Mask สุดท้าย

Pipeline ที่แนะนำคือ:

1. ใช้ Florence-2, GLM-4.6V-Flash, Grounding DINO หรือ Alpha Components หา Proposal และชื่อ
2. ส่งแต่ละ Proposal เข้า SAM 2.1 เพื่อสร้าง **Mask จริง**
3. เก็บผลเป็น RGBA จาก Mask ไม่ใช่สร้าง Object จากกรอบสี่เหลี่ยม
4. รักษา Connected Components ขนาดเล็กและส่วนแคบ เช่น หลอด หูหิ้ว และสายรัด
5. ตัดผลซ้ำด้วย Mask IoU/containment ไม่ใช่ดูเฉพาะการทับซ้อนของกรอบ
6. แสดง Mask Preview พร้อม Split/Merge ให้ผู้ใช้แก้ได้ก่อนสร้าง Object ถาวร

สำหรับโหมดคุณภาพสูง ให้เพิ่ม SAM 3.1 เป็น Processor แยกต่างหากเพื่อค้นหาและแยกทุก Instance จาก Text/Exemplar Prompt ส่วนโหมด Local/Eco ให้ใช้ SAM 2.1 Small/Tiny เป็นค่าเริ่มต้น และใช้ Hiera Large เมื่อผู้ใช้ต้องการคุณภาพสูงสุด

## Browser และการใช้งานเชิงพาณิชย์

SAM 3.1 ไม่ใช่ตัวเลือก Browser โดยตรงที่เหมาะจะฝังใน ArtShift ตอนนี้ เอกสารทางการระบุ Runtime ฝั่ง Python/PyTorch/CUDA และการขอ Checkpoint; จึงเหมาะกับ Server หรือ Desktop GPU มากกว่า ส่วน Browser WebGPU ต้องใช้ Model Artifact ที่แปลงให้เข้ากับ ONNX Runtime Web และยังมีข้อจำกัดด้านการรองรับอุปกรณ์/เบราว์เซอร์

SAM 2.1 มีความเหมาะสมกว่าในฐานะฐานพัฒนา เพราะ Checkpoint และโค้ดหลักใช้ Apache 2.0 แต่ต้องตรวจ License ของ Detector, WASM/ONNX Runtime และ Model Conversion ที่นำมาร่วมด้วยทุกตัว

SAM 3.1 ใช้ SAM License แบบเฉพาะ ไม่ควรสรุปว่าเหมาะกับการทำ Commercial Product โดยอัตโนมัติ ต้องตรวจเงื่อนไขฉบับเต็มก่อนนำไปใช้ในบริการเชิงพาณิชย์

## Sources

- [Meta SAM 3 Research](https://ai.meta.com/research/sam3/)
- [Official SAM 3 repository](https://github.com/facebookresearch/sam3)
- [SAM 3 license](https://raw.githubusercontent.com/facebookresearch/sam3/main/LICENSE)
- [Meta SAM 2 Research](https://ai.meta.com/research/sam2/)
- [Official SAM 2 repository and model table](https://github.com/facebookresearch/sam2)
- [SAM 2 license](https://raw.githubusercontent.com/facebookresearch/sam2/main/LICENSE)
- [Grounded-SAM-2](https://github.com/IDEA-Research/Grounded-SAM-2)
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [GLM-4.6V Transformers documentation](https://huggingface.co/docs/transformers/model_doc/glm46v)
