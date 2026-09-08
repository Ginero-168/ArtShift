# Dedicated Specialist-to-Model Capability Routing

Type: research
Status: resolved
Blocked by: none

## Question

How should `CREATING_MODEL_CATALOG` in `lib/ai/orchestration/creatingModelCatalog.ts` and the runtime adapters be mapped so that each `CreativeSpecialist` (`image_generator`, `image_editor`, `vectorizer`, `layout_designer`, `copywriter`, `brand_stylist`) resolves to its optimal model alias and provider adapter, with graceful fallback to user-provided BYOK keys and local tools?

## Answer

Researched and mapped against `docs/AI_RUNTIME.md` and `lib/ai/orchestration/creatingModelCatalog.ts`:

### 1. Specialist-to-Capability Alias Matrix

| Creative Specialist | Stable Capability Alias | Primary Provider / Model | Fallback Tier 1 (BYOK) | Fallback Tier 2 (Local / Rule) |
| :--- | :--- | :--- | :--- | :--- |
| **`image_generator`** | `IMAGE_DEFAULT` / `IMAGE_TEXT` | Replicate `openai/gpt-image-2` | User OpenAI / Recraft key | Reject prompt if no key |
| **`image_editor`** | `IMAGE_EDIT` | Replicate `gpt-image-2` (img2img) | User OpenAI key | Local RMBG / Canvas pixel tools |
| **`vectorizer`** | `IMAGE_VECTOR` | `local-vtracer` (Browser WASM) | Replicate `recraft-vectorize` | Fallback to embedded PNG asset |
| **`copywriter`** | `TEXT_COPYWRITER` | Google Gemini 2.0 Flash (Thai nuance) | User Anthropic / OpenAI key | Rule-based catalog template |
| **`layout_designer`** | `LAYOUT_DESIGNER` | Claude 3.7 Sonnet / GPT-4o | User Anthropic key | Deterministic `alignElements()` engine |
| **`brand_stylist`** | `BRAND_STYLIST` | Publisher Brand Kit rules + Claude | User Gemini / OpenAI key | Local `lib/brand/` preflight checker |

### 2. Multi-Tier Resolution Policy
- **Priority 1 (BYOK)**: Check user-encrypted credentials in `userCredentials.ts`. If available, use the user's direct provider quota.
- **Priority 2 (Managed Adapter)**: Use server-owned adapter routes (`/api/ai/director`, `/api/ai/execute`) when within monthly budget guard (`AI_MONTHLY_BUDGET_USD`).
- **Priority 3 (Local Fallback)**: For transformation tasks (`vectorizer`, `image_editor`), automatically fall back to zero-cost in-browser tools (`local-vtracer` WASM, browser RMBG) without throwing errors.

