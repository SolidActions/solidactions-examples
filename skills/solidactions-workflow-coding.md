---
name: solidactions-workflow-coding
description: Use when writing or modifying TypeScript code in a SolidActions project (any file importing `@solidactions/sdk`, any edit under `src/workflows/` or `src/`, or any user mention of writing a workflow, step, or trigger). Encodes SDK API truth, determinism rules, the respond() early-response pattern, and the instant-vs-wait trigger choice.
---

> **READ `.solidactions/sdk-reference.md` BEFORE using any SDK function you do not know cold.** AIs reliably invent SDK methods that don't exist (e.g., `step.invoke()`, `workflow.spawn()`, `defineWorkflow()`). The reference file is the source of truth — it's pinned to your installed SDK version. If the function isn't in that file, it doesn't exist. Don't write it.

## Hard Rules

1. **Determinism: SDK primitives at workflow scope, native APIs inside a `runStep` body.**
   - **At workflow scope** (outside any `runStep`): replace `Date.now()` with `SolidActions.now()` and `crypto.randomUUID()` / `Math.random()` with `SolidActions.randomUUID()`. These durable primitives record their value on first execution and return the same value on replay.
   - **Inside a `runStep` body**: `new Date()`, `crypto.randomUUID()`, `Math.random()`, etc. are fine — the step's return value is what gets cached, so the non-determinism is contained. Using native APIs inside the step keeps the checkpoint log clean.
   - For any other non-deterministic op with no SDK primitive (calling an external API, reading a file), wrap the call in `SolidActions.runStep(...)` so its output is captured for replay.
   - *Why: workflows replay on resume; non-deterministic values at workflow scope cause divergence. But each call to `SolidActions.now()` / `randomUUID()` creates a visible checkpoint step — 3 primitives in a loop body = 3× step noise per iteration. Using the primitives **only for values that cross step boundaries** gets correctness without polluting `run view --steps` output.*

2. **Wait-mode webhooks: `SolidActions.respond(body)` is the ONLY way to deliver a response body.**
   - `await SolidActions.respond({ ... })` sends the HTTP body and unblocks the caller. Returning a value from the workflow function does **NOT** send anything — the runtime ignores the return value.
   - This applies to both patterns:
     - **Simple request-response:** call `respond(body)` then `return` (see "Wait-mode Webhook with Synchronous Response" recipe).
     - **Early response + background work:** call `respond(body)` early, then continue with steps (see "Webhook with Early Response + Background Work" recipe).
   - *Why: a wait-mode workflow that runs successfully but never calls `respond()` looks like `HTTP 401 {"error":"Unauthorized"}` to the caller — a misleading symptom with no auth connection, burns hours to diagnose. Webhook callers (Stripe, GitHub, etc.) also time out fast, so the early-response variant exists for when you need to keep working after sending the body.*

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

## Recipe — Wait-mode Webhook with Synchronous Response

For a simple request-response webhook (`response.mode: wait` in `solidactions.yaml`) that does fast work and returns a value to the caller. **You MUST call `SolidActions.respond(body)` — returning a value from the workflow function alone does NOT send anything to the caller.**

```typescript
import { SolidActions } from '@solidactions/sdk';

interface FormatInput { markdown: string }

async function transformMarkdown(md: string) {
  // ... do the work
  return md.toUpperCase();
}

async function formatWorkflow(input: FormatInput): Promise<void> {
  const linkedin = await SolidActions.runStep(
    () => transformMarkdown(input.markdown),
    { name: 'format' },
  );

  // ✅ respond() delivers the HTTP response body.
  await SolidActions.respond({ linkedin });
  // Nothing to return — respond() already sent the body.
}

const workflow = SolidActions.registerWorkflow(formatWorkflow, {
  name: 'format-linkedin',
});
SolidActions.run(workflow);
```

YAML:

```yaml
workflows:
  - id: format-linkedin
    name: Format LinkedIn Post
    file: src/format-linkedin.ts
    trigger: webhook
    webhook:
      auth: none
      response:
        mode: wait
        timeout: 30
```

### Common trap — `return` instead of `respond()`

```typescript
// ❌ Workflow runs successfully but the caller gets HTTP 401 {"error":"Unauthorized"}.
// In wait-mode the runtime does NOT read the return value as the response body.
async function formatWorkflow(input: FormatInput) {
  const linkedin = await SolidActions.runStep(
    () => transformMarkdown(input.markdown),
    { name: 'format' },
  );
  return { linkedin };   // silently ignored — gateway returns 401
}
```

The 401 is misleading — there's no auth problem; the gateway has no body to return and falls through to its default error. Replace `return { linkedin }` with `await SolidActions.respond({ linkedin })` to fix.

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

Two rules, applied by **scope** of where the non-deterministic call lives:

```typescript
import { SolidActions } from '@solidactions/sdk';

// ── At workflow scope (outside any runStep): use SDK primitives ─────────

// ❌ Wrong: native APIs at workflow scope diverge on replay
const id = crypto.randomUUID();
const startedAt = Date.now();

// ✅ Right: SDK primitives record their value on first execution
const id = await SolidActions.randomUUID();
const startedAt = await SolidActions.now();

// ── Inside a runStep body: native APIs are fine (and quieter) ───────────

// ✅ Right: native APIs inside the step. The step's return value is what
// gets cached, so replay returns the cached output — the native call is
// contained. This keeps the checkpoint log uncluttered.
async function insertSubmission(email: string, message: string) {
  const id = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  // ... INSERT INTO submissions (...) VALUES (id, email, message, savedAt)
  return { id, savedAt };
}

await SolidActions.runStep(
  () => insertSubmission(email, message),
  { name: 'insert-submission' },
);

// ── For ops with no SDK primitive: wrap in runStep ──────────────────────
const slug = await SolidActions.runStep(() => generateCustomSlug(), {
  name: 'generate-slug',
});
```

### Step noise in loops

`SolidActions.now()` and `SolidActions.randomUUID()` each create a visible checkpoint step. In a loop that uses both, you pay 3 steps per iteration instead of 1:

```typescript
// ❌ Noisy: 3 steps per iteration
for (const item of items) {
  const id = await SolidActions.randomUUID();
  const now = await SolidActions.now();
  await SolidActions.runStep(() => writeItem(item, id, now), { name: `write-${item.key}` });
}

// ✅ Clean: 1 step per iteration, same correctness
for (const item of items) {
  await SolidActions.runStep(async () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    return writeItem(item, id, now);
  }, { name: `write-${item.key}` });
}
```

Use the SDK primitive when the value needs to **survive across** step boundaries — e.g., an ID generated up front that multiple later steps reference. When it only lives inside a single `runStep` body, native APIs are the correct choice.

### Retry semantics inside a step

When a step retries, any `crypto.randomUUID()` / `new Date()` calls inside the step body regenerate — the previous attempt's values are not preserved. This is usually what you want (clean idempotency: a retried write gets a fresh ID and timestamp). If you need the same value across retries of a single step, use the SDK primitive *outside* the step and pass it in.

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

## Recipe — Parent-Child Workflow

For work that benefits from being structured as a nested flow, encapsulating reusable logic, or running with independent timeout/retry policies. The child workflow uses `trigger: internal` (no URL, never called from outside) and the parent uses `SolidActions.startWorkflow()` to invoke it.

### YAML

```yaml
project: my-project

workflows:
  - id: parent
    name: Parent
    file: src/parent.ts
    trigger: webhook

  - id: child
    name: Child
    file: src/child.ts
    trigger: internal   # no URL — only spawnable from other workflows
```

### Child (src/child.ts)

```typescript
import { SolidActions } from '@solidactions/sdk';

interface ChildInput { value: number }
interface ChildOutput { doubled: number }

async function childFunction(input: ChildInput): Promise<ChildOutput> {
  const result = await SolidActions.runStep(
    () => ({ doubled: input.value * 2 }),
    { name: 'double' },
  );
  return result;
}

// Export only — internal workflows do NOT call SolidActions.run() (Hard Rule 11).
export const childWorkflow = SolidActions.registerWorkflow(childFunction, {
  name: 'child',
});
```

### Parent (src/parent.ts)

```typescript
import { SolidActions } from '@solidactions/sdk';
import { childWorkflow } from './child.js';

interface ParentInput { value: number }

async function parentFunction(input: ParentInput) {
  // startWorkflow returns a curried function — invoke it with the child's args:
  const handle = await SolidActions.startWorkflow(childWorkflow)(input);

  // You can do other work here in parallel before waiting:
  // await SolidActions.runStep(() => somethingElse(), { name: 'other' });

  const result = await handle.getResult();
  return result;
}

const workflow = SolidActions.registerWorkflow(parentFunction, { name: 'parent' });
SolidActions.run(workflow);
```

To impose a timeout on the child: `SolidActions.startWorkflow(childWorkflow, { timeoutMS: 60_000 })(input)`. To make the child idempotent on a business key, pass `workflowID` so repeated calls with the same key execute once.

## Recipe — Workflow-to-Workflow Messaging

For async coordination where one workflow hands off work to another and later picks up a result on a named topic. Unlike parent-child (parent blocks on `getResult()`), messaging uses a mailbox — the receiver calls `recv()` when it's ready.

### YAML

```yaml
workflows:
  - id: receiver
    name: Receiver
    file: src/receiver.ts
    trigger: webhook

  - id: sender
    name: Sender
    file: src/sender.ts
    trigger: internal
```

### Sender (src/sender.ts)

```typescript
import { SolidActions } from '@solidactions/sdk';

interface SenderInput { callbackWorkflowID: string; payload: string }

async function processData(data: string) {
  // ... do the actual work
  return { processed: data.toUpperCase() };
}

async function senderFunction(input: SenderInput): Promise<void> {
  const result = await SolidActions.runStep(
    () => processData(input.payload),
    { name: 'process' },
  );
  // Post back to the caller's mailbox on a named topic:
  await SolidActions.send(input.callbackWorkflowID, result, 'task-result');
}

export const messageSender = SolidActions.registerWorkflow(senderFunction, {
  name: 'sender',
});
```

### Receiver (src/receiver.ts)

```typescript
import { SolidActions } from '@solidactions/sdk';
import { messageSender } from './sender.js';

interface ReceiverInput { payload: string }

async function receiverFunction(input: ReceiverInput) {
  // Kick off the sender, passing OUR workflow ID as the return address:
  await SolidActions.startWorkflow(messageSender)({
    callbackWorkflowID: SolidActions.workflowID!,
    payload: input.payload,
  });

  // Block until the sender posts to our 'task-result' mailbox (5 min timeout):
  const result = await SolidActions.recv<{ processed: string }>('task-result', 300);
  if (!result) throw new Error('sender timed out');
  return result;
}

const workflow = SolidActions.registerWorkflow(receiverFunction, { name: 'receiver' });
SolidActions.run(workflow);
```

Topics matter: messages sent with topic `'task-result'` are in a separate channel from messages sent without a topic (Hard Rule 13). `recv()` returns `null` on timeout — handle it. Don't call `send()` or `recv()` inside a `runStep()` body (Hard Rule 8).

## Recipe — Human Approval (Signal URLs)

For workflows that pause and wait for a human to click an approve/reject link. `SolidActions.getSignalUrls()` returns pre-built URLs the platform resolves into signals on a named topic.

```typescript
import { SolidActions } from '@solidactions/sdk';

interface ApprovalInput { requestID: string; description: string }

async function createApprovalRecord(input: ApprovalInput) {
  // ... persist the pending approval in your DB
}

async function notifyApprover(args: {
  to: string;
  approveUrl: string;
  rejectUrl: string;
  description: string;
}) {
  // ... send email / Slack / etc with the clickable URLs
}

async function approvalWorkflow(input: ApprovalInput): Promise<{ approved: boolean }> {
  await SolidActions.runStep(
    () => createApprovalRecord(input),
    { name: 'record-request' },
  );

  // getSignalUrls is SYNCHRONOUS — no await.
  const urls = SolidActions.getSignalUrls('approval');
  // urls: { base, approve, reject, custom: (action) => url }

  await SolidActions.runStep(
    () =>
      notifyApprover({
        to: 'approver@example.com',
        approveUrl: urls.approve,
        rejectUrl: urls.reject,
        description: input.description,
      }),
    { name: 'notify-approver' },
  );

  // Container exits here. When the approver clicks a link, the platform posts
  // a signal on the 'approval' topic and the workflow resumes. Wait up to 24h.
  const signal = await SolidActions.recv<{ choice: string; reason?: string }>(
    'approval',
    86400,
  );

  if (!signal) return { approved: false }; // timeout
  return { approved: signal.choice === 'approve' };
}

const workflow = SolidActions.registerWorkflow(approvalWorkflow, { name: 'approval' });
SolidActions.run(workflow);
```

The topic argument to `getSignalUrls('approval')` must match the topic passed to `recv('approval', ...)` — signals route by topic. For more than approve/reject, use `urls.custom('some-action')` to get a URL that signals with that action name. Workflows durably resume across restarts, so timeouts of hours or days are fine.

## Recipe — Calling External Services From a Step

These aren't SolidActions bugs — they're first-time traps from the libraries real projects depend on inside `runStep` bodies. Each has burned an hour for someone.

### LLM SDKs (Anthropic / OpenAI) — explicit `baseURL`, check `stop_reason`

Two failure modes in one call site:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: 'https://api.anthropic.com',   // pass explicitly — do NOT rely on env-var fallback
});

async function extractFields(text: string) {
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: text }],
  });

  // Always check truncation before parsing. A response hit at max_tokens is
  // almost always invalid JSON — parsing it first gives a cryptic SyntaxError
  // with no hint about the real cause.
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(`LLM response truncated at ${resp.usage?.output_tokens} tokens — raise max_tokens or shorten input`);
  }

  const block = resp.content[0];
  if (block.type !== 'text') throw new Error(`unexpected content block: ${block.type}`);
  return JSON.parse(block.text);
}
```

- **Why explicit `baseURL`:** the Anthropic SDK reads `ANTHROPIC_BASE_URL` from the environment. If the runtime has one set (intentionally or by accident — seen in the wild literally set to `"base"`), the SDK will use it as the base URL and every call fails with a DNS error (`ENOTFOUND base`) that looks like a network problem, not an SDK-config problem. Passing `baseURL` in the constructor wins over the env var.
- **Why check `stop_reason`:** a truncated response is almost always invalid JSON. Parsing it first surfaces a `SyntaxError` at an arbitrary offset; checking `stop_reason` first gives you a clear error message pointing at the real cause.

### Postgres — `sslmode=require` with self-signed certs

`node-postgres` prioritizes the URL's `sslmode` over the `ssl` constructor option. A URL that ends `?sslmode=require` forces full certificate verification and ignores `rejectUnauthorized: false` — which fails against self-signed cert chains (including the shared SolidActions Postgres).

```typescript
import pg from 'pg';

// ❌ Silently ignored — sslmode=require in the URL wins
new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

// ✅ Strip sslmode from the URL; pass ssl via constructor config instead
function buildClientConfig(url: string): pg.ClientConfig {
  if (url.includes('sslmode=require')) {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      database: parsed.pathname.slice(1),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: { rejectUnauthorized: false },
    };
  }
  return { connectionString: url };
}

const client = new pg.Client(buildClientConfig(process.env.DATABASE_URL!));
```

### Postgres — type coercion quirks

`node-postgres` returns some column types as JavaScript values that don't match the obvious TypeScript expectation:

| Postgres type | JS value returned | Fix |
|---|---|---|
| `numeric` / `decimal` | **string** (preserves precision) | `Number(row.total)` — or keep as string if you need arbitrary precision |
| `date` (no time) | **Date** object (local midnight) | `row.day.toISOString().slice(0, 10)` for an ISO date string |
| `timestamp` / `timestamptz` | `Date` object | usually fine; use `.toISOString()` when stringifying |

A TypeScript type like `{ total: number; day: string }` will compile but be wrong at runtime — template-string interpolating a Date produces `"Wed Apr 15 2026 00:00:00 GMT+0000"`, not an ISO date. Either cast in the query (`SELECT total::float8, day::text FROM ...`) or convert in JS after reading.

## Pointers

- Full SDK reference: `.solidactions/sdk-reference.md`
- Webhook auth, env var management, deployment: see the `solidactions-deploy-and-config` skill.
