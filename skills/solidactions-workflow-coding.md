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

## Pointers

- Full SDK reference: `.solidactions/sdk-reference.md`
- Webhook auth, env var management, deployment: see the `solidactions-deploy-and-config` skill.
