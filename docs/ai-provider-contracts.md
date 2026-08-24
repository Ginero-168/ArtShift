# AI Provider Contracts for ArtShift

ตรวจสอบเมื่อ: 24 สิงหาคม 2026
ขอบเขต: ใช้เฉพาะเอกสารทางการของ Replicate, Anthropic, Google และ Pollinations เพื่อกำหนด contract สำหรับ provider adapters ของ ArtShift

## ข้อสรุปสำหรับการออกแบบ

- ให้ ArtShift เปิดเผย task-level contract ของตัวเอง และเก็บ request/response ของแต่ละ provider ไว้ภายใน adapter เท่านั้น
- ถือ output จาก provider เป็น untrusted data เสมอ: ตรวจ HTTP status, parse JSON, validate discriminated unions และตรวจ output ของโมเดลซ้ำด้วย schema ของ task
- เก็บ API key ทุกตัวไว้ฝั่ง server ยกเว้น key ประเภท public/app key ที่ provider ระบุชัดว่าออกแบบมาสำหรับ browser
- อย่าผูก cost ledger กับฟิลด์ที่ provider ไม่รับประกัน ให้ทุก usage field เป็น optional แล้วบันทึก source ของค่าด้วย
- Pin model/version ใน config ของ server แต่ทำให้เปลี่ยนได้โดยไม่แก้ UI หรือ domain code

สัญญากลางขั้นต่ำที่แนะนำ:

```ts
interface ProviderExecution<T> {
  output: T;
  provider: "replicate" | "anthropic" | "google" | "pollinations";
  model: string;
  requestId?: string;
  finishReason?: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    providerSeconds?: number;
  };
  warnings: string[];
}
```

ทุก field นอกจาก `output`, `provider`, `model`, `usage` และ `warnings` ควรเป็น optional เพราะ provider บางรายไม่คืนข้อมูลนั้น หรือคืนเฉพาะบางโมเดล

## Replicate Predictions API

### Endpoint และ lifecycle ที่ควรใช้

สำหรับ official model ให้เรียก:

```http
POST https://api.replicate.com/v1/models/{owner}/{model}/predictions
Authorization: Bearer $REPLICATE_API_TOKEN
Content-Type: application/json
Prefer: wait=60
Cancel-After: 90s

{"input": { ...modelSpecificInput }}
```

`Prefer: wait=n` รองรับ `n` 1–60 วินาที หากยังไม่จบ API จะคืน prediction ที่เป็น `starting` หรือ `processing`; adapter ต้อง poll `urls.get` หรือ URL จาก `Location` header ต่อ ไม่ควรถือว่า sync mode แปลว่างานเสร็จแน่นอน สำหรับงานที่สร้างไฟล์ `output` อาจพร้อมขณะที่ `status` ยังเป็น `processing` และ `metrics`/`completed_at` ยังไม่พร้อมด้วย [HTTP API](https://replicate.com/docs/reference/http/), [Create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction/)

Prediction status ที่ contract ปัจจุบันระบุคือ:

```ts
type ReplicateStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "aborted";
```

ให้ถือ `succeeded`, `failed`, `canceled` และ `aborted` เป็น terminal state; `aborted` หมายถึงหมด deadline ก่อนเริ่มรัน ส่วน `canceled` อาจเกิดจากผู้ใช้ยกเลิกหรือหมด deadline หลังเริ่มรันแล้ว เอกสาร polling แนะนำช่วงรอประมาณ 1–2 วินาที [Prediction lifecycle](https://replicate.com/docs/topics/predictions/lifecycle/), [HTTP API](https://replicate.com/docs/reference/http/)

### Prediction response

ฟิลด์แกนหลัก:

```ts
interface ReplicatePrediction {
  id: string;
  model: string;
  version: string;
  status: ReplicateStatus;
  input: Record<string, unknown>;
  output: unknown | null;
  error: string | null;
  logs: string | null;
  metrics?: Record<string, number> | null;
  urls: {
    get: string;
    cancel: string;
    web?: string;
    stream?: string;
  };
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  data_removed: boolean;
}
```

- `output` เป็น JSON-serializable value ที่ขึ้นกับโมเดล; เมื่อสำเร็จจึงค่อย validate ด้วย output schema ของโมเดล
- `error` มีรายละเอียดเมื่อ `failed`; อย่า parse ข้อความ error เพื่อควบคุม flow
- `metrics.predict_time` และ `metrics.total_time` เป็นฟิลด์ generic ที่มีเอกสารรองรับใน terminal prediction
- `metrics.input_token_count`, `output_token_count`, `time_to_first_token` และ `tokens_per_second` พบในโมเดล LLM หลายตัว แต่ไม่ใช่ generic guarantee ของ Predictions API จึงเป็น **model-specific/unstable** และต้องอ่านแบบ optional
- input, output และ logs ของ API prediction ถูกลบตาม retention policy; adapter ที่ต้องเก็บไฟล์ต้องคัดลอก output ไป storage ของ ArtShift ก่อนหมดอายุ [HTTP API](https://replicate.com/docs/reference/http/)

ไฟล์รับได้ทั้ง HTTP URL และ data URL เอกสาร generic แนะนำ data URL สำหรับไฟล์เล็กไม่เกินประมาณ 256 KB และ HTTP URL สำหรับไฟล์ใหญ่กว่า [HTTP API](https://replicate.com/docs/reference/http/)

### Official model schemas ที่ ArtShift ต้อง map

| Model | Input ที่ schema เปิด | Output | หมายเหตุ |
|---|---|---|---|
| `openai/gpt-4o-mini` | `prompt`, `messages`, `image_input`, `system_prompt`, `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `max_completion_tokens` | `string[]` | ถ้าส่ง `messages`, schema ระบุว่า `prompt` และ `system_prompt` จะถูก ignore; `messages` ต้องถูก serialize ตามรูปแบบที่ model wrapper คาดหวัง |
| `google/gemini-3-flash` | `prompt`, `images`, `videos`, `video_fps`, `audio`, `system_instruction`, `thinking_level`, `temperature`, `top_p`, `max_output_tokens` | `string[]` | ภาพสูงสุด 10 ภาพ ภาพละ 7 MB; `thinking_level` และ media limits เป็น wrapper-specific และอาจเปลี่ยนตาม version |

แหล่ง schema ทางการ: [openai/gpt-4o-mini](https://replicate.com/openai/gpt-4o-mini/api/schema), [google/gemini-3-flash](https://replicate.com/google/gemini-3-flash/api/schema)

ข้อแนะนำ:

- ใช้ official-model endpoint และบันทึก `prediction.version` ที่รันจริงเพื่อ benchmark/replay
- รวม `string[]` เป็นข้อความตามลำดับ แต่ห้ามสมมติว่าข้อความเป็น JSON ที่ถูกต้อง แม้ prompt จะขอ JSON
- จำกัด input fields ด้วย allowlist ต่อโมเดล ห้ามส่ง object จาก client ผ่านไปยัง Replicate ตรง ๆ
- ต่อ `AbortSignal` ของ ArtShift เข้ากับ `POST {urls.cancel}` และตั้ง `Cancel-After` เพื่อจำกัดค่าใช้จ่าย
- Parser ต้องยอมรับ unknown response fields แต่ไม่ควรยอมรับ unknown status เป็น success

## Anthropic Messages API

### Request/response แกนหลัก

```http
POST https://api.anthropic.com/v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01
Content-Type: application/json
```

Request ใช้ `model`, `max_tokens`, `messages` และ optional `system`, `tools`, `tool_choice`, sampling parameters และ `stream`; ไม่มี `system` role ใน `messages` เพราะ system prompt อยู่ top-level [Create a Message](https://platform.claude.com/docs/en/api/messages/create)

Response สำคัญ:

```ts
interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}
```

อย่าอ่านเฉพาะ `content[0].text`; `content` เป็น union ของ block หลายชนิด เช่น `text`, `tool_use` และ block รุ่นใหม่ที่อาจเพิ่มในอนาคต ให้ dispatch ตาม `type` และเก็บ unknown block เพื่อ observability โดยไม่ทำให้ request ล้ม [Messages API reference](https://platform.claude.com/docs/en/api/typescript/messages)

### Tool use

Tool definition ใช้ `name`, `description` และ JSON Schema ใน `input_schema` เมื่อ Claude เรียก client tool จะคืน block:

```ts
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
```

Adapter ต้อง validate `input` ด้วย schema ของ tool ก่อน execute แล้วส่งผลกลับเป็น user message ที่มี `tool_result` และ `tool_use_id` ตรงกับ block เดิม; ใส่ `is_error: true` เมื่อ tool ล้มเหลว ห้ามใช้ชื่อ tool หรือ input เป็น trusted dispatch key โดยไม่ผ่าน allowlist [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)

`stop_reason` ที่ควร handle อย่างน้อยคือ `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal` และ `model_context_window_exceeded`; parser ควรรองรับค่าที่ไม่รู้จักโดยจัดเป็น non-success/needs-review แทน crash [Stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)

### Streaming

เมื่อ `stream: true`, ลำดับ SSE แกนหลักคือ:

1. `message_start`
2. `content_block_start`
3. `content_block_delta` จำนวนศูนย์หรือมากกว่า
4. `content_block_stop`
5. `message_delta` จำนวนหนึ่งหรือมากกว่า
6. `message_stop`

อาจมี `ping`, `error` และ event type ใหม่แทรกอยู่ ต้อง ignore unknown event อย่างปลอดภัย ไม่ถือ HTTP 200 ว่าปราศจาก error เพราะ error สามารถมาใน stream ได้ `text_delta.text` ต่อเป็นข้อความตาม block index; `input_json_delta.partial_json` ต้องสะสมเป็น string และ parse หลัง `content_block_stop` ไม่ควร parse ทุก chunk [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)

### Usage

ฟิลด์ที่ควร normalize:

```ts
interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens: number } | null;
  server_tool_use?: {
    web_fetch_requests: number;
    web_search_requests: number;
  } | null;
}
```

Total input สำหรับคิดต้นทุนคือ `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`; `output_tokens` เป็นยอดรวม authoritative แม้มี `thinking_tokens` ในรายละเอียด สำหรับ streaming ค่าใน `message_delta.usage` เป็น cumulative จึงต้อง **replace ด้วยค่าล่าสุด ไม่ใช่บวกทุก delta** [Messages API usage](https://platform.claude.com/docs/en/api/typescript/messages), [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)

ฟิลด์อย่าง `output_tokens_details`, `server_tool_use`, `inference_geo`, beta content blocks และ model-specific stop reasons ให้ถือเป็น optional/unstable ส่วน core message/content/tool-use และ token totals เป็นฐานที่เหมาะกับ adapter

## Google Gemini `generateContent`

### Request/response แกนหลัก

```http
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
x-goog-api-key: $GEMINI_API_KEY
Content-Type: application/json
```

Body ใช้ `contents[]` เป็นบทสนทนาที่แต่ละ turn มี `role` และ `parts[]`; optional fields ที่สำคัญคือ `systemInstruction`, `generationConfig`, `tools`, `toolConfig`, `safetySettings` และ `cachedContent` รูปภาพแบบ inline ใช้ part รูปแบบ `inlineData: { mimeType, data }`; ไฟล์ที่อัปโหลดใช้ URI part [Gemini API](https://ai.google.dev/api), [Generating content](https://ai.google.dev/api/generate-content)

Response ใช้:

```ts
interface GenerateContentResponse {
  candidates?: Array<{
    content?: { role?: string; parts?: unknown[] };
    finishReason?: string;
    safetyRatings?: unknown[];
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: unknown[];
  };
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
  modelStatus?: unknown;
}
```

ห้ามสมมติว่า `candidates[0]` มีเสมอ หาก prompt ถูก block อาจไม่มี candidate และต้องอ่าน `promptFeedback.blockReason`; ใน candidate ให้ตรวจ `finishReason` และ safety metadata ก่อนใช้ content [GenerateContentResponse](https://ai.google.dev/api/generate-content)

Streaming ใช้ endpoint `:streamGenerateContent?alt=sse` และ request body เดียวกัน แต่คืน `GenerateContentResponse` เป็นชุด chunk; adapter ต้องสะสม part ตาม candidate ไม่ควรอ่านแค่ helper `response.text` เป็น contract ภายใน [Generating content](https://ai.google.dev/api/generate-content)

### Usage metadata

```ts
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  toolUsePromptTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: unknown[];
  cacheTokensDetails?: unknown[];
  candidatesTokensDetails?: unknown[];
  toolUsePromptTokensDetails?: unknown[];
  serviceTier?: string;
}
```

`promptTokenCount` รวม cached content ใน effective prompt แล้ว จึงห้ามบวก `cachedContentTokenCount` ซ้ำ `totalTokenCount` รวม prompt + thoughts + candidates ส่วนรายละเอียด modality และ service tier ควรเก็บแบบ optional [UsageMetadata](https://ai.google.dev/api/generate-content)

Google ระบุปัจจุบันว่า Interactions API เป็น primitive ที่แนะนำสำหรับงาน agentic ขณะที่ `generateContent` ยังเป็น standard endpoint สำหรับงาน non-interactive ดังนั้น endpoint นี้ยังใช้งานได้ แต่ทิศทางของ platform, model IDs, preview models, `modelStatus` และรายละเอียด generation/tool fields เป็น **evolving/unstable** ควรถูกกักไว้ใน Google adapter [Gemini API reference](https://ai.google.dev/api), [Migrate to Interactions](https://ai.google.dev/gemini-api/docs/migrate-to-interactions)

## Pollinations Image API

มีเอกสารทางการปัจจุบัน โดย base URL ใหม่คือ `https://gen.pollinations.ai` และใช้ Bearer API key สำหรับ server calls [Official API docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md), [Official repository](https://github.com/pollinations/pollinations)

### Contract ที่แนะนำสำหรับ ArtShift

ควรใช้ JSON endpoint แทนการประกอบ URL ของ endpoint รุ่นเก่า:

```http
POST https://gen.pollinations.ai/v1/images/generations
Authorization: Bearer $POLLINATIONS_API_KEY
Content-Type: application/json

{
  "prompt": "...",
  "model": "flux",
  "n": 1,
  "size": "1024x1024",
  "quality": "medium",
  "response_format": "b64_json",
  "safe": true
}
```

Request schema ระบุ `prompt` 1–32,000 ตัวอักษร, `n` ปัจจุบันรองรับสูงสุด 1, `size` รูปแบบ `WIDTHxHEIGHT`, `quality`, `response_format` (`url` หรือ `b64_json`), optional `user`, `image`, `resolution` และ `safe` Response เป็น:

```ts
interface PollinationsImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    media_type?: string;
    revised_prompt?: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details: Record<string, unknown>;
  };
}
```

อีกทางคือ `GET /image/{encodedPrompt}` ซึ่งคืน raw `image/jpeg`, `image/png` หรือ `image/svg+xml` และมี query เช่น `model`, `width`, `height`, `seed`, `safe`, `quality`, `image`, `transparent` และ `resolution` แต่การรองรับแต่ละ field ขึ้นกับโมเดล [Pollinations image endpoints](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)

Error envelope ทางการ:

```ts
interface PollinationsError {
  status: number;
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    details?: unknown;
    requestId?: string;
  };
}
```

ควร map อย่างน้อย 400/401/402/403/422/429/500/502/503 และ retry เฉพาะ 429/502/503 ด้วย bounded exponential backoff; ห้าม retry policy violation หรือ budget exhausted อัตโนมัติ [Pollinations error responses](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md#%EF%B8%8F-error-responses)

ข้อควรระวัง:

- รายชื่อโมเดล, default model และความสามารถเฉพาะโมเดลเปลี่ยนเร็ว ให้ตรวจ `/image/models` และ pin model alias ของ ArtShift เอง
- `quality`, `seed`, `transparent`, reference `image` และ `resolution` เป็น **model-specific**; บางโมเดลอาจ ignore parameter
- `pk_` เป็น app key สำหรับ browser ที่มี budget/permissions; `sk_` เป็น secret สำหรับ server เท่านั้น สำหรับ ArtShift server adapter ให้ใช้ `sk_` และห้ามส่งลง client bundle
- เอกสารทางการปัจจุบันชี้ไปที่ `gen.pollinations.ai`; จึงควรถือ `image.pollinations.ai/prompt/...` ที่ ArtShift เคยใช้เป็น legacy integration และย้ายออกจาก adapter ใหม่
- `b64_json` ลดความเสี่ยงจากการต้องตาม URL ภายนอกแต่เพิ่ม payload มาก; `url` ลด response size แต่ adapter ต้อง validate HTTPS URL และตัดสินใจเรื่อง persistence แยกต่างหาก

## Stability matrix

| Provider | ใช้เป็นแกน contract ได้ | ต้องกักใน adapter/ถือว่า unstable |
|---|---|---|
| Replicate | official-model endpoint, Bearer auth, prediction ID/status, `urls.get/cancel`, `output`, `error`, generic timing metrics | model input/output schema, token metrics, stream URL, version alias, media limits |
| Anthropic | Messages request, typed content blocks, tool-use ID lifecycle, core SSE flow, core token totals | model IDs, beta headers/blocks, unknown SSE events, extended usage/detail fields |
| Google | `contents/parts`, candidates, prompt feedback, usage totals, API-key header | preview model IDs, finish reasons, thinking/tool fields, modality details, platform shift toward Interactions |
| Pollinations | unified base URL, Bearer auth, image-generation JSON envelope, documented error envelope | model catalog/defaults, per-model parameters, pricing/capabilities, heterogeneous upstream behavior |

## Implementation recommendations

1. สร้าง adapter หนึ่งตัวต่อ provider และให้แต่ละตัวมี production implementation กับ fixture/mock implementation ที่ผ่าน contract test ชุดเดียวกัน
2. แยก model manifest ออกจาก code เช่น `vision-economy -> replicate/openai/gpt-4o-mini` และบันทึก version/model ที่ provider คืนจริงทุกครั้ง
3. Validate request ที่ขอบ server ด้วย allowlist และ task schema; client ห้ามส่ง provider URL, model slug หรือ raw input object โดยตรง
4. Normalize cancellation: local `AbortSignal` ต้องหยุด fetch; Replicate ต้องเรียก cancel endpoint เพิ่ม ส่วน provider ที่ไม่มี remote cancel ให้หยุดรอและบันทึกว่า execution อาจยังคิดค่าใช้จ่ายต่อ
5. ตั้ง timeout, maximum image bytes/pixels, maximum tokens และ per-request budget ก่อนเรียก provider
6. เก็บ usage/cost เป็น nullable values; อย่าประมาณ token จากข้อความเมื่อ provider มี usage จริง และอย่านับ cache/thinking ซ้ำ
7. Log เฉพาะ provider, model/version, request ID, task, latency, usage, status และ normalized error โดยไม่ log raw prompt/image เป็นค่าเริ่มต้น
8. Test fixture ต้องครอบคลุม success, blocked/refusal, malformed structured output, timeout, abort, 429, 5xx, empty candidate/output, unknown event/block และ provider schema ที่เพิ่ม field ใหม่
9. Fallback ข้าม provider ต้องเป็น policy ที่ผู้ใช้ยินยอมและมี budget ชัดเจน ห้ามเกิด paid fallback แบบเงียบ
10. ทบทวนลิงก์และ schema นี้เมื่อเปลี่ยน model version หรืออย่างน้อยก่อน release ใหญ่ เพราะ Replicate model wrappers, Google model lifecycle และ Pollinations catalog เปลี่ยนได้เร็วกว่าสัญญากลางของ ArtShift

## Primary sources

- [Replicate HTTP API](https://replicate.com/docs/reference/http/)
- [Replicate create prediction](https://replicate.com/docs/topics/predictions/create-a-prediction/)
- [Replicate prediction lifecycle](https://replicate.com/docs/topics/predictions/lifecycle/)
- [Replicate GPT-4o mini schema](https://replicate.com/openai/gpt-4o-mini/api/schema)
- [Replicate Gemini 3 Flash schema](https://replicate.com/google/gemini-3-flash/api/schema)
- [Anthropic Create a Message](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic Messages types and usage](https://platform.claude.com/docs/en/api/typescript/messages)
- [Anthropic streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Anthropic tool-call lifecycle](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
- [Google Gemini API reference](https://ai.google.dev/api)
- [Google generateContent](https://ai.google.dev/api/generate-content)
- [Google migration to Interactions](https://ai.google.dev/gemini-api/docs/migrate-to-interactions)
- [Pollinations official API docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
- [Pollinations official repository](https://github.com/pollinations/pollinations)
