---
name: solidactions-workflow-coding
description: Use when writing or modifying TypeScript code in a SolidActions project (any file importing `@solidactions/sdk`, any edit under `src/workflows/` or `src/`, or any user mention of writing a workflow, step, or trigger). Encodes SDK API truth, determinism rules, the respond() early-response pattern, and the instant-vs-wait trigger choice.
---

> **READ `.solidactions/sdk-reference.md` BEFORE using any SDK function you do not know cold.** AIs reliably invent SDK methods that don't exist (e.g., `step.invoke()`, `workflow.spawn()`, `defineWorkflow()`). The reference file is the source of truth — it's pinned to your installed SDK version. If the function isn't in that file, it doesn't exist. Don't write it.

## Hard Rules

1. **Determinism: use SDK durable primitives first; fall back to `SolidActions.runStep()` only when no SDK primitive exists.**
   - Replace `Date.now()` with `SolidActions.now()` — the SDK's durable timestamp primitive.
   - Replace `crypto.randomUUID()` and `Math.random()` with `SolidActions.randomUUID()` — the SDK's durable UUID primitive.
   - If you need a non-deterministic operation with no SDK primitive (e.g., calling an external API, generating a non-UUID random string), wrap it inside a `SolidActions.runStep(...)` body so its output is captured for replay.
   - *Why: workflows replay on resume; non-deterministic values outside steps cause divergence and broken state.*

2. **Webhooks that do work after responding: use `SolidActions.respond()` for the early response.**
   - The pattern is: call `await SolidActions.respond({ ... })` early, then continue with steps that send emails, call APIs, etc.
   - *Why: webhook callers (Stripe, GitHub, etc.) time out fast. Responding early then doing durable work in steps is the correct pattern.*

3. **Trigger choice: default to `instant`. Use `wait` only with explicit user intent.**
   - `instant` triggers fire as soon as the event arrives — correct for ~80% of cases (form submissions, webhooks, scheduled events).
   - `wait` is for workflows that block until an external signal arrives mid-execution.
   - *Why: AIs over-pick `wait` because the name sounds "safer." It's wrong for most cases and adds latency.*

4. **Step names must be stable across runs.**
   - The `name` option passed to `SolidActions.runStep(fn, { name: '...' })` is used as the cache key. Renaming a step across deploys breaks in-flight runs.
   - *Why: step caching uses the name as the lookup key; rename = cache miss = re-execution of already-completed work.*

5. **Secrets: never hardcode. Reference via `process.env.X` and document in `.env.example`.**
   - Setting the actual value happens via `solidactions env set` (covered by the deploy-and-config skill).
   - *Why: secrets in source = checked into git = leaked.*

6. **Step return values must be small. Pass references between steps, not large payloads.**
   - The value returned from a `SolidActions.runStep()` body is serialized into the workflow's persistent state for replay. Returning large objects (file bytes, base64-encoded media, multi-MB JSON, raw HTTP bodies) bloats the run's storage and can exceed practical durability limits.
   - When a step produces something large (a downloaded file, a generated PDF, a video frame, a large API response): write it to durable external storage inside the step (S3/R2/blob storage, a tmp file path the next step can re-read, a database row), and return a **reference** — a URL, storage key, file path, or row ID. Re-fetch or re-open the bytes inside the next step that needs them.
   - Rule of thumb: if a step return value would be larger than ~100KB serialized, you're probably doing it wrong. Pass a reference instead.
   - *Why: durable workflow state is meant for small coordination data (IDs, status flags, references) — not for piping large payloads through the orchestration layer. Bloated state slows resumes, hits storage limits, and complicates debugging.*

7. **Prefer `Promise.allSettled()` over `Promise.all()` for parallel steps.**
   - `Promise.all` rejects on first failure and leaves sibling step promises unresolved, which corrupts workflow state. `Promise.allSettled` lets every parallel step finish (or fail) independently, and you handle the results.
   - Only use `Promise.all` if you genuinely want fail-fast and no other steps may continue.
   - *Why: a partially-resolved `Promise.all` leaves dangling step state that poisons replay.*

8. **Do NOT call SDK context methods inside a step.**
   - `SolidActions.send`, `SolidActions.recv`, `SolidActions.sleep`, `SolidActions.setEvent`, `SolidActions.getEvent`, `SolidActions.startWorkflow`, and `SolidActions.respond` belong in the workflow function, not inside a `runStep()` body.
   - *Why: these methods coordinate durable state. Calling them inside a step (which itself is a replay-cached unit) creates double-booking of durable operations on replay.*

9. **Do NOT start workflows from inside a step.**
   - Use `SolidActions.startWorkflow(...)` at the workflow-function level.
   - *Why: same replay-determinism reason as rule 8 — child-workflow identity must be stable across replays.*

10. **Steps should not mutate shared in-memory state.**
    - Module-level variables, globals, shared caches — reading is fine, mutating is not.
    - External side effects (API calls, DB writes, file I/O) are the whole point of steps. This rule is about in-process memory that replay will see stale on resume.
    - *Why: replay re-runs the workflow function from scratch but pulls cached step results. Mutated in-memory state from a previous execution won't exist on replay, producing different code paths.*

11. **Internal workflows do NOT call `SolidActions.run()`.**
    - Only export the registered workflow; the top-level entry workflow for the project is the one that calls `SolidActions.run()`.
    - *Why: `SolidActions.run()` wires the project's single entrypoint. Calling it inside a workflow file meant to be imported by another workflow creates multiple entrypoints and breaks routing.*

12. **Workflow inputs and outputs must be JSON-serializable.**
    - No classes, functions, `Date` objects (use ISO strings), `Map`/`Set`, `BigInt`, or symbols at the boundaries.
    - *Why: the runner serializes inputs/outputs across the network and into durable storage. Non-JSON values silently lose fidelity.*

13. **`send()` / `recv()` without a topic are on a separate channel from calls with a topic.**
    - If one side calls `send(msg, 'orders')` and the other calls `recv()` with no topic, the message is never received.
    - *Why: topics are first-class channel keys, not optional tags. Default (no-topic) is its own channel.*

## Recipe — Webhook with Early Response + Background Work

The canonical SDK pattern uses `SolidActions` (the namespace import) — not standalone `step()` or `defineWorkflow()`.

```typescript
import { SolidActions } from '@solidactions/sdk';

interface FormInput {
  email: string;
  message: string;
}

async function saveToDb(email: string, message: string) {
  const dbUrl = process.env.DATABASE_URL;
  // ... save logic
  return { saved: true };
}

async function sendConfirmation(email: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  // ... email logic
  return { sent: true };
}

async function handleFormWorkflow(input: FormInput) {
  // Respond immediately so the form caller doesn't time out.
  await SolidActions.respond({ received: true });

  // Now do the actual work in named steps (results are cached for replay).
  await SolidActions.runStep(() => saveToDb(input.email, input.message), {
    name: 'save-to-db',
  });

  await SolidActions.runStep(() => sendConfirmation(input.email), {
    name: 'send-confirmation-email',
  });
}

const workflow = SolidActions.registerWorkflow(handleFormWorkflow, {
  name: 'handle-form-submission',
});
SolidActions.run(workflow);
```

Verify the import names against `.solidactions/sdk-reference.md` if the SDK has been updated since this skill was authored.

## Recipe — Determinism

```typescript
import { SolidActions } from '@solidactions/sdk';

// ❌ Wrong: native APIs outside any step
const id = crypto.randomUUID();        // non-deterministic on replay
const startedAt = Date.now();          // non-deterministic on replay

// ✅ Right (preferred): SDK durable primitives
const id = await SolidActions.randomUUID();
const startedAt = await SolidActions.now();

// ✅ Right (fallback): wrap a native call inside SolidActions.runStep()
// — use this when no SDK primitive exists (e.g., calling an external API,
// generating a non-UUID random string).
const slug = await SolidActions.runStep(() => generateCustomSlug(), {
  name: 'generate-slug',
});
```

Even *inside* a step body, prefer SDK primitives. `new Date()` inside a step is replay-safe today (the step's return value is cached), but it's one refactor away from silently breaking — someone moves the line out of the step and replay corruption is back. Using the primitive keeps the code safe under refactoring.

```typescript
// ✅ Right (inside a step): keep using SDK primitives so the step stays
// refactor-safe. `await SolidActions.now()` returns epoch ms; convert to
// an ISO string with `new Date(ms).toISOString()` if you need a string.
async function insertSubmission(email: string, message: string) {
  const nowMs = await SolidActions.now();
  const savedAt = new Date(nowMs).toISOString();
  // ... INSERT INTO submissions (...) VALUES (..., savedAt) ...
  return { savedAt };
}

const saved = await SolidActions.runStep(
  () => insertSubmission(email, message),
  { name: 'insert-submission' },
);
```

Verify primitive names against `.solidactions/sdk-reference.md` if the SDK has been updated since this skill was authored.

## Recipe — Passing Large Data Between Steps

Return a reference (file path, storage key, URL) from a step, then re-open the resource inside the next step that needs it.

```typescript
import { SolidActions } from '@solidactions/sdk';
import fs from 'fs/promises';
import path from 'path';

async function downloadLargeFile(url: string): Promise<string> {
  // Step downloads to disk and returns the PATH, not the bytes.
  const resp = await fetch(url);
  const buf = Buffer.from(await resp.arrayBuffer());
  const filePath = path.join('/tmp', `download-${await SolidActions.now()}.bin`);
  await fs.writeFile(filePath, buf);
  return filePath;  // ✅ small string reference, not the bytes
}

async function processFile(filePath: string): Promise<{ checksum: string; size: number }> {
  // Re-open the file inside the step that needs it.
  const buf = await fs.readFile(filePath);
  // ... do work
  return { checksum: '...', size: buf.length };  // ✅ small summary, not the bytes
}

async function pipelineWorkflow(input: { url: string }) {
  const filePath = await SolidActions.runStep(() => downloadLargeFile(input.url), {
    name: 'download',
  });

  const result = await SolidActions.runStep(() => processFile(filePath), {
    name: 'process',
  });

  // Returning small summary data: fine.
  // Returning the file bytes: would bloat state — never do this.
  return result;
}

const workflow = SolidActions.registerWorkflow(pipelineWorkflow, { name: 'file-pipeline' });
SolidActions.run(workflow);
```

```typescript
// ❌ Wrong: returning bytes from one step to another
const bytes = await SolidActions.runStep(() => downloadLargeFile(input.url), { name: 'download' });
// `bytes` is now serialized into the workflow's durable state — could be megabytes.
const result = await SolidActions.runStep(() => process(bytes), { name: 'process' });
```

For external blob storage (S3 / R2 / etc.), the same rule applies — return the storage key or URL, not the bytes.

## Pointers

- Full SDK reference: `.solidactions/sdk-reference.md`
- Webhook auth, env var management, deployment: see the `solidactions-deploy-and-config` skill.
