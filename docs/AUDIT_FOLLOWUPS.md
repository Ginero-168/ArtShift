# Audit follow-ups (deferred)

Short list of known remaining work after PRs #4–#6 landed on `main`.

## This follow-up

- **Next.js 15.5.25** — Maintenance LTS patch for [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) and [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4). Stays on 15.5.x (Node `>=22.18.0 <23`); Next 16 is not required for these advisories.

## Still red / deferred

- **Lint** — repo-wide Biome (~177 errors on `main`). Do not mass `biome check --write`.
- **pptxgenjs → image-size** — high-severity DoS advisories; `npm audit fix --force` would install pptxgenjs 2.2.0 (breaking). Keep the existing PPTX request/signature bounds.
- **`@huggingface/transformers` → `sharp` / `adm-zip` / `onnxruntime-node`** — remaining high/moderate. `npm audit fix --force` would jump transformers to 4.3.0 (breaking). The repo already overrides `sharp` to `^0.35.3` and `adm-zip` to `^0.6.0`; Next 15.5.25 prefers `sharp ^0.35.4` for AVIF re-enable, but that patch is not taken here because transformers still reports the 4.3.0 major as the audit fix.
- **Server-side account consent flag** — #5 uses localStorage + session confirm, not an encrypted account record.
- **`GEMINI_API_KEY` on account runtimes** — end-user BYOK is Replicate/OpenAI; Creative Director prefers Replicate Gemini via the user Replicate key. Direct Google env key is still ops/unscoped.
- **Present menu `?projectId=`** — editor still opens `/present` without the current project id. #5 hydrates from last-opened / query; wiring the menu would overlap `editor/page.tsx` with #4.
- **`AI_MONTHLY_BUDGET_USD`** — documented in README / `.env.local.example`; `getAiBudgetStatus()` still returns `monthlyBudgetUsd: null`. Wire it into `RoutedAiRuntime` or drop the env var.
- **Linked Assets** — `lib/engine/linkedAssets.ts` File System Access adapter exists; ship a visible editor path or delete the unused surface.
