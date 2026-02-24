# SolidActions Developer Reference

This file contains everything an AI agent needs to write, test, and deploy SolidActions workflow projects. No other documentation is required.

## Project Structure

Every SolidActions project follows this layout:

```
my-project/
├── package.json          # Dependencies: @solidactions/sdk ^0.1.1
├── solidactions.yaml     # Workflow definitions
├── tsconfig.json         # TypeScript config (ES2022, NodeNext)
├── .env                  # Local environment variables (not committed)
├── .env.example          # Template for required env vars
└── src/
    └── my-workflow.ts    # Workflow source files
```

### package.json

```json
{
  "name": "my-project",
  "type": "module",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@solidactions/sdk": "^0.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

Key: `"type": "module"` is required for ESM.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

Key: NodeNext module resolution requires `.js` extensions on all relative imports:

```typescript
// CORRECT — always use .js extension for relative imports
import { childTask } from './child-workflow.js';

// WRONG — will fail with NodeNext resolution
import { childTask } from './child-workflow';
```

### solidactions.yaml

```yaml
project: my-project

workflows:
  - id: my-workflow
    name: My Workflow
    description: Handles incoming requests
    file: src/my-workflow.ts
    trigger: webhook

  - id: child-task
    name: Child Task
    file: src/child-task.ts
    trigger: internal

  - id: scheduled-task
    name: Scheduled Task
    file: src/scheduled-task.ts
    trigger: schedule
    schedule: "0 * * * *"

  - id: webhook-api
    name: Webhook API
    file: src/webhook-api.ts
    trigger: webhook
    webhook:
      method: [GET, POST]
      auth: none
      response: wait
      timeout: 60

env:
  - MY_VAR                    # Declared only, configure via UI/CLI
  - MY_VAR: MY_GLOBAL_VAR    # Mapped to a global variable
  - GITHUB_TOKEN:             # Mapped to an OAuth connection
      oauth: "GitHub Personal"
```

#### OAuth connection mapping

Map an env var to a named OAuth connection. The platform fetches a fresh access token from Nango at runtime and injects it as the env var.

```yaml
env:
  - GITHUB_TOKEN:
      oauth: "GitHub Personal"    # Must match an OAuth connection name in the UI
  - GOOGLE_TOKEN:
      oauth: "Google Calendar 1"
```

- An env var maps to **either** a global variable **or** an OAuth connection, not both
- Connection names must be unique per tenant
- If the connection doesn't exist yet, it auto-resolves when created later
- Workflow code accesses the token via `process.env.GITHUB_TOKEN`

#### Trigger types

| Trigger | Description |
|---------|-------------|
| `webhook` | HTTP-triggered (default). Gets a URL after deployment. |
| `internal` | Spawned by other workflows via `startWorkflow()`. Does NOT call `SolidActions.run()`. |
| `schedule` | Cron-triggered. Requires `schedule:` field with cron expression. |

#### Webhook configuration options

```yaml
webhook:
  method: [GET, POST]       # Allowed HTTP methods (default: POST)
  auth: none                # hmac | basic | header | none (default: hmac)
  auth_header: X-API-Key    # Custom header name (for auth: header)
  response: wait            # instant | wait (default: instant)
  timeout: 60               # Wait timeout in seconds, 1-300 (default: 30)
  path: hooks/my-endpoint   # Custom URL path (optional, must be unique)
```

For a simple webhook with defaults, just use `trigger: webhook` with no `webhook:` block.

#### Authentication strategies

| Strategy | YAML Value | How It Works |
|----------|-----------|--------------|
| **HMAC** (default) | `hmac` | SHA-256 signature via `X-Hub-Signature-256`, `X-Signature-256`, or `Stripe-Signature` headers |
| **Basic** | `basic` | HTTP Basic Auth with stored credentials |
| **Header** | `header` | Custom header (default `X-API-Key`) checked against webhook secret. Customize with `auth_header`. |
| **None** | `none` | No authentication. All requests accepted. |

#### Custom instant response with template variables

Override the default 202 response with a custom status code and body:

```yaml
webhook:
  method: POST
  auth: none
  response:
    mode: instant
    status: 200
    body:
      ok: true
      request_id: "{{run_uuid}}"
      trigger: "{{trigger_id}}"
      received_at: "{{timestamp}}"
```

Template variables resolved at request time: `{{run_uuid}}`, `{{trigger_id}}`, `{{timestamp}}`.

#### Wait-mode early response

In wait-mode webhook workflows, the SDK's `respond()` method sends an explicit response to the caller before the workflow finishes. If `respond()` is never called, the caller receives the workflow's final return value instead.

---

## SolidActions SDK Reference

Install and import from `@solidactions/sdk`:

```typescript
import { SolidActions } from "@solidactions/sdk";
```

### Lifecycle — SolidActions.run()

Platform workflows use `SolidActions.run()` which handles the full lifecycle automatically: launch, read WORKFLOW_INPUT, startWorkflow, getResult, shutdown, exit.

```typescript
const workflow = SolidActions.registerWorkflow(workflowFunction, { name: 'my-workflow' });
SolidActions.run(workflow);
```

`SolidActions.run()` auto-reads workflow input from the `WORKFLOW_INPUT` environment variable (set by the platform runner).

```typescript
static async run<T, R>(
  workflow: (input: T) => Promise<R>,
  options?: {
    input?: T;           // Pre-parsed input (overrides WORKFLOW_INPUT)
    workflowID?: string; // Custom workflow ID
  },
): Promise<void>
```

**Internal (child) workflows** don't call `SolidActions.run()` — they only export the registered workflow for parent workflows to import and start via `SolidActions.startWorkflow()`.

**Standalone/local dev** uses `setConfig`/`launch` instead:

```typescript
SolidActions.setConfig({ name: 'my-app' });
await SolidActions.launch();
// ... start workflows manually ...
await SolidActions.shutdown();
```

### Workflows

Register a workflow function with `SolidActions.registerWorkflow`. Inputs and outputs must be JSON-serializable.

```typescript
async function myWorkflow(input: MyInput): Promise<MyOutput> {
  const result = await SolidActions.runStep(() => doWork(input), { name: "doWork" });
  return { success: true, data: result };
}

const workflow = SolidActions.registerWorkflow(myWorkflow, { name: 'my-workflow' });
SolidActions.run(workflow);
```

### Steps

Steps are the building blocks of durable execution. Any function that performs non-deterministic work (API calls, file I/O, random numbers, timestamps) must be wrapped in a step. Inside a step, you write normal Node.js — use `fetch()`, any npm package, `process.env` for secrets, etc. The SDK handles durability; your step code is just TypeScript.

```typescript
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

async function myWorkflow() {
  const data = await SolidActions.runStep(() => fetchData("https://api.example.com"), {
    name: "fetchData"
  });
}
```

If a workflow is interrupted, it automatically resumes from the last completed step. Step results are cached in the database.

### Step Retries

Configure automatic retries with exponential backoff:

```typescript
const result = await SolidActions.runStep(() => unreliableOperation(), {
  name: "unreliableOp",
  retriesAllowed: true,
  maxAttempts: 5,           // Default: 3
  intervalSeconds: 1,       // Initial delay (default: 1)
  backoffRate: 2,           // Multiplier per retry (default: 2)
});
```

### Durable Sleep

```typescript
await SolidActions.sleep(durationMs);
```

Sleep is durable — the wakeup time is saved in the database. The container exits during sleep and resumes when the timer expires. Works for any duration (seconds to months).

### Starting Child Workflows

```typescript
const handle = await SolidActions.startWorkflow(childWorkflow)(childInput);
const result = await handle.getResult();
```

You can set workflow ID and timeout:

```typescript
const handle = await SolidActions.startWorkflow(childWorkflow, {
  workflowID: "custom-id",
  timeoutMS: 30000
})(childInput);
```

### Workflow Messaging — send() / recv()

Send messages between workflows for async coordination:

```typescript
// Sender: send a message to another workflow
await SolidActions.send(destinationWorkflowID, messagePayload, "topic-name");

// Receiver: wait for a message
const message = await SolidActions.recv<MessageType>("topic-name", timeoutSeconds);
// Returns null on timeout
```

The container exits during `recv()` and resumes when a message arrives or timeout expires.

### External Signals — getSignalUrls()

Generate approve/reject URLs for human-in-the-loop workflows. This is **synchronous** (no await):

```typescript
const urls = SolidActions.getSignalUrls('approval');
// urls has: { base, approve, reject, custom: (action: string) => string }
// Send approve/reject URLs to a human (via email, Slack, etc.)
// When they click one, the workflow resumes

const signal = await SolidActions.recv<{ choice: string; reason?: string }>('approval', 3600);
```

### Events — setEvent() / getEvent()

Publish key-value pairs from a workflow for external consumers:

```typescript
// Inside a workflow: publish progress
await SolidActions.setEvent("progress", { percent: 50, status: "processing" });

// From anywhere: read the latest event value
const progress = await SolidActions.getEvent<ProgressType>(workflowID, "progress", timeoutSeconds);
```

### Streaming — writeStream() / readStream() / closeStream()

Stream data in real time from workflows to clients. Useful for LLM streaming, progress reporting, or long-running result feeds.

```typescript
// Write a value to a stream (from workflows or steps)
await SolidActions.writeStream("progress", { step: i, result });

// Close a stream when done
await SolidActions.closeStream("progress");

// Read a stream (from anywhere)
for await (const value of SolidActions.readStream(workflowID, "progress")) {
  console.log(value);
}
```

Streams are append-only. Writes from a workflow happen exactly-once. Streams are automatically closed when the workflow terminates.

### Webhook Response — respond()

In wait-mode webhook workflows, send an explicit response before the workflow finishes:

```typescript
// Process data in a step first
const result = await SolidActions.runStep(() => processData(input), { name: "process" });

// Send response to webhook caller (must be between steps, not inside runStep)
await SolidActions.respond({ status: "ok", data: result });

// Continue with more work — webhook caller already has their response
await SolidActions.runStep(() => cleanup(), { name: "cleanup" });
```

### Parallel Execution

Use `Promise.allSettled()` with steps started in deterministic order:

```typescript
const results = await Promise.allSettled([
  SolidActions.runStep(() => taskA(), { name: "taskA" }),
  SolidActions.runStep(() => taskB(), { name: "taskB" }),
  SolidActions.runStep(() => taskC(), { name: "taskC" }),
]);
```

Do NOT use `Promise.all()` — it can crash Node.js on multiple rejections. For complex parallel work, use child workflows instead.

### Deterministic Helpers

Use these instead of their non-deterministic counterparts inside workflows:

```typescript
// Instead of Date.now()
const timestamp = await SolidActions.now();

// Instead of crypto.randomUUID()
const uuid = await SolidActions.randomUUID();

// Read workflow input (from WORKFLOW_INPUT env var)
const input = SolidActions.getInput<MyInputType>();
```

### Workflow Context Variables

```typescript
SolidActions.workflowID   // Current workflow's ID
SolidActions.stepID       // Current step's ID
SolidActions.stepStatus   // Current step's status (attempt info)
```

### Workflow Handle Methods

```typescript
const handle = await SolidActions.startWorkflow(myWorkflow)(input);

handle.workflowID       // Get the workflow's ID
await handle.getResult() // Wait for completion and get result
await handle.getStatus() // Get current WorkflowStatus
```

### Workflow Management

```typescript
// List workflows matching criteria
await SolidActions.listWorkflows({ workflowName: "my-workflow", status: "SUCCESS" });

// Retrieve a handle by ID
const handle = await SolidActions.retrieveWorkflow(workflowID);

// Cancel a workflow
await SolidActions.cancelWorkflow(workflowID);

// Resume a cancelled workflow
await SolidActions.resumeWorkflow(workflowID);

// Fork from a specific step
await SolidActions.forkWorkflow(workflowID, startStep);
```

### Logging

Always use SolidActions logger:

```typescript
SolidActions.logger.info("Processing started");
SolidActions.logger.error(`Error: ${(error as Error).message}`);
```

### Configuration

Platform workflows auto-configure from environment variables — no manual config needed with `SolidActions.run()`.

```typescript
interface SolidActionsConfig {
  name?: string;
  api?: {
    url: string;
    key: string;
    timeout?: number;
    maxRetries?: number;
  };
  enableOTLP?: boolean;
  logLevel?: string;
  runAdminServer?: boolean;
  adminPort?: number;
  applicationVersion?: string;
}
```

There is no `systemDatabaseUrl`. The SDK communicates with the SolidActions platform via HTTP API (`api.url` and `api.key`).

---

## Critical SDK Rules & Gotchas

1. **Determinism rules**: Never use `fetch()`, file system access (`fs`), or `Math.random()` directly in workflow functions. These are non-deterministic. All side effects must happen inside `SolidActions.runStep()` callbacks.
2. **Parallel execution**: Use `Promise.allSettled()` instead of `Promise.all()` for parallel steps. `Promise.all` rejects immediately on first failure, leaving other step promises unresolved.
3. **Deterministic timestamps**: Use `SolidActions.now()` instead of `Date.now()` or `new Date()`. Workflow replay requires deterministic timestamps.
4. **Deterministic UUIDs**: Use `SolidActions.randomUUID()` instead of `crypto.randomUUID()`. Same reason - replay determinism.
5. **Step retry config**: Steps support retry configuration with flat options: `{ retriesAllowed: true, maxAttempts: 3, intervalSeconds: 1, backoffRate: 2 }`. Configure based on the step's idempotency and expected failure modes.
6. **Messaging topics**: `send()` and `recv()` messages without a topic are in a separate channel from messages with topics. Don't mix them expecting they'll be received on the same channel.
7. **Error handling**: `SolidActionsMaxStepRetriesError` has an `.errors` array containing the error from each retry attempt. Access it for debugging which attempts failed and why.

---

## Workflow Rules

1. **Workflows must be deterministic.** Same inputs must produce the same step calls in the same order.
2. **All non-deterministic operations go in steps.** API calls, file I/O, random numbers, timestamps.
3. **Use `SolidActions.now()` and `SolidActions.randomUUID()`** instead of `Date.now()` and `crypto.randomUUID()` inside workflows.
4. **Do NOT call context methods inside steps.** `send`, `recv`, `sleep`, `setEvent`, `getEvent`, `startWorkflow`, `respond` must be called from the workflow function, not inside `runStep()`.
5. **Do NOT start workflows from inside a step.**
6. **Do NOT use `Promise.all()`.** Use `Promise.allSettled()` for parallel steps.
7. **Steps should not have side effects outside their scope.** They can read globals but should not mutate them.
8. **Internal workflows do NOT call `SolidActions.run()`.** Only export the registered workflow.
9. **Scheduling is YAML-only.** Configure cron in `solidactions.yaml`, not in code.
10. **Inputs/outputs must be JSON-serializable.**

---

## SolidActions CLI Reference

### Installation

```bash
npm install -g @solidactions/cli
```

### Authentication

```bash
# Initialize with API key (get from SolidActions UI)
solidactions init <api-key>

# Check current auth
solidactions whoami

# Remove credentials
solidactions logout
```

### Deploying Projects

```bash
# Deploy from current directory
solidactions deploy my-project

# Deploy from a specific path (recommended to avoid deploying wrong directory)
solidactions deploy my-project ./path/to/project

# Deploy to staging or production
solidactions deploy my-project ./path/to/project --env staging --create
solidactions deploy my-project ./path/to/project --env production
```

The `[path]` argument is optional (defaults to current directory), but specifying it is recommended to avoid accidentally deploying a large directory.

Each project folder is deployed independently. Imports/references are intra-project only. Cross-project communication uses webhooks or messaging.

### Webhooks

```bash
# List webhook URLs for a project
solidactions webhooks my-project

# List webhooks for a specific environment
solidactions webhooks my-project --env staging

# Show webhook secrets
solidactions webhooks my-project --show-secrets
```

### Local Development

```bash
# Run a workflow locally (no deploy, no auth, no backend needed)
solidactions dev src/my-workflow.ts
solidactions dev src/my-workflow.ts -i '{"key": "value"}'
```

Requires `@solidactions/sdk` v0.2.0+ installed in the project.

### Running Workflows

```bash
# Trigger a workflow
solidactions run my-project my-workflow

# With JSON input
solidactions run my-project my-workflow -i '{"name": "Alice"}'

# Wait for completion
solidactions run my-project my-workflow -w
```

### Viewing Runs and Logs

```bash
# List recent runs
solidactions runs my-project

# View logs for a run
solidactions logs <run-id>

# Follow logs in real-time
solidactions logs <run-id> -f

# View build/deploy logs
solidactions logs:build my-project
```

### Environment Variables

```bash
# Create a global variable
solidactions env:create MY_VAR "my-value"

# Create a secret (hidden in listings)
solidactions env:create API_KEY "secret123" --secret

# Create with per-environment values
solidactions env:create DB_URL "prod-url" --staging-value "staging-url" --dev-value "dev-url"

# Create with environment inheritance
solidactions env:create MY_VAR "prod-value" --staging-inherit --dev-inherit-staging

# List global variables
solidactions env:list

# List project variable mappings
solidactions env:list my-project

# List for a specific environment
solidactions env:list my-project --env staging

# Map a global variable to a project key
solidactions env:map my-project LOCAL_NAME GLOBAL_KEY

# Pull env vars for local development (includes fresh OAuth tokens)
solidactions env:pull my-project
solidactions env:pull my-project --env staging
solidactions env:pull my-project --env staging --output .env.staging

# Quick refresh of only OAuth tokens (merges into existing .env)
solidactions env:pull my-project --update-oauth

# Push .env values to a project
solidactions env:push my-project
solidactions env:push my-project ./my-app --env production
solidactions env:push my-project --new-only       # Only push new/empty vars
solidactions env:push my-project --include-undeclared  # Push all vars, even if not in YAML

# Delete a variable
solidactions env:delete MY_VAR --yes
solidactions env:delete my-project MY_VAR --yes
```

### Schedules

```bash
# Set a cron schedule
solidactions schedule:set my-project "0 9 * * *" --workflow my-workflow

# Set with JSON input
solidactions schedule:set my-project "0 9 * * *" --workflow my-workflow -i '{"key": "value"}'

# List schedules
solidactions schedule:list my-project

# Delete a schedule
solidactions schedule:delete my-project <schedule-id> --yes
```

### Download Project Source

```bash
solidactions pull my-project ./backup
```

---

## Multi-Environment Deployment

SolidActions supports three environments: **dev** (default), **staging**, and **production**.

```bash
# Deploy to dev (default)
solidactions deploy my-project ./path/to/project

# Deploy to staging (creates project if --create flag)
solidactions deploy my-project ./path/to/project --env staging --create

# Deploy to production
solidactions deploy my-project ./path/to/project --env production
```

### Environment Variable Inheritance

Global variables can have per-environment values with an inheritance chain:

| Environment | Resolution |
|-------------|-----------|
| **Production** | Uses production value directly (required) |
| **Staging** | Uses staging value if set, otherwise inherits from production |
| **Dev** | Uses dev value if set, otherwise inherits from staging or production |

Variables are resolved at runtime and injected into the Docker container. Workflow code accesses them via `process.env`.

---

## Development Workflow

### Phase 1: Setup

1. Create a new project folder
2. Copy CLAUDE.md (this file) into the project or parent directory
3. Install the CLI: `npm install -g @solidactions/cli`
4. Get your API key from the SolidActions UI
5. Initialize: `solidactions init <api-key>`

### Phase 2: Develop

1. Create `package.json`, `tsconfig.json`, `solidactions.yaml` following the templates above
2. Run `npm install` to install dependencies
3. Write workflow files in `src/`
4. Create `.env` with your `SOLIDACTIONS_API_KEY` for local testing

### Phase 3: Test Locally

Run workflows locally without deploying using the `dev` command:

```bash
# Run a workflow with the in-memory mock server (no deploy needed)
solidactions dev src/my-workflow.ts -i '{"key": "value"}'
```

This starts an in-memory mock server that implements the full SolidActions API, so all step execution works normally. Use this for fast iteration on workflow logic.

To use real OAuth tokens locally, run `solidactions env:pull my-project` first. The `.env` file will contain fresh access tokens that your workflow can access via `process.env`. Re-run with `--update-oauth` when tokens expire.

**What works locally:** Sequential & parallel steps, child workflows, events, streams, retries.

**What doesn't (no-ops locally):** Durable sleep scheduler wakeups, cross-process messaging, tenant env var injection.

### Phase 4: Deploy & Test on Platform

1. Deploy to dev (default): `solidactions deploy my-project`
2. Push env vars from local `.env`: `solidactions env:push my-project`
3. Test: `solidactions run my-project my-workflow -i '{"key": "value"}' -w`
4. Check logs: `solidactions runs my-project` then `solidactions logs <run-id>`

### Phase 5: Deploy to Production

1. Set up production env vars in SolidActions UI or CLI
2. Deploy: `solidactions deploy my-project --env production`
3. Verify in SolidActions UI

---

## Common Patterns

### Basic Multi-Step Workflow

```typescript
import { SolidActions } from "@solidactions/sdk";

interface Input { name: string }
interface Output { greeting: string; timestamp: number }

async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

async function getTimestamp(): Promise<number> {
  return Date.now();
}

async function helloWorkflow(input: Input): Promise<Output> {
  const greeting = await SolidActions.runStep(() => greet(input.name), { name: "greet" });
  const timestamp = await SolidActions.runStep(() => getTimestamp(), { name: "getTimestamp" });
  return { greeting, timestamp };
}

const workflow = SolidActions.registerWorkflow(helloWorkflow, { name: "hello" });
SolidActions.run(workflow);
```

### Parent-Child Pattern

```typescript
// child.ts — trigger: internal
import { SolidActions } from "@solidactions/sdk";

async function childFunction(input: { value: number }): Promise<{ result: number }> {
  const doubled = await SolidActions.runStep(() => ({ result: input.value * 2 }), { name: "double" });
  return doubled;
}

export const childWorkflow = SolidActions.registerWorkflow(childFunction, { name: "child" });
// NOTE: No SolidActions.run() — this is an internal workflow

// parent.ts — trigger: webhook
import { SolidActions } from "@solidactions/sdk";
import { childWorkflow } from './child.js';

async function parentFunction(input: { value: number }): Promise<{ result: number }> {
  const handle = await SolidActions.startWorkflow(childWorkflow)(input);
  const childResult = await handle.getResult();
  return childResult;
}

const parentWorkflow = SolidActions.registerWorkflow(parentFunction, { name: "parent" });
SolidActions.run(parentWorkflow);
```

### Messaging Pattern (Two Workflows, One Project)

```typescript
// sender.ts — trigger: internal
import { SolidActions } from "@solidactions/sdk";

interface SenderInput { callbackWorkflowId: string; data: string }

async function senderFunction(input: SenderInput): Promise<void> {
  const result = await SolidActions.runStep(() => processData(input.data), { name: "process" });
  await SolidActions.send(input.callbackWorkflowId, result, "task-result");
}

export const messageSender = SolidActions.registerWorkflow(senderFunction, { name: "sender" });
// No SolidActions.run() — internal workflow

// receiver.ts — trigger: webhook
import { SolidActions } from "@solidactions/sdk";
import { messageSender } from './sender.js';

async function receiverFunction(input: { data: string }): Promise<any> {
  const senderInput = { callbackWorkflowId: SolidActions.workflowID!, data: input.data };
  await SolidActions.startWorkflow(messageSender)(senderInput);
  const result = await SolidActions.recv("task-result", 300);
  return result;
}

const receiverWorkflow = SolidActions.registerWorkflow(receiverFunction, { name: "receiver" });
SolidActions.run(receiverWorkflow);
```

### Approval/Signal Pattern

```typescript
import { SolidActions } from "@solidactions/sdk";

async function approvalWorkflow(input: { requestId: string }): Promise<{ approved: boolean }> {
  await SolidActions.runStep(() => createRequest(input), { name: "createRequest" });

  // getSignalUrls is synchronous — no await needed
  const urls = SolidActions.getSignalUrls('approval');
  // Send approve/reject URLs to approver (email, Slack, etc.)
  await SolidActions.runStep(() => notifyApprover(urls.approve, urls.reject), { name: "notify" });

  // Container exits here, resumes when signal arrives
  const signal = await SolidActions.recv<{ choice: string; reason?: string }>('approval', 86400);

  if (!signal) return { approved: false }; // Timeout
  return { approved: signal.choice === 'approve' };
}
```


<!-- CLAVIX:START -->
## Clavix Integration

This project uses Clavix for prompt improvement and PRD generation. The following slash commands are available:

> **Command Format:** Commands shown with colon (`:`) format. Some tools use hyphen (`-`): Claude Code uses `/clavix:improve`, Cursor uses `/clavix-improve`. Your tool autocompletes the correct format.

### Prompt Optimization

#### /clavix:improve [prompt]
Optimize prompts with smart depth auto-selection. Clavix analyzes your prompt quality and automatically selects the appropriate depth (standard or comprehensive). Use for all prompt optimization needs.

### PRD & Planning

#### /clavix:prd
Launch the PRD generation workflow. Clavix will guide you through strategic questions and generate both a comprehensive PRD and a quick-reference version optimized for AI consumption.

#### /clavix:plan
Generate an optimized implementation task breakdown from your PRD. Creates a phased task plan with dependencies and priorities.

#### /clavix:implement
Execute tasks or prompts with AI assistance. Auto-detects source: tasks.md (from PRD workflow) or prompts/ (from improve workflow). Supports automatic git commits and progress tracking.

Use `--latest` to implement most recent prompt, `--tasks` to force task mode.

### Session Management

#### /clavix:start
Enter conversational mode for iterative prompt development. Discuss your requirements naturally, and later use `/clavix:summarize` to extract an optimized prompt.

#### /clavix:summarize
Analyze the current conversation and extract key requirements into a structured prompt and mini-PRD.

### Refinement

#### /clavix:refine
Refine existing PRD or prompt through continued discussion. Detects available PRDs and saved prompts, then guides you through updating them with tracked changes.

### Agentic Utilities

These utilities provide structured workflows for common tasks. Invoke them using the slash commands below:

- **Verify** (`/clavix:verify`): Check implementation against PRD requirements. Runs automated validation and generates pass/fail reports.
- **Archive** (`/clavix:archive`): Archive completed work. Moves finished PRDs and outputs to archive for future reference.

**When to use which mode:**
- **Improve mode** (`/clavix:improve`): Smart prompt optimization with auto-depth selection
- **PRD mode** (`/clavix:prd`): Strategic planning with architecture and business impact

**Recommended Workflow:**
1. Start with `/clavix:prd` or `/clavix:start` for complex features
2. Refine requirements with `/clavix:refine` as needed
3. Generate tasks with `/clavix:plan`
4. Implement with `/clavix:implement`
5. Verify with `/clavix:verify`
6. Archive when complete with `/clavix:archive`

**Pro tip**: Start complex features with `/clavix:prd` or `/clavix:start` to ensure clear requirements before implementation.
<!-- CLAVIX:END -->
