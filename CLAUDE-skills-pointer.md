SolidActions workflow project. AI skills are installed in `.claude/skills/` and auto-activate when relevant:

- `solidactions-getting-started` — new-project scaffolding and bootstrap discipline
- `solidactions-workflow-coding` — editing TS workflow code (SDK rules, determinism, recipes)
- `solidactions-deploy-and-config` — deploying, env vars, triggers, debugging runs

Full SDK reference: `.solidactions/sdk-reference.md`. Read before using any SDK function you do not know cold.

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
9. Internal workflows do NOT call `SolidActions.run()`. Only export the registered workflow.
10. Scheduling is YAML-only — configure cron in `solidactions.yaml`, not in code.
11. Workflow inputs and outputs must be JSON-serializable.

### Messaging
12. `send()` / `recv()` without a topic are in a separate channel from calls with a topic. Don't mix them expecting one to receive the other.

Workflow examples: https://github.com/SolidActions/solidactions-examples
