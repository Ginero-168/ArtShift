# ArtShift AI Brain Model Evaluation

ตรวจสอบเมื่อ 2026-09-07 UTC

## Decision

- ผู้ใช้เลือก `openai/gpt-oss-120b` เป็นสมองพื้นฐานของ ArtShift และให้ priority กับ performance/quality ก่อน cost
- `assistant.chat` และ `prompt.enhance` ทุก profile route ไป `openai/gpt-oss-120b` ผ่าน Replicate; ไม่มี automatic downgrade ไป 20B
- Replicate Harmony prompt ใช้ `Reasoning: high` และ AI Chat/Creative Director มี output budget 8,192 tokens
- `AnthropicAiAdapter` รองรับ `assistant.chat` แต่ route manifest ยังไม่ได้เลือก Anthropic เป็น route หลัก
- `GoogleAiAdapter` ปัจจุบันรองรับ vision/prompt enhancement แต่ยังไม่รองรับ `assistant.chat`

## ราคา

ราคา standard ต่อ 1M tokens โดยใช้ provider ที่เทียบกันได้ตามแหล่งทางการ:

| Model | Provider | Input | Output | Cost ต่อ 3,000 in + 400 out |
|---|---|---:|---:|---:|
| `openai/gpt-oss-20b` | Replicate | $0.09 | $0.36 | $0.000414 |
| `openai/gpt-oss-120b` | Replicate | $0.18 | $0.72 | $0.000828 |
| `gemini-2.5-flash` | Google | $0.30 | $2.50 | $0.001900 |
| `gemini-2.5-pro` (prompt <=200k) | Google | $1.25 | $10.00 | $0.007750 |
| `claude-sonnet-5` | Anthropic | $2.00 | $10.00 | $0.010000 |

ตัวอย่างเป็นการคำนวณ token usage เท่านั้น ยังไม่รวม retries, tool-call rounds, cache, provider minimums หรือ quota

## คุณภาพ/ความเหมาะสมเป็นสมอง

### `gpt-oss-120b` — ข้อเสนอหลัก

- OpenAI ระบุว่าเป็นรุ่นสำหรับ production/general purpose/high reasoning
- 117B total parameters, 5.1B active parameters, context 128k
- รองรับ reasoning effort, function calling, structured outputs และ agentic workflows
- ตาราง benchmark ทางการของ OpenAI เทียบกับ `gpt-oss-20b`: MMLU 90.0 vs 85.3, GPQA Diamond 80.1 vs 71.5, Humanity's Last Exam 19.0 vs 17.3
- ไม่ได้ดีกว่าทุก benchmark: AIME 2025 อยู่ที่ 97.9 เทียบกับ 98.7 ของ 20B
- ราคา Replicate ประมาณ 2x ของ 20B แต่ไม่ต้องเพิ่ม provider หรือเปลี่ยน adapter
- สำหรับ Replicate ไม่ต้องใช้ GPU ของ VPS เอง; ข้อกำหนด single 80GB GPU เป็นกรณี self-host

### `gemini-2.5-flash` — ตัวเลือกคุ้มเมื่อเน้น context/multimodal

- Google ระบุว่าเป็นรุ่น price-performance สำหรับงานปริมาณมาก, latency ต่ำ, reasoning และ agentic use cases
- Context 1,048,576 input tokens และ output 65,536 tokens
- ราคาแพงกว่า 20B ในตัวอย่างประมาณ 4.59x
- ArtShift มี Google adapter แล้ว แต่ adapter ปัจจุบันยังไม่รองรับ `assistant.chat`; ต้องเพิ่ม contract/route/test ก่อน

### `gemini-2.5-pro` — ตัวเลือก reasoning/document ระดับสูง

- Google ระบุว่าเหมาะกับ complex reasoning, code, math, STEM, codebases และ documents
- รองรับ multimodal input, function calling, structured outputs, code execution และ context 1,048,576 tokens
- ราคา standard สำหรับ prompt <=200k คือ $1.25 input / $10 output; สูงกว่า 20B มาก
- ต้องเพิ่ม assistant-chat support ใน Google adapter และตั้งค่า credential/route ฝั่ง server

### `claude-sonnet-5` — ตัวเลือกคุณภาพสูง แต่ integration/cost สูง

- Anthropic ระบุว่าเป็นการรวม speed กับ intelligence สำหรับ production และ agentic workloads
- Context 1M tokens, max output 128k และ adaptive thinking
- ราคา $2 input / $10 output ต่อ 1M tokens
- ArtShift มี Anthropic adapter ที่รองรับ `assistant.chat` แล้ว แต่ route manifest ยังไม่ได้เลือกเป็น primary route และต้องมี server-side credential/configuration ที่ได้รับอนุญาต

## Implemented policy

1. Local deterministic edits/analysis ยัง local-first และไม่เรียก LLM โดยไม่จำเป็น
2. งานสร้าง/แก้ภาพที่ครบ brief ต้องผ่าน 120B Creative Director เพื่อ Understand → Reason → Plan → Decide ก่อน Image Model
3. ผลงานผ่าน local Vision/technical/semantic checks แล้วส่ง summary กลับ 120B เพื่อ Review; ไม่ส่ง raw image/Base64 เข้า brain prompt
4. ยังไม่เพิ่ม Gemini/Claude/Flux/Nano Banana/Ideogram เป็น live route จนกว่าจะผ่าน adapter contract, provider consent, pricing/license check และ ArtShift-specific quality benchmark
5. AI Chat ทำงานแบบ quality-first: ไม่มี monthly/per-command cost gate ในเส้นทาง Design Agent, Creative Director และ image generation; งานภาพทั่วไปเริ่มที่ high และ Quality Gate ลองแก้ได้สูงสุด 3 ครั้ง

## Acceptance benchmark ก่อนเปลี่ยน default

ใช้ prompt จริงที่ redact แล้วอย่างน้อย 50 รายการ ครอบคลุมภาษาไทย, infographic, product brief, selected-image context, ambiguous intent และ tool routing วัด:

- ความถูกต้องของ intent/topic/direction
- ความเกี่ยวข้องของ direction กับ prompt
- ความถูกต้องของ tool/route และ structured output
- การไม่เรียก cloud ใน local-only action
- Thai instruction following
- latency p50/p95
- input/output tokens และ cost
- retry rate และ provider outcome-unknown handling

Mock/E2E ใช้ยืนยัน wiring ได้ แต่ไม่ถือเป็นหลักฐานคุณภาพของ real model จนกว่าจะได้รับ explicit consent สำหรับ real paid calls

## Sources

- OpenAI Open Models: https://openai.com/open-models/
- OpenAI gpt-oss announcement and evaluations: https://openai.com/index/introducing-gpt-oss/
- Replicate `openai/gpt-oss-20b`: https://replicate.com/openai/gpt-oss-20b
- Replicate `openai/gpt-oss-120b`: https://replicate.com/openai/gpt-oss-120b
- Google Gemini 2.5 Pro model: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro
- Google Gemini 2.5 Flash model: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- Google Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Anthropic Claude Sonnet 5 model: https://platform.claude.com/docs/en/models/sonnet-5/overview
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
