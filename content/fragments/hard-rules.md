---
fragment: hard-rules
description: The numbered "Hard Rules — NEVER violate" block shared verbatim by CLAUDE.md and AGENTS.md.
renderers: [guide, skills]
placeholders: []
conditions: []
---
## Hard Rules — NEVER violate

### Determinism
1. Workflows must be deterministic — same inputs produce the same step calls in the same order.
2. Non-deterministic ops (`fetch`, `fs`, `Math.random`, external APIs) must run inside `SolidActions.runStep()` — never directly in workflow functions.
3. Use `SolidActions.now()` instead of `Date.now()` / `new Date()`.
4. Use `SolidActions.randomUUID()` instead of `crypto.randomUUID()` / `Math.random()`.
5. Prefer `Promise.allSettled()` over `Promise.all()` for parallel steps unless fail-fast is genuinely what you want — `Promise.all` rejects on first failure and leaves sibling step promises unresolved, which corrupts workflow state.

### Step & workflow discipline
6. Do NOT call context methods (`send`, `recv`, `sleep`, `setEvent`, `getEvent`, `startWorkflow`, `respond`) inside a step. They belong in the workflow function.
7. Do NOT start workflows from inside a step.
8. Steps should not mutate shared in-memory state (module-level variables, globals). External side effects (API calls, DB writes, file I/O) are the whole point of steps — it's in-memory mutation that breaks replay.
9. All workflows use `defineWorkflow({ name, run: (ctx) => ... })` and export the handle. Internal workflows are not declared as entry points in `solidactions.yaml` — that is the only distinction. There is no `SolidActions.run()` call.
10. Scheduling is YAML-only — configure cron in `solidactions.yaml`, not in code.
11. Workflow inputs and outputs must be JSON-serializable.

### Messaging
12. `send()` / `recv()` without a topic are in a separate channel from calls with a topic. Don't mix them expecting one to receive the other.

### Deploy & secrets
13. Never bundle secrets. `.env` and `.env.*` are **always** stripped from the deploy bundle and can't be re-included — set secrets via `solidactions env set`. Variables declared in `solidactions.yaml` arrive ONLY via `ctx.vars` (as of SDK 0.6.0 they are not exposed in `process.env` — secrets never reach `process.env`). `node_modules/`, `.git/`, `dist/`, `vendor/` are excluded by default; use `deploy.exclude` / `deploy.gitignore` in `solidactions.yaml` to keep other paths out. See the `solidactions-deploy-and-config` skill.
