# Audit follow-ups (deferred)

Short list of known remaining work. Not in this quality-gate PR.

## Merge order

1. **#4** P0 — serialize autosave, lock cloud AI auth/consent
2. **#5** P1 — BYOK, client consent, PPTX frames, save/undo, campaign, present
3. **This PR** — test/typecheck honesty (independent of #4/#5)

## Still red / deferred

- **Lint** — repo-wide Biome (~177 errors on `main`). Do not mass `biome check --write`.
- **Next.js major bump** — `next` 15.x has critical/high advisories. Separate, risky PR.
- **pptxgenjs → image-size** — high-severity advisories; no fixed upstream. Do not `npm audit fix --force`.
- **Server-side account consent flag** — #5 uses localStorage + session confirm, not an encrypted account record.
- **`GEMINI_API_KEY` on account runtimes** — end-user BYOK is Replicate/OpenAI; Creative Director prefers Replicate Gemini via the user Replicate key. Direct Google env key is still ops/unscoped.
- **Present menu `?projectId=`** — editor still opens `/present` without the current project id. #5 hydrates from last-opened / query; wiring the menu would overlap `editor/page.tsx` with #4.
- **`AI_MONTHLY_BUDGET_USD`** — documented in README / `.env.local.example`; `getAiBudgetStatus()` still returns `monthlyBudgetUsd: null`. Wire it into `RoutedAiRuntime` or drop the env var.
- **Linked Assets** — `lib/engine/linkedAssets.ts` File System Access adapter exists; ship a visible editor path or delete the unused surface.
